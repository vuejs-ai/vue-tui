import assert from "node:assert/strict";
import stringWidth from "string-width";
import { computed, defineComponent, nextTick, shallowReactive, shallowRef } from "vue";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import { Box, Text, useApp, useInput, useLayoutWidth, useViewportHeight } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { useStderr } from "../../runtime/dist/internal.mjs";
import { useStdout } from "../../runtime/dist/internal.mjs";
import type { CoordinatedWriteResult } from "../../runtime/dist/internal.mjs";
import {
  assertResourcesReleased,
  mountCapacityHost,
  mountSlowCapacityHost,
  slowCapacityWritableContract,
  type CapacityBackpressureSnapshot,
  type CapacityHost,
  type CapacityResourceSnapshot,
  type CapacityYogaLifecycle,
} from "./host.ts";
export {
  auditCapacityLeakCohort,
  beginCapacityLeakCohort,
  calibrateCapacityLeakProbe,
  takeCapacityLeakCohort,
} from "./leak-probe.ts";
import { startHeartbeat } from "./metrics.ts";

export const capacityManifest = Object.freeze({
  j1: Object.freeze({
    columns: 100,
    rows: 30,
    completedRecords: 500,
    semanticLinesPerRecord: 2,
    tokenUpdates: 240,
    approvals: 2,
    resizes: 2,
    suspensions: 1,
    coordinatedStdout: 1,
    coordinatedStderr: 1,
  }),
  j2: Object.freeze({
    columns: 100,
    rows: 30,
    candidates: 2_000,
    maximumVisibleRows: 28,
    queryEdits: 6,
    navigationActions: 200,
    accepts: 1,
    cancels: 1,
  }),
  j3: Object.freeze({
    columns: 100,
    rows: 30,
    documentLines: 500,
    cellsPerLine: 72,
    scrollActions: 200,
    selectionMoves: 100,
    rangeUpdates: 1,
    copies: 1,
  }),
  j4: Object.freeze({
    columns: 120,
    rows: 40,
    metricRows: 120,
    columnsPerMetric: 6,
    sparseUpdates: 300,
    quitActions: 1,
  }),
  j5: Object.freeze({
    columns: 120,
    rows: 40,
    panes: 4,
    rowsPerPane: 100,
    sparseUpdates: 200,
    focusActions: 100,
    scrollActions: 40,
    dividerMoves: 20,
    overlayCycles: 1,
  }),
  j6i: Object.freeze({
    columns: 100,
    rows: 30,
    volumes: Object.freeze({
      small: Object.freeze({ completedRecords: 100, liveUpdates: 200 }),
      large: Object.freeze({ completedRecords: 1_000, liveUpdates: 2_000 }),
    }),
    coordinatedEvery: 10,
    coordinatedRecordBytes: 1_024,
    producerTurnMs: 1,
    maxFps: 0,
    highWaterMarkBytes: slowCapacityWritableContract.highWaterMarkBytes,
    firstBackpressureCallbackMs: slowCapacityWritableContract.firstBackpressureCallbackMs,
    laterCallbackMs: slowCapacityWritableContract.laterCallbackMs,
    repetitions: 5,
  }),
  j6f: Object.freeze({
    columns: 120,
    rows: 40,
    metricRows: 120,
    columnsPerMetric: 6,
    volumes: Object.freeze({
      small: Object.freeze({ sparseUpdates: 200 }),
      large: Object.freeze({ sparseUpdates: 2_000 }),
    }),
    coordinatedEvery: 10,
    coordinatedRecordBytes: 1_024,
    producerTurnMs: 1,
    maxFps: 0,
    highWaterMarkBytes: slowCapacityWritableContract.highWaterMarkBytes,
    firstBackpressureCallbackMs: slowCapacityWritableContract.firstBackpressureCallbackMs,
    laterCallbackMs: slowCapacityWritableContract.laterCallbackMs,
    repetitions: 5,
  }),
});

export type CapacityJourneyId = keyof typeof capacityManifest;
export type CapacityVolume = "small" | "large";

export interface CapacityBackpressureExecution extends CapacityBackpressureSnapshot {
  readonly coordinatedRecords: number;
  readonly coordinatedAcceptedWritable: number;
  readonly coordinatedAcceptedBackpressured: number;
  readonly coordinatedBlocked: number;
  readonly maximumPreparedFrames: number;
  readonly maximumLifecycleTransactions: number;
  readonly maximumSchedulerTimers: number;
  readonly maximumStreamListeners: number;
  readonly maximumSynchronizedOutputLeases: number;
  readonly maximumStreamReservations: number;
}

export interface JourneyExecution {
  readonly journey: CapacityJourneyId;
  readonly volume?: CapacityVolume;
  readonly actionLatencies: readonly number[];
  readonly renderDurations: readonly number[];
  readonly heartbeatExcess: readonly number[];
  readonly assertionCount: number;
  readonly resources: CapacityResourceSnapshot;
  readonly yoga: CapacityYogaLifecycle;
  readonly output: {
    readonly stdoutWrites: number;
    readonly stdoutBytes: number;
    readonly maximumStdoutWriteBytes: number;
    readonly stderrWrites: number;
    readonly stderrBytes: number;
  };
  readonly backpressure?: CapacityBackpressureExecution;
}

async function recordVisible(samples: number[], operation: () => Promise<unknown>): Promise<void> {
  const start = performance.now();
  await operation();
  samples.push(performance.now() - start);
}

function occurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

async function finish(
  journey: CapacityJourneyId,
  host: CapacityHost,
  latencies: number[],
  renderDurations: number[],
  heartbeat: ReturnType<typeof startHeartbeat>,
  assertionCount: number,
  options?: {
    readonly volume?: CapacityVolume;
    readonly backpressure?: Omit<CapacityBackpressureExecution, keyof CapacityBackpressureSnapshot>;
  },
): Promise<JourneyExecution> {
  heartbeat.stop();
  const final = await host.dispose();
  assertResourcesReleased(final.resources);
  assert.equal(host.rawMode.current, false, "raw mode must restore after the workload");
  assert.equal(final.screen.activeBuffer, "normal", "teardown must return to the normal buffer");
  assert.equal(final.screen.cursorVisible, true, "teardown must restore the terminal cursor");
  assert.equal(final.yoga.created, final.yoga.freed, "every created Yoga node must be freed");
  assert.equal(
    final.yoga.liveAfter,
    final.yoga.liveBefore,
    "Yoga live nodes must return to baseline",
  );
  const stdoutWriteBytes = host.writes.stdout.map((write) => Buffer.byteLength(write));
  const stderrWriteBytes = host.writes.stderr.map((write) => Buffer.byteLength(write));
  const backpressure = host.backpressure?.snapshot();
  return Object.freeze({
    journey,
    ...(options?.volume === undefined ? {} : { volume: options.volume }),
    actionLatencies: Object.freeze([...latencies]),
    renderDurations: Object.freeze([...renderDurations]),
    heartbeatExcess: Object.freeze(heartbeat.samples.map((sample) => sample.excessDelay)),
    assertionCount: assertionCount + 6,
    resources: final.resources,
    yoga: final.yoga,
    output: Object.freeze({
      stdoutWrites: stdoutWriteBytes.length,
      stdoutBytes: stdoutWriteBytes.reduce((total, bytes) => total + bytes, 0),
      maximumStdoutWriteBytes: Math.max(0, ...stdoutWriteBytes),
      stderrWrites: stderrWriteBytes.length,
      stderrBytes: stderrWriteBytes.reduce((total, bytes) => total + bytes, 0),
    }),
    ...(backpressure && options?.backpressure
      ? {
          backpressure: Object.freeze({ ...backpressure, ...options.backpressure }),
        }
      : {}),
  });
}

interface J1Record {
  readonly id: number;
  readonly marker: string;
}

async function runJ1(maxFps: number): Promise<JourneyExecution> {
  const records = shallowRef<J1Record[]>([]);
  const tokenCount = shallowRef(0);
  const approval = shallowRef<"closed" | "accept" | "reject">("closed");
  const approvalResult = shallowRef<"none" | "accepted" | "rejected">("none");
  const sequence = shallowRef(0);
  let writeStdout!: (data: string) => void;
  let writeStderr!: (data: string) => void;
  let exit!: () => void;

  const marker = (): string =>
    `__J1__ seq=${sequence.value} records=${records.value.length} tokens=${tokenCount.value} approval=${approval.value} result=${approvalResult.value}`;

  const App = defineComponent(() => {
    writeStdout = useStdout().write;
    writeStderr = useStderr().write;
    exit = useApp().exit;

    // The approval overlay owns input by application state. Runtime only
    // supplies normalized facts; no renderer-owned focus policy is required.
    useInput((event) => {
      if (
        approval.value === "closed" &&
        event.kind === "text" &&
        (event.text === "a" || event.text === "r")
      ) {
        approval.value = event.text === "a" ? "accept" : "reject";
      } else if (approval.value === "accept" && event.kind === "key" && event.name === "enter") {
        approvalResult.value = "accepted";
        approval.value = "closed";
      } else if (approval.value === "reject" && event.kind === "key" && event.name === "escape") {
        approvalResult.value = "rejected";
        approval.value = "closed";
      } else {
        return;
      }
      sequence.value++;
    });

    return () => (
      <Box width="100%" flexDirection="column">
        {records.value.map((item) => (
          <Static key={item.id}>
            <Text>{`${item.marker} request\nanswer ${item.id.toString().padStart(3, "0")}`}</Text>
          </Static>
        ))}
        <Text>{marker()}</Text>
        <Text>{`response ${"x".repeat(tokenCount.value)}`}</Text>
        {approval.value === "closed" ? null : (
          <Box>
            <Text>{`approval ${approval.value}`}</Text>
          </Box>
        )}
        <Box>
          <Text>{approval.value === "closed" ? "> composer" : "  composer"}</Text>
        </Box>
      </Box>
    );
  });

  const renderDurations: number[] = [];
  const host = await mountCapacityHost(App, {
    columns: capacityManifest.j1.columns,
    rows: capacityManifest.j1.rows,
    mode: "inline",
    maxFps,
    onRender: (duration) => renderDurations.push(duration),
  });
  const heartbeat = startHeartbeat();
  let assertions = 0;
  try {
    assert.equal(approval.value, "closed");
    assertions++;
    for (let id = 0; id < capacityManifest.j1.completedRecords; id++) {
      const record = Object.freeze({ id, marker: `J1-REC-${id.toString().padStart(3, "0")}` });
      const previous = records.value;
      records.value = [...previous, record];
      sequence.value++;
      await host.flush(`records=${id + 1}`);
      assert.equal(records.value[id], record);
      assertions++;
    }
    for (let token = 1; token <= capacityManifest.j1.tokenUpdates; token++) {
      tokenCount.value = token;
      sequence.value++;
      await host.flush(`tokens=${token}`);
    }

    await host.input("a", "approval=accept");
    assert.equal(approval.value, "accept");
    await host.input("\r", "result=accepted");
    assert.equal(approval.value, "closed");
    await host.input("r", "approval=reject");
    assert.equal(approval.value, "reject");
    await host.input("\x1b", "result=rejected");
    assert.equal(approval.value, "closed");
    assertions += 5;

    await host.resize(72, 20, "result=rejected");
    await host.resize(100, 30, "result=rejected");
    await host.suspend();
    await host.resume("result=rejected");
    assert.equal(approval.value, "closed");
    assertions++;

    writeStdout("J1-COORDINATED-STDOUT\n");
    await host.flush("J1-COORDINATED-STDOUT");
    writeStderr("J1-COORDINATED-STDERR\n");
    await host.flush("J1-COORDINATED-STDERR");

    const screen = await host.screen();
    assert.equal(occurrences(screen.text, "PRE_APP_HISTORY"), 1);
    assert.equal(occurrences(screen.text, "J1-COORDINATED-STDOUT"), 1);
    assert.equal(occurrences(screen.text, "J1-COORDINATED-STDERR"), 1);
    for (let id = 0; id < records.value.length; id++) {
      assert.equal(occurrences(screen.text, records.value[id]!.marker), 1);
    }
    assertions += records.value.length + 3;
    exit();
    await host.app.waitUntilExit();
  } catch (error) {
    heartbeat.stop();
    try {
      await host.dispose();
    } catch {}
    throw error;
  }
  return finish("j1", host, [], renderDurations, heartbeat, assertions);
}

interface Candidate {
  readonly id: string;
  readonly label: string;
}

async function runJ2(maxFps: number): Promise<JourneyExecution> {
  const candidates = Object.freeze(
    Array.from({ length: capacityManifest.j2.candidates }, (_, index) =>
      Object.freeze({
        id: `candidate-${index.toString().padStart(4, "0")}`,
        label:
          index % 5 === 0
            ? `vuejs/vite-plugin-${index.toString().padStart(4, "0")}`
            : `owner-${index.toString().padStart(4, "0")}/library-${index.toString().padStart(4, "0")}`,
      }),
    ),
  );
  const query = shallowRef("");
  const active = shallowRef(27);
  const phase = shallowRef<"open" | "accepted" | "cancelled">("open");
  const accepted = shallowRef<Candidate[]>([]);
  const sequence = shallowRef(0);
  const filtered = computed(() =>
    candidates.filter((candidate) => candidate.label.includes(query.value)),
  );
  const windowStart = computed(() =>
    Math.max(0, Math.min(active.value - 27, filtered.value.length - 28)),
  );
  const visible = computed(() =>
    filtered.value.slice(
      windowStart.value,
      windowStart.value + capacityManifest.j2.maximumVisibleRows,
    ),
  );
  let exit!: () => void;
  const marker = (): string =>
    `__J2__ seq=${sequence.value} query=${query.value || "-"} count=${filtered.value.length} active=${active.value} start=${windowStart.value} phase=${phase.value}`;

  const App = defineComponent(() => {
    exit = useApp().exit;
    useInput((event) => {
      if (phase.value !== "open") return;
      if (event.kind === "text" && /^[a-z]$/.test(event.text)) {
        query.value += event.text;
      } else if (event.kind === "key" && event.name === "backspace") {
        query.value = query.value.slice(0, -1);
      } else if (event.kind === "key" && event.name === "down") {
        active.value = Math.min(filtered.value.length - 1, active.value + 1);
      } else if (event.kind === "key" && event.name === "up") {
        active.value = Math.max(0, active.value - 1);
      } else if (event.kind === "key" && event.name === "enter") {
        const selected = filtered.value[active.value];
        if (selected) accepted.value = [...accepted.value, selected];
        phase.value = "accepted";
      } else if (
        event.kind === "key" &&
        event.character === "c" &&
        event.ctrl &&
        !event.alt &&
        !event.shift
      ) {
        phase.value = "cancelled";
        sequence.value++;
        return { preventDefault: true };
      } else {
        return;
      }
      sequence.value++;
    });
    return () => (
      <Box width={100} height={30} flexDirection="column">
        {accepted.value.map((item) => (
          <Static key={item.id}>
            <Text>{`accepted ${item.id}`}</Text>
          </Static>
        ))}
        <Text>{marker()}</Text>
        <Text>{`query ${query.value}`}</Text>
        {visible.value.map((candidate, offset) => {
          const index = windowStart.value + offset;
          return (
            <Text
              key={candidate.id}
            >{`${index === active.value ? ">" : " "} ${candidate.id} ${candidate.label}`}</Text>
          );
        })}
      </Box>
    );
  });

  const latencies: number[] = [];
  const renderDurations: number[] = [];
  const host = await mountCapacityHost(App, {
    columns: capacityManifest.j2.columns,
    rows: capacityManifest.j2.rows,
    mode: "inline",
    maxFps,
    onRender: (duration) => renderDurations.push(duration),
  });
  const heartbeat = startHeartbeat();
  let assertions = 0;
  try {
    for (const input of ["v", "i", "t", "e", "\x7f", "e"]) {
      await recordVisible(latencies, () => host.input(input, `seq=${sequence.value + 1}`));
      assert.ok(visible.value.length <= capacityManifest.j2.maximumVisibleRows);
      assertions++;
    }
    assert.equal(query.value, "vite");
    assertions++;
    for (let action = 0; action < capacityManifest.j2.navigationActions; action++) {
      const down = action % 2 === 0;
      await recordVisible(latencies, () =>
        host.input(down ? "\x1b[B" : "\x1b[A", `seq=${sequence.value + 1}`),
      );
      assert.equal(active.value, down ? 28 : 27);
      assert.equal(windowStart.value, down ? 1 : 0);
      assert.equal(visible.value.length, 28);
      assertions += 3;
    }
    const acceptedCandidate = filtered.value[active.value]!;
    await recordVisible(latencies, () => host.input("\r", "phase=accepted"));
    assert.equal(accepted.value[0], acceptedCandidate);
    assert.equal(
      occurrences((host.writes.stdout as string[]).join(""), `accepted ${acceptedCandidate.id}`),
      1,
    );
    assertions += 2;

    phase.value = "open";
    sequence.value++;
    await host.flush("phase=open");
    await recordVisible(latencies, () => host.input("\x03", "phase=cancelled"));
    assert.equal(accepted.value.length, 1);
    assertions++;
    const screen = await host.screen();
    assert.equal(occurrences(screen.text, "PRE_APP_HISTORY"), 1);
    assertions++;
    exit();
    await host.app.waitUntilExit();
  } catch (error) {
    heartbeat.stop();
    try {
      await host.dispose();
    } catch {}
    throw error;
  }
  return finish("j2", host, latencies, renderDurations, heartbeat, assertions);
}

async function runJ3(maxFps: number): Promise<JourneyExecution> {
  const pattern = "A你e\u0301👩‍💻";
  const lines = Object.freeze(
    Array.from(
      { length: capacityManifest.j3.documentLines },
      (_, index) => `L${index.toString().padStart(3, "0")} ${pattern.repeat(11)}.`,
    ),
  );
  for (const line of lines) assert.equal(stringWidth(line), capacityManifest.j3.cellsPerLine);
  const document = lines.join("\n");
  const scroll = shallowRef<ScrollBoxExpose | null>(null);
  const scrollTop = shallowRef(0);
  const sequence = shallowRef(0);
  const copyStatus = shallowRef("none");
  const clipboardRequests: string[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const boundaries = [...segmenter.segment(document)].map((part) => part.index);
  boundaries.push(document.length);
  let anchorIndex = 0;
  let extentIndex = 0;
  let exit!: () => void;
  const range = (): string => `${boundaries[anchorIndex]}:${boundaries[extentIndex]}`;
  const selectedText = (): string => {
    const start = boundaries[Math.min(anchorIndex, extentIndex)]!;
    const end = boundaries[Math.max(anchorIndex, extentIndex)]!;
    return document.slice(start, end);
  };
  const moveSelection = (
    direction: "backward" | "forward" | "up" | "down" | "document-start",
    extend = false,
  ): boolean => {
    const lineStep = capacityManifest.j3.cellsPerLine;
    const next =
      direction === "document-start"
        ? 0
        : direction === "forward"
          ? extentIndex + 1
          : direction === "backward"
            ? extentIndex - 1
            : direction === "down"
              ? extentIndex + lineStep
              : extentIndex - lineStep;
    extentIndex = Math.max(0, Math.min(boundaries.length - 1, next));
    if (!extend) anchorIndex = extentIndex;
    return true;
  };
  const marker = (): string =>
    `__J3__ seq=${sequence.value} top=${scrollTop.value} range=${range()} copy=${copyStatus.value}`;

  const App = defineComponent(() => {
    exit = useApp().exit;
    useInput((event) => {
      if (event.kind !== "key") return;
      const delta = event.name === "down" ? 1 : event.name === "up" ? -1 : 0;
      if (delta === 0 || !scroll.value?.scrollByLines(delta)) return;
      scrollTop.value += delta;
      sequence.value++;
    });
    return () => (
      <Box width={100} height={30} flexDirection="column">
        <Box width={100} height={29} overflowY="hidden">
          <ScrollBox ref={scroll}>
            <Text>{document}</Text>
          </ScrollBox>
          <Box position="absolute" left={6} top={5} width={1}>
            <Text>X</Text>
          </Box>
          <Box position="absolute" left={20} top={5} width={3}>
            <Text>XXX</Text>
          </Box>
        </Box>
        <Text>{marker()}</Text>
      </Box>
    );
  });

  const latencies: number[] = [];
  const renderDurations: number[] = [];
  const host = await mountCapacityHost(App, {
    columns: capacityManifest.j3.columns,
    rows: capacityManifest.j3.rows,
    mode: "fullscreen",
    maxFps,
    onRender: (duration) => renderDurations.push(duration),
  });
  const heartbeat = startHeartbeat();
  let assertions = lines.length;
  try {
    scroll.value?.scrollToTop();
    await host.flush("top=0");
    for (let action = 0; action < capacityManifest.j3.scrollActions; action++) {
      const down = action < 100;
      await recordVisible(latencies, () =>
        host.input(down ? "\x1b[B" : "\x1b[A", `seq=${sequence.value + 1}`),
      );
      assert.equal(scrollTop.value, down ? action + 1 : 199 - action);
      assertions++;
    }
    assert.equal(scrollTop.value, 0);
    assertions++;

    assert.equal(moveSelection("document-start"), true);
    for (let cell = 0; cell < 5; cell++) assert.equal(moveSelection("forward"), true);
    await host.flush();
    assertions += 6;
    const moves = Array.from(
      { length: 25 },
      () => ["forward", "backward", "down", "up"] as const,
    ).flat();
    for (const direction of moves) {
      await recordVisible(latencies, async () => {
        assert.equal(moveSelection(direction, true), true);
        sequence.value++;
        await host.flush(`seq=${sequence.value}`);
      });
      const selected = selectedText();
      assert.ok(!selected.startsWith("\u0301") && !selected.startsWith("‍"));
      assertions += 2;
    }

    await recordVisible(latencies, async () => {
      anchorIndex = 100;
      extentIndex = 200;
      sequence.value++;
      await host.flush(`seq=${sequence.value}`);
    });
    assert.ok(selectedText().length > 0);
    assertions++;
    await recordVisible(latencies, async () => {
      clipboardRequests.push(selectedText());
      copyStatus.value = "copied";
      sequence.value++;
      await host.flush("copy=copied");
    });
    assert.deepEqual(clipboardRequests, [selectedText()]);
    assert.ok(!clipboardRequests[0]!.includes("X"));
    assertions += 2;
    exit();
    await host.app.waitUntilExit();
  } catch (error) {
    heartbeat.stop();
    try {
      await host.dispose();
    } catch {}
    throw error;
  }
  return finish("j3", host, latencies, renderDurations, heartbeat, assertions);
}

interface MetricRow {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly sparkline: readonly string[];
  readonly status: string;
}

function makeMetricRows(): MetricRow[] {
  return Array.from({ length: capacityManifest.j4.metricRows }, (_, index) => ({
    id: `metric-${index.toString().padStart(3, "0")}`,
    label: `metric ${index.toString().padStart(3, "0")}`,
    value: index,
    unit: "ms",
    sparkline: Array.from({ length: 12 }, () => "▁"),
    status: "ok",
  }));
}

async function runJ4(maxFps: number): Promise<JourneyExecution> {
  const rows = shallowReactive<MetricRow[]>(makeMetricRows());
  const sequence = shallowRef(0);
  const last = shallowRef({ row: 0, point: 0, value: 0, action: "update" });
  let exit!: () => void;
  let layoutWidth!: ReturnType<typeof useLayoutWidth>;
  let viewportHeight!: NonNullable<ReturnType<typeof useViewportHeight>>;
  const checksum = (): number => rows.reduce((sum, row) => sum + row.value, 0);
  const marker = (side: "TOP" | "BOTTOM"): string =>
    `__J4_${side}__ seq=${sequence.value} action=${last.value.action} row=${last.value.row} value=${last.value.value} point=${last.value.point} checksum=${checksum()}`;

  const App = defineComponent(() => {
    exit = useApp().exit;
    layoutWidth = useLayoutWidth();
    const resolvedViewportHeight = useViewportHeight();
    if (!resolvedViewportHeight) {
      throw new Error("J4 requires the bounded Fullscreen viewport configured by its host");
    }
    viewportHeight = resolvedViewportHeight;
    useInput((event) => {
      if (event.kind !== "text" || event.text !== "q") return;
      sequence.value++;
      last.value = { ...last.value, action: "quit" };
    });
    return () => (
      <Box width={120} height={40} flexDirection="column">
        <Text>{marker("TOP")}</Text>
        <Box width={120} height={38} flexDirection="column" overflowY="hidden">
          {rows.map((row) => (
            <Box key={row.id} width={120} height={1} flexDirection="row" flexShrink={0}>
              {[
                row.id,
                row.label,
                String(row.value),
                row.unit,
                row.sparkline.join(""),
                row.status,
              ].map((cell, index) => (
                <Box key={index} width={20} height={1} flexShrink={0}>
                  <Text>{cell}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        <Text>{marker("BOTTOM")}</Text>
      </Box>
    );
  });

  const latencies: number[] = [];
  const renderDurations: number[] = [];
  const host = await mountCapacityHost(App, {
    columns: capacityManifest.j4.columns,
    rows: capacityManifest.j4.rows,
    mode: "fullscreen",
    maxFps,
    onRender: (duration) => renderDurations.push(duration),
  });
  const heartbeat = startHeartbeat();
  let assertions = 0;
  try {
    for (let update = 1; update <= capacityManifest.j4.sparseUpdates; update++) {
      const rowIndex = (update - 1) % rows.length;
      const pointIndex = (update - 1) % 12;
      const previous = rows[rowIndex]!;
      const sparkline = [...previous.sparkline];
      sparkline[pointIndex] = "▁▂▃▄▅▆▇█"[update % 8]!;
      const value = (update * 37) % 10_000;
      rows[rowIndex] = { ...previous, value, sparkline };
      sequence.value = update;
      last.value = { row: rowIndex, point: pointIndex, value, action: "update" };
      await recordVisible(latencies, () =>
        host.flush([`__J4_TOP__ seq=${update}`, `__J4_BOTTOM__ seq=${update}`]),
      );
      assert.equal(rows[rowIndex]!.sparkline[pointIndex], sparkline[pointIndex]);
      assertions++;
    }
    assert.equal(rows.length, 120);
    assert.equal(layoutWidth.value, 120);
    assert.equal(viewportHeight.value, 40);
    assertions += 3;
    await recordVisible(latencies, () =>
      host.input("q", ["action=quit", `__J4_BOTTOM__ seq=${sequence.value + 1}`]),
    );
    exit();
    await host.app.waitUntilExit();
  } catch (error) {
    heartbeat.stop();
    try {
      await host.dispose();
    } catch {}
    throw error;
  }
  return finish("j4", host, latencies, renderDurations, heartbeat, assertions);
}

interface WorkbenchRow {
  readonly id: string;
  readonly value: number;
}

function makeWorkbenchRows(pane: number): WorkbenchRow[] {
  return Array.from({ length: capacityManifest.j5.rowsPerPane }, (_, row) => ({
    id: `p${pane}-row-${row.toString().padStart(3, "0")}`,
    value: pane * 1_000 + row,
  }));
}

async function runJ5(maxFps: number): Promise<JourneyExecution> {
  const paneRows = Array.from({ length: 4 }, (_, pane) =>
    shallowReactive<WorkbenchRow[]>(makeWorkbenchRows(pane)),
  );
  const activePane = shallowRef(0);
  const leftWidth = shallowRef(59);
  const scrollOffsets = shallowReactive([0, 0, 0, 0]);
  const overlayOpen = shallowRef(false);
  const sequence = shallowRef(0);
  const actionName = shallowRef("mount");
  const paneScroll = Array.from({ length: 4 }, () => shallowRef<ScrollBoxExpose | null>(null));
  let exit!: () => void;
  let focusStep = 0;
  let focusBeforeOverlay = -1;

  const focusedPane = (): number => activePane.value;
  const checksum = (): number =>
    paneRows.reduce((total, rows) => total + rows.reduce((sum, row) => sum + row.value, 0), 0);
  const marker = (side: "TOP" | "BOTTOM"): string =>
    `__J5_${side}__ seq=${sequence.value} action=${actionName.value} focus=${focusedPane()} offsets=${scrollOffsets.join("/")} divider=${leftWidth.value} overlay=${overlayOpen.value ? "open" : "closed"} sum=${checksum()}`;

  const PaneGroup = defineComponent({
    props: { group: { type: Number, required: true } },
    setup(props) {
      const group = props.group;
      const firstPane = group * 2;
      return () => (
        <Box width="100%" height={38} flexDirection="column">
          {[firstPane, firstPane + 1].map((pane) => (
            <Box
              key={pane}
              width="100%"
              height={19}
              flexDirection="column"
              flexShrink={0}
              overflowY="hidden"
            >
              <Text>{`${activePane.value === pane ? ">" : " "} pane ${pane}`}</Text>
              <ScrollBox ref={paneScroll[pane]}>
                {paneRows[pane]!.map((row) => (
                  <Text key={row.id}>{`${row.id} value=${row.value}`}</Text>
                ))}
              </ScrollBox>
            </Box>
          ))}
        </Box>
      );
    },
  });

  const Overlay = defineComponent(() => () => (
    <Box position="absolute" left={30} top={8} width={60} height={12} borderStyle="single">
      <Text>OVERLAY</Text>
    </Box>
  ));

  const App = defineComponent(() => {
    exit = useApp().exit;
    useInput((event) => {
      if (event.kind !== "text") return;
      if (overlayOpen.value) {
        if (event.text !== "c") return;
        overlayOpen.value = false;
        activePane.value = focusBeforeOverlay;
        sequence.value++;
        actionName.value = "overlay-close";
        return;
      }
      if (event.text === "f") {
        activePane.value = (activePane.value + 1) % 4;
        focusStep++;
        sequence.value++;
        actionName.value = "focus";
        return;
      }
      if (event.text === "o") {
        focusBeforeOverlay = focusedPane();
        overlayOpen.value = true;
        sequence.value++;
        actionName.value = "overlay-open";
        return;
      }
      const downPane = ["1", "2", "3", "4"].indexOf(event.text);
      const upPane = ["w", "x", "y", "z"].indexOf(event.text);
      const pane = downPane >= 0 ? downPane : upPane;
      const delta = downPane >= 0 ? 1 : upPane >= 0 ? -1 : 0;
      if (pane >= 0 && paneScroll[pane]!.value?.scrollByLines(delta)) {
        scrollOffsets[pane] += delta;
        sequence.value++;
        actionName.value = `scroll-${pane}`;
        return;
      }
      if (event.text === ">" || event.text === "<") {
        leftWidth.value += event.text === ">" ? 1 : -1;
        sequence.value++;
        actionName.value = "divider";
      }
    });
    return () => (
      <Box width={120} height={40} flexDirection="column">
        <Text>{marker("TOP")}</Text>
        <Box width={120} height={38} flexDirection="row">
          <Box width={leftWidth.value} height={38} flexShrink={0} overflowY="hidden">
            <PaneGroup group={0} />
          </Box>
          <Box width={1} height={38} flexShrink={0}>
            <Text>│</Text>
          </Box>
          <Box width={119 - leftWidth.value} height={38} flexShrink={0} overflowY="hidden">
            <PaneGroup group={1} />
          </Box>
        </Box>
        <Text>{marker("BOTTOM")}</Text>
        {overlayOpen.value ? <Overlay /> : null}
      </Box>
    );
  });

  const latencies: number[] = [];
  const renderDurations: number[] = [];
  const host = await mountCapacityHost(App, {
    columns: capacityManifest.j5.columns,
    rows: capacityManifest.j5.rows,
    mode: "fullscreen",
    maxFps,
    onRender: (duration) => renderDurations.push(duration),
  });
  const heartbeat = startHeartbeat();
  let assertions = 0;
  try {
    for (const scroll of paneScroll) scroll.value?.scrollToTop();
    await host.flush("offsets=0/0/0/0");
    assert.equal(focusedPane(), 0);
    assertions++;

    for (let update = 1; update <= capacityManifest.j5.sparseUpdates; update++) {
      const pane = (update - 1) % 4;
      const rowIndex = Math.floor((update - 1) / 4) % 100;
      const previous = paneRows[pane]![rowIndex]!;
      paneRows[pane]![rowIndex] = { ...previous, value: update * 101 };
      sequence.value++;
      actionName.value = `update-${pane}-${rowIndex}`;
      await host.flush([`__J5_TOP__ seq=${sequence.value}`, `__J5_BOTTOM__ seq=${sequence.value}`]);
      assert.equal(paneRows[pane]![rowIndex]!.value, update * 101);
      assertions++;
    }

    for (let action = 0; action < capacityManifest.j5.focusActions; action++) {
      await recordVisible(latencies, () =>
        host.input("f", [
          `__J5_TOP__ seq=${sequence.value + 1}`,
          `__J5_BOTTOM__ seq=${sequence.value + 1}`,
        ]),
      );
      const expectedGroup = focusStep % 4 === 0 || focusStep % 4 === 1 ? 0 : 1;
      assert.equal(Math.floor(focusedPane() / 2), expectedGroup);
      assert.equal(focusedPane(), focusStep % 4);
      assertions += 2;
    }

    const downKeys = ["1", "2", "3", "4"] as const;
    const upKeys = ["w", "x", "y", "z"] as const;
    for (let action = 0; action < capacityManifest.j5.scrollActions; action++) {
      const pane = action % 4;
      const direction = action < 20 ? "down" : "up";
      const before = [...scrollOffsets];
      await recordVisible(latencies, () =>
        host.input(
          direction === "down" ? downKeys[pane]! : upKeys[pane]!,
          `seq=${sequence.value + 1}`,
        ),
      );
      assert.equal(scrollOffsets[pane], before[pane]! + (direction === "down" ? 1 : -1));
      for (let other = 0; other < 4; other++) {
        if (other !== pane) assert.equal(scrollOffsets[other], before[other]);
      }
      assertions += 4;
    }
    assert.deepEqual([...scrollOffsets], [0, 0, 0, 0]);
    assertions++;

    for (let move = 1; move <= capacityManifest.j5.dividerMoves; move++) {
      let paintedDividerColumn = -1;
      await recordVisible(latencies, async () => {
        const screen = await host.input(
          move <= 10 ? ">" : "<",
          `divider=${move <= 10 ? 59 + move : 69 - (move - 10)}`,
        );
        const dividerLine = screen.text.split("\n").find((line) => line.includes("│"));
        paintedDividerColumn = dividerLine?.indexOf("│") ?? -1;
      });
      const expectedWidth = move <= 10 ? 59 + move : 69 - (move - 10);
      assert.equal(leftWidth.value, expectedWidth);
      assert.equal(paintedDividerColumn, expectedWidth);
      assertions += 2;
    }
    assert.equal(leftWidth.value, 59);
    assertions++;

    await recordVisible(latencies, () => host.input("o", "overlay=open"));
    assert.equal(overlayOpen.value, true);
    const offsetsBeforeCoveredScroll = [...scrollOffsets];
    await host.input("1");
    assert.deepEqual([...scrollOffsets], offsetsBeforeCoveredScroll);
    assertions += 2;
    await recordVisible(latencies, () => host.input("c", "overlay=closed"));
    assert.equal(focusedPane(), focusBeforeOverlay);
    assert.equal(overlayOpen.value, false);
    assertions += 2;

    const finalScreen = await host.screen();
    for (let pane = 0; pane < 4; pane++) {
      assert.ok(finalScreen.text.includes(`pane ${pane}`));
      assertions++;
    }
    exit();
    await host.app.waitUntilExit();
  } catch (error) {
    heartbeat.stop();
    try {
      await host.dispose();
    } catch {}
    throw error;
  }
  return finish("j5", host, latencies, renderDurations, heartbeat, assertions);
}

interface J6CoordinatedRecord {
  readonly marker: string;
  readonly payload: string;
}

interface J6ResourceHighWater {
  maximumPreparedFrames: number;
  maximumLifecycleTransactions: number;
  maximumSchedulerTimers: number;
  maximumStreamListeners: number;
  maximumSynchronizedOutputLeases: number;
  maximumStreamReservations: number;
}

interface J6CoordinatedCounts {
  coordinatedRecords: number;
  coordinatedAcceptedWritable: number;
  coordinatedAcceptedBackpressured: number;
  coordinatedBlocked: number;
}

function makeJ6CoordinatedRecord(
  journey: "J6I" | "J6F",
  ordinal: number,
  update: number,
): J6CoordinatedRecord {
  const marker = `__${journey}_RECORD__ ordinal=${ordinal.toString().padStart(3, "0")} update=${update.toString().padStart(4, "0")}`;
  const prefix = `${marker} `;
  const paddingBytes = capacityManifest.j6i.coordinatedRecordBytes - Buffer.byteLength(prefix) - 1;
  assert.ok(paddingBytes >= 0, "the coordinated-record marker must fit its fixed payload");
  const payload = `${prefix}${"R".repeat(paddingBytes)}\n`;
  assert.equal(
    Buffer.byteLength(payload),
    capacityManifest.j6i.coordinatedRecordBytes,
    "each J6 coordinated record must be exactly 1 KiB",
  );
  return Object.freeze({ marker, payload });
}

function makeJ6RecordPump(write: (data: string) => CoordinatedWriteResult): {
  readonly records: readonly J6CoordinatedRecord[];
  enqueue(record: J6CoordinatedRecord): void;
  drain(): Promise<void>;
  counts(): J6CoordinatedCounts;
} {
  interface GateWait {
    readonly promise: Promise<void>;
    settled: boolean;
    error: unknown;
  }

  const records: J6CoordinatedRecord[] = [];
  const pending: J6CoordinatedRecord[] = [];
  let gateWait: GateWait | undefined;
  let coordinatedAcceptedWritable = 0;
  let coordinatedAcceptedBackpressured = 0;
  let coordinatedBlocked = 0;

  const observeGate = (promise: Promise<void>): void => {
    const wait: GateWait = { promise, settled: false, error: undefined };
    gateWait = wait;
    void promise.then(
      () => {
        wait.settled = true;
      },
      (error: unknown) => {
        wait.error = error;
        wait.settled = true;
      },
    );
  };

  const finishSettledGate = (): boolean => {
    if (!gateWait) return true;
    if (!gateWait.settled) return false;
    const error = gateWait.error;
    gateWait = undefined;
    if (error !== undefined) throw error;
    return true;
  };

  const attemptHead = (): void => {
    if (!finishSettledGate()) return;
    const record = pending[0];
    if (!record) return;
    const result = write(record.payload);
    if (result.status === "blocked") {
      coordinatedBlocked++;
      observeGate(result.ready);
      return;
    }
    pending.shift();
    if (result.writable) {
      coordinatedAcceptedWritable++;
      return;
    }
    coordinatedAcceptedBackpressured++;
    observeGate(result.ready);
  };

  return Object.freeze({
    records,
    enqueue(record: J6CoordinatedRecord) {
      records.push(record);
      pending.push(record);
      // The producer never awaits this gate. Once one record is caller-owned,
      // later records stay in this application queue so accepted output remains
      // FIFO even if the Runtime gate becomes writable between producer turns.
      attemptHead();
    },
    async drain() {
      while (pending.length > 0 || gateWait) {
        if (gateWait && !gateWait.settled) await gateWait.promise;
        finishSettledGate();
        attemptHead();
      }
    },
    counts() {
      return Object.freeze({
        coordinatedRecords: records.length,
        coordinatedAcceptedWritable,
        coordinatedAcceptedBackpressured,
        coordinatedBlocked,
      });
    },
  });
}

function makeJ6ResourceHighWater(): J6ResourceHighWater {
  return {
    maximumPreparedFrames: 0,
    maximumLifecycleTransactions: 0,
    maximumSchedulerTimers: 0,
    maximumStreamListeners: 0,
    maximumSynchronizedOutputLeases: 0,
    maximumStreamReservations: 0,
  };
}

function sampleJ6ResourceBounds(host: CapacityHost, maximum: J6ResourceHighWater): void {
  const resources = host.resourceSnapshot();
  maximum.maximumPreparedFrames = Math.max(maximum.maximumPreparedFrames, resources.preparedFrames);
  maximum.maximumLifecycleTransactions = Math.max(
    maximum.maximumLifecycleTransactions,
    resources.lifecycleTransactions,
  );
  maximum.maximumSchedulerTimers = Math.max(
    maximum.maximumSchedulerTimers,
    resources.schedulerTimers,
  );
  maximum.maximumStreamListeners = Math.max(
    maximum.maximumStreamListeners,
    resources.streamListeners,
  );
  maximum.maximumSynchronizedOutputLeases = Math.max(
    maximum.maximumSynchronizedOutputLeases,
    resources.synchronizedOutputLeases,
  );
  maximum.maximumStreamReservations = Math.max(
    maximum.maximumStreamReservations,
    resources.streamReservations,
  );

  assert.ok(resources.preparedFrames <= 1, "J6 may retain at most one prepared frame");
  assert.ok(
    resources.lifecycleTransactions <= 1,
    "J6 may retain at most one output lifecycle transaction",
  );
  assert.ok(resources.schedulerTimers <= 1, "J6 may retain at most one scheduler timer");
  assert.ok(
    resources.streamListeners <= 4,
    "J6 may retain only the resize listener and one drain/error/close listener set",
  );
  assert.ok(
    resources.synchronizedOutputLeases <= 1,
    "J6 may retain at most one synchronized-output restoration obligation",
  );
  assert.equal(resources.streamReservations, 1, "the mounted J6 app must own one stream");
}

async function j6ProducerTurn(mutate: () => void): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, capacityManifest.j6i.producerTurnMs));
  mutate();
  // The fixed producer intentionally waits for Vue's reactive turn only. It
  // never waits for Runtime flush or Writable drain while mutations continue.
  await nextTick();
}

function assertMarkersExactlyOnceAndInOrder(output: string, markers: readonly string[]): void {
  let previousIndex = -1;
  for (const marker of markers) {
    assert.equal(occurrences(output, marker), 1, `${marker} must be handed exactly once`);
    const index = output.indexOf(marker);
    assert.ok(index > previousIndex, `${marker} must preserve producer order`);
    previousIndex = index;
  }
}

function frameGenerations(output: string, journey: "J6I" | "J6F"): number[] {
  const expression = new RegExp(`__${journey}_FRAME__ update=(\\d+)`, "g");
  return [...output.matchAll(expression)].map((match) => Number(match[1]));
}

function assertJ6Backpressure(
  snapshot: CapacityBackpressureSnapshot,
  counts: J6CoordinatedCounts,
): void {
  assert.equal(snapshot.highWaterMarkBytes, capacityManifest.j6i.highWaterMarkBytes);
  assert.ok(snapshot.writeFalseCount > 0, "the slow Writable must return false");
  assert.equal(
    snapshot.drainCount,
    snapshot.writeFalseCount,
    "every accepted backpressured transaction must drain",
  );
  assert.equal(
    snapshot.writesBeforeDrain,
    0,
    "Runtime must not call Writable.write() again before drain",
  );
  assert.ok(
    snapshot.maximumWritableLengthBytes <=
      snapshot.highWaterMarkBytes + snapshot.largestAtomicTransactionBytes,
    "writableLength may exceed highWaterMark only by one atomic transaction",
  );
  assert.equal(snapshot.currentWritableLengthBytes, 0, "the Writable queue must settle to zero");
  assert.equal(snapshot.writableNeedDrain, false, "the final Writable state must not need drain");
  assert.equal(
    snapshot.heldBackpressureCallbacks,
    1,
    "exactly the first backpressured _write callback must be held for 200ms",
  );
  assert.ok(counts.coordinatedBlocked > 0, "the internal write result must expose non-acceptance");
  assert.equal(
    counts.coordinatedAcceptedBackpressured,
    counts.coordinatedRecords,
    "every fixed 1 KiB coordinated record must be accepted exactly once",
  );
  assert.equal(
    counts.coordinatedAcceptedWritable,
    0,
    "a 1 KiB transaction cannot remain writable at a 256-byte high-water mark",
  );
}

interface J6InlineRecord {
  readonly id: number;
  readonly marker: string;
}

async function runJ6Inline(volume: CapacityVolume): Promise<JourneyExecution> {
  const configuration = capacityManifest.j6i.volumes[volume];
  const records = shallowRef<J6InlineRecord[]>([]);
  const liveUpdate = shallowRef(0);
  let writeStdout!: (data: string) => CoordinatedWriteResult;
  let exit!: () => void;
  const frameMarker = (): string => `__J6I_FRAME__ update=${liveUpdate.value}`;

  const App = defineComponent(() => {
    writeStdout = useStdout().write;
    exit = useApp().exit;
    return () => (
      <Box width="100%" flexDirection="column">
        {records.value.map((item) => (
          <Static key={item.id}>
            <Text>{`${item.marker} request\nanswer ${item.id.toString().padStart(4, "0")}`}</Text>
          </Static>
        ))}
        <Text>{`${frameMarker()} ${"L".repeat(768)}`}</Text>
      </Box>
    );
  });

  const renderDurations: number[] = [];
  const host = await mountSlowCapacityHost(App, {
    columns: capacityManifest.j6i.columns,
    rows: capacityManifest.j6i.rows,
    mode: "inline",
    maxFps: capacityManifest.j6i.maxFps,
    onRender: (duration) => renderDurations.push(duration),
  });
  const heartbeat = startHeartbeat();
  const pump = makeJ6RecordPump(writeStdout);
  const resourceMaximum = makeJ6ResourceHighWater();
  let assertions = 0;
  try {
    for (let id = 0; id < configuration.completedRecords; id++) {
      await j6ProducerTurn(() => {
        const record = Object.freeze({
          id,
          marker: `J6I-HISTORY-${id.toString().padStart(4, "0")}`,
        });
        records.value = [...records.value, record];
      });
      sampleJ6ResourceBounds(host, resourceMaximum);
    }

    for (let update = 1; update <= configuration.liveUpdates; update++) {
      await j6ProducerTurn(() => {
        liveUpdate.value = update;
      });
      if (update % capacityManifest.j6i.coordinatedEvery === 0) {
        pump.enqueue(makeJ6CoordinatedRecord("J6I", pump.records.length, update));
      }
      sampleJ6ResourceBounds(host, resourceMaximum);
    }

    await pump.drain();
    assert.equal(
      pump.records.length,
      configuration.liveUpdates / capacityManifest.j6i.coordinatedEvery,
    );
    await host.flush(frameMarker());
    await host.backpressure.waitForIdle();
    const visible = await host.screen();
    const output = host.backpressure.deliveredOutput;
    const historyMarkers = records.value.map((record) => record.marker);
    const coordinatedMarkers = pump.records.map((record) => record.marker);
    assertMarkersExactlyOnceAndInOrder(output, historyMarkers);
    assertMarkersExactlyOnceAndInOrder(output, coordinatedMarkers);
    assert.ok(
      output.indexOf(coordinatedMarkers[0]!) > output.indexOf(historyMarkers.at(-1)!),
      "coordinated Inline records must follow the complete committed history prefix",
    );
    assert.equal(occurrences(visible.text, "PRE_APP_HISTORY"), 1);
    assert.ok(visible.text.includes(frameMarker()), "the newest Inline frame must be visible");
    for (const marker of historyMarkers) assert.equal(occurrences(visible.text, marker), 1);
    for (const marker of coordinatedMarkers) assert.equal(occurrences(visible.text, marker), 1);
    const generations = frameGenerations(output, "J6I");
    assert.equal(generations.at(-1), configuration.liveUpdates);
    assert.ok(
      new Set(generations).size < configuration.liveUpdates + 1,
      "at least one obsolete blocked Inline frame must coalesce",
    );
    assertions += historyMarkers.length * 2 + coordinatedMarkers.length * 2 + 6;

    exit();
    await host.app.waitUntilExit();
  } catch (error) {
    heartbeat.stop();
    try {
      await host.dispose();
    } catch {}
    throw error;
  }

  const counts = pump.counts();
  const execution = await finish("j6i", host, [], renderDurations, heartbeat, assertions + 8, {
    volume,
    backpressure: Object.freeze({ ...counts, ...resourceMaximum }),
  });
  const snapshot = host.backpressure.snapshot();
  assertJ6Backpressure(snapshot, counts);
  const finalOutput = host.backpressure.deliveredOutput;
  assert.ok(
    finalOutput.lastIndexOf(frameMarker()) < finalOutput.lastIndexOf("\x1b[?25h"),
    "Inline cursor restoration must follow the newest accepted frame",
  );
  assert.ok(
    finalOutput.lastIndexOf(frameMarker()) > finalOutput.lastIndexOf(pump.records.at(-1)!.marker),
    "the final Inline output after coordinated history must be the newest frame",
  );
  return execution;
}

async function runJ6Fullscreen(volume: CapacityVolume): Promise<JourneyExecution> {
  const configuration = capacityManifest.j6f.volumes[volume];
  const rows = shallowReactive<MetricRow[]>(makeMetricRows());
  const liveUpdate = shallowRef(0);
  let writeStdout!: (data: string) => CoordinatedWriteResult;
  let exit!: () => void;
  const checksum = (): number => rows.reduce((sum, row) => sum + row.value, 0);
  const frameMarker = (side: "TOP" | "BOTTOM"): string =>
    `__J6F_FRAME__ update=${liveUpdate.value} side=${side} checksum=${checksum()}`;

  const App = defineComponent(() => {
    writeStdout = useStdout().write;
    exit = useApp().exit;
    return () => (
      <Box width={120} height={40} flexDirection="column">
        <Text>{frameMarker("TOP")}</Text>
        <Box width={120} height={38} flexDirection="column" overflowY="hidden">
          {rows.map((row) => (
            <Box key={row.id} width={120} height={1} flexDirection="row" flexShrink={0}>
              {[
                row.id,
                row.label,
                String(row.value),
                row.unit,
                row.sparkline.join(""),
                row.status,
              ].map((cell, index) => (
                <Box key={index} width={20} height={1} flexShrink={0}>
                  <Text>{cell}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        <Text>{frameMarker("BOTTOM")}</Text>
      </Box>
    );
  });

  const renderDurations: number[] = [];
  const host = await mountSlowCapacityHost(App, {
    columns: capacityManifest.j6f.columns,
    rows: capacityManifest.j6f.rows,
    mode: "fullscreen",
    maxFps: capacityManifest.j6f.maxFps,
    onRender: (duration) => renderDurations.push(duration),
  });
  const heartbeat = startHeartbeat();
  const pump = makeJ6RecordPump(writeStdout);
  const resourceMaximum = makeJ6ResourceHighWater();
  let assertions = 0;
  try {
    for (let update = 1; update <= configuration.sparseUpdates; update++) {
      await j6ProducerTurn(() => {
        const rowIndex = (update - 1) % rows.length;
        const pointIndex = (update - 1) % 12;
        const previous = rows[rowIndex]!;
        const sparkline = [...previous.sparkline];
        sparkline[pointIndex] = "▁▂▃▄▅▆▇█"[update % 8]!;
        rows[rowIndex] = {
          ...previous,
          value: (update * 37) % 10_000,
          sparkline,
        };
        liveUpdate.value = update;
      });
      if (update % capacityManifest.j6f.coordinatedEvery === 0) {
        pump.enqueue(makeJ6CoordinatedRecord("J6F", pump.records.length, update));
      }
      sampleJ6ResourceBounds(host, resourceMaximum);
    }

    await pump.drain();
    assert.equal(
      pump.records.length,
      configuration.sparseUpdates / capacityManifest.j6f.coordinatedEvery,
    );
    await host.flush([frameMarker("TOP"), frameMarker("BOTTOM")]);
    await host.backpressure.waitForIdle();
    const visible = await host.screen();
    const output = host.backpressure.deliveredOutput;
    const coordinatedMarkers = pump.records.map((record) => record.marker);
    assertMarkersExactlyOnceAndInOrder(output, coordinatedMarkers);
    assert.equal(visible.activeBuffer, "alternate");
    assert.ok(visible.text.includes(frameMarker("TOP")));
    assert.ok(visible.text.includes(frameMarker("BOTTOM")));
    const generations = frameGenerations(output, "J6F");
    assert.equal(generations.at(-1), configuration.sparseUpdates);
    assert.ok(
      new Set(generations).size < configuration.sparseUpdates + 1,
      "at least one obsolete blocked Fullscreen frame must coalesce",
    );
    assertions += coordinatedMarkers.length * 2 + 6;

    exit();
    await host.app.waitUntilExit();
  } catch (error) {
    heartbeat.stop();
    try {
      await host.dispose();
    } catch {}
    throw error;
  }

  const counts = pump.counts();
  const execution = await finish("j6f", host, [], renderDurations, heartbeat, assertions + 11, {
    volume,
    backpressure: Object.freeze({ ...counts, ...resourceMaximum }),
  });
  const snapshot = host.backpressure.snapshot();
  assertJ6Backpressure(snapshot, counts);
  const finalOutput = host.backpressure.deliveredOutput;
  const enterAlternate = finalOutput.indexOf("\x1b[?1049h");
  const leaveAlternate = finalOutput.lastIndexOf("\x1b[?1049l");
  assert.equal(occurrences(finalOutput, "\x1b[?1049h"), 1);
  assert.equal(occurrences(finalOutput, "\x1b[?1049l"), 1);
  assert.ok(enterAlternate >= 0, "Fullscreen must enter the alternate buffer");
  assert.ok(enterAlternate < finalOutput.indexOf(pump.records[0]!.marker));
  assert.ok(leaveAlternate > finalOutput.lastIndexOf(frameMarker("BOTTOM")));
  assert.ok(leaveAlternate > finalOutput.lastIndexOf(pump.records.at(-1)!.marker));
  return execution;
}

function requireJ6Volume(journey: CapacityJourneyId, volume: CapacityVolume | undefined) {
  if (volume !== undefined) return volume;
  throw new TypeError(`${journey} requires --volume small or --volume large`);
}

export async function runCapacityJourney(
  journey: CapacityJourneyId,
  maxFps = 30,
  volume?: CapacityVolume,
): Promise<JourneyExecution> {
  switch (journey) {
    case "j1":
      return runJ1(maxFps);
    case "j2":
      return runJ2(maxFps);
    case "j3":
      return runJ3(maxFps);
    case "j4":
      return runJ4(maxFps);
    case "j5":
      return runJ5(maxFps);
    case "j6i":
      return runJ6Inline(requireJ6Volume(journey, volume));
    case "j6f":
      return runJ6Fullscreen(requireJ6Volume(journey, volume));
  }
}

export async function runCapacityControl(
  journey: CapacityJourneyId,
  maxFps = 30,
  volume?: CapacityVolume,
): Promise<JourneyExecution> {
  let exit!: () => void;
  const App = defineComponent(() => {
    exit = useApp().exit;
    return () => <Text>{`__CAPACITY_CONTROL__ journey=${journey}`}</Text>;
  });
  const configuration = capacityManifest[journey];
  const renderDurations: number[] = [];
  const host = await mountCapacityHost(App, {
    columns: configuration.columns,
    rows: configuration.rows,
    mode: journey === "j1" || journey === "j2" || journey === "j6i" ? "inline" : "fullscreen",
    maxFps,
    onRender: (duration) => renderDurations.push(duration),
  });
  const heartbeat = startHeartbeat();
  try {
    await host.flush(`__CAPACITY_CONTROL__ journey=${journey}`);
    exit();
    await host.app.waitUntilExit();
  } catch (error) {
    heartbeat.stop();
    try {
      await host.dispose();
    } catch {}
    throw error;
  }
  return finish(
    journey,
    host,
    [],
    renderDurations,
    heartbeat,
    1,
    volume === undefined ? undefined : { volume },
  );
}
