import assert from "node:assert/strict";
import stringWidth from "string-width";
import {
  computed,
  defineComponent,
  nextTick,
  shallowReactive,
  shallowRef,
  type ComponentPublicInstance,
} from "vue";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import {
  Box,
  Text,
  useApp,
  useElementGeometry,
  useFocus,
  useFocusedInput,
  useFocusManager,
  useFocusScope,
  useFocusScopeInput,
  useInput,
  useLayoutSize,
  useStderr,
  useStdout,
  type CoordinatedWriteResult,
  type UseElementGeometryReturn,
  type UseFocusReturn,
  type UseFocusScopeReturn,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import {
  useMouseDrag,
  useMouseEvent,
  useTextSelection,
  type TextSelectionCommands,
  type TuiMouseDragEvent,
} from "@vue-tui/runtime/fullscreen";
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
    pointerDrags: 1,
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
    wheelActions: 40,
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
  assert.equal(host.mouseReporting.current, "none", "mouse reporting must restore after teardown");
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
  let composer!: UseFocusReturn;
  let approvalTarget!: UseFocusReturn;
  let writeStdout!: (data: string) => void;
  let writeStderr!: (data: string) => void;
  let exit!: (result?: unknown) => void;

  const marker = (): string =>
    `__J1__ seq=${sequence.value} records=${records.value.length} tokens=${tokenCount.value} approval=${approval.value} result=${approvalResult.value}`;

  const App = defineComponent(() => {
    const composerHost = shallowRef<ComponentPublicInstance | null>(null);
    const approvalHost = shallowRef<ComponentPublicInstance | null>(null);
    composer = useFocus(composerHost, { autoFocus: true });
    const approvalScope = useFocusScope({
      isActive: computed(() => approval.value !== "closed"),
      trapped: true,
    });
    approvalTarget = useFocus(approvalHost, { scope: approvalScope, autoFocus: true });
    writeStdout = useStdout().write;
    writeStderr = useStderr().write;
    exit = useApp().exit;

    useFocusedInput(composer, (event) => {
      if (event.sequence !== "a" && event.sequence !== "r") return "continue";
      approval.value = event.sequence === "a" ? "accept" : "reject";
      sequence.value++;
      return "consume";
    });
    useFocusScopeInput(approvalScope, (event) => {
      if (approval.value === "accept" && event.sequence === "\r") {
        approvalResult.value = "accepted";
      } else if (approval.value === "reject" && event.sequence === "\x1b") {
        approvalResult.value = "rejected";
      } else {
        return "continue";
      }
      approval.value = "closed";
      sequence.value++;
      return "consume";
    });

    return () => (
      <Box width="100%" flexDirection="column">
        <Static items={records.value}>
          {{
            default: ({ item }: { item: J1Record }) => (
              <Text>{`${item.marker} request\nanswer ${item.id.toString().padStart(3, "0")}`}</Text>
            ),
          }}
        </Static>
        <Text>{marker()}</Text>
        <Text>{`response ${"x".repeat(tokenCount.value)}`}</Text>
        {approval.value === "closed" ? null : (
          <Box ref={approvalHost}>
            <Text>{`approval ${approval.value}`}</Text>
          </Box>
        )}
        <Box ref={composerHost}>
          <Text>{composer.isFocused.value ? "> composer" : "  composer"}</Text>
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
    assert.equal(composer.isFocused.value, true);
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
    assert.equal(approvalTarget.isFocused.value, true);
    await host.input("\r", "result=accepted");
    assert.equal(composer.isFocused.value, true);
    await host.input("r", "approval=reject");
    assert.equal(approvalTarget.isFocused.value, true);
    await host.input("\x1b", "result=rejected");
    assert.equal(composer.isFocused.value, true);
    assertions += 5;

    await host.resize(72, 20, "result=rejected");
    await host.resize(100, 30, "result=rejected");
    await host.suspend();
    await host.resume("result=rejected");
    assert.equal(composer.isFocused.value, true);
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
    exit({ records: records.value.length });
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
  let exit!: (result?: unknown) => void;
  const marker = (): string =>
    `__J2__ seq=${sequence.value} query=${query.value || "-"} count=${filtered.value.length} active=${active.value} start=${windowStart.value} phase=${phase.value}`;

  const App = defineComponent(() => {
    exit = useApp().exit;
    useInput((event) => {
      if (phase.value !== "open") return "continue";
      if (event.kind === "text" && /^[a-z]$/.test(event.text)) {
        query.value += event.text;
      } else if (event.sequence === "\x7f") {
        query.value = query.value.slice(0, -1);
      } else if (event.kind === "key" && event.key.name === "down") {
        active.value = Math.min(filtered.value.length - 1, active.value + 1);
      } else if (event.kind === "key" && event.key.name === "up") {
        active.value = Math.max(0, active.value - 1);
      } else if (event.sequence === "\r") {
        const selected = filtered.value[active.value];
        if (selected) accepted.value = [...accepted.value, selected];
        phase.value = "accepted";
      } else if (event.sequence === "\x03") {
        phase.value = "cancelled";
      } else {
        return "continue";
      }
      sequence.value++;
      return "consume";
    });
    return () => (
      <Box width={100} height={30} flexDirection="column">
        <Static items={accepted.value}>
          {{ default: ({ item }: { item: Candidate }) => <Text>{`accepted ${item.id}`}</Text> }}
        </Static>
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
    exit({ accepted: accepted.value[0]!.id });
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
  const target = shallowRef<ComponentPublicInstance | null>(null);
  const scrollTop = shallowRef(0);
  const sequence = shallowRef(0);
  const copyStatus = shallowRef("none");
  const clipboardRequests: string[] = [];
  let selection!: TextSelectionCommands;
  let exit!: (result?: unknown) => void;
  const range = (): string => {
    const current = selection?.state.value.range;
    return current ? `${current.anchor}:${current.extent}` : "none";
  };
  const marker = (): string =>
    `__J3__ seq=${sequence.value} top=${scrollTop.value} range=${range()} copy=${copyStatus.value}`;

  const App = defineComponent(() => {
    exit = useApp().exit;
    selection = useTextSelection(target);
    useInput((event) => {
      if (event.kind !== "key" || event.key.phase === "release") return "continue";
      const delta = event.key.name === "down" ? 1 : event.key.name === "up" ? -1 : 0;
      if (delta === 0 || !scroll.value?.scrollByLines(delta)) return "continue";
      scrollTop.value += delta;
      sequence.value++;
      return "consume";
    });
    return () => (
      <Box width={100} height={30} flexDirection="column">
        <Box width={100} height={29} overflow="hidden">
          <ScrollBox ref={scroll}>
            <Text ref={target}>{document}</Text>
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
    clipboard(text) {
      clipboardRequests.push(text);
      return { status: "copied" };
    },
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

    assert.equal(selection.move("document-start"), true);
    for (let cell = 0; cell < 5; cell++) assert.equal(selection.move("forward"), true);
    await host.flush();
    assertions += 6;
    const moves = Array.from(
      { length: 25 },
      () => ["forward", "backward", "down", "up"] as const,
    ).flat();
    for (const direction of moves) {
      await recordVisible(latencies, async () => {
        assert.equal(selection.move(direction, { extend: true }), true);
        sequence.value++;
        await host.flush(`seq=${sequence.value}`);
      });
      const selected = selection.state.value.selectedText;
      assert.ok(!selected.startsWith("\u0301") && !selected.startsWith("‍"));
      assertions += 2;
    }

    await recordVisible(latencies, async () => {
      await host.mouse.down({ x: 5, y: 5 });
      await host.mouse.move({ x: 30, y: 8 });
      await host.mouse.up({ x: 30, y: 8 });
      sequence.value++;
      await host.flush(`seq=${sequence.value}`);
    });
    assert.ok(selection.state.value.selectedText.length > 0);
    assertions++;
    await recordVisible(latencies, async () => {
      const result = await selection.copy();
      copyStatus.value = result.status;
      sequence.value++;
      await host.flush("copy=copied");
    });
    assert.deepEqual(clipboardRequests, [selection.state.value.selectedText]);
    assert.ok(!clipboardRequests[0]!.includes("X"));
    assertions += 2;
    exit({ copied: clipboardRequests[0]!.length });
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
  let exit!: (result?: unknown) => void;
  let layout!: ReturnType<typeof useLayoutSize>;
  const checksum = (): number => rows.reduce((sum, row) => sum + row.value, 0);
  const marker = (side: "TOP" | "BOTTOM"): string =>
    `__J4_${side}__ seq=${sequence.value} action=${last.value.action} row=${last.value.row} value=${last.value.value} point=${last.value.point} checksum=${checksum()}`;

  const App = defineComponent(() => {
    exit = useApp().exit;
    layout = useLayoutSize();
    useInput((event) => {
      if (event.sequence !== "q") return "continue";
      sequence.value++;
      last.value = { ...last.value, action: "quit" };
      return "consume";
    });
    return () => (
      <Box width={120} height={40} flexDirection="column">
        <Text>{marker("TOP")}</Text>
        <Box width={120} height={38} flexDirection="column" overflow="hidden">
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
    assert.equal(layout.columns.value, 120);
    assert.equal(layout.rows.value, 40);
    assertions += 3;
    await recordVisible(latencies, () =>
      host.input("q", ["action=quit", `__J4_BOTTOM__ seq=${sequence.value + 1}`]),
    );
    exit({ checksum: checksum() });
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
  const scopeActive = [shallowRef(true), shallowRef(false)];
  const leftWidth = shallowRef(59);
  const scrollOffsets = shallowReactive([0, 0, 0, 0]);
  const overlayOpen = shallowRef(false);
  const sequence = shallowRef(0);
  const actionName = shallowRef("mount");
  const paneTargets = Array.from({ length: 4 }, () =>
    shallowRef<ComponentPublicInstance | null>(null),
  );
  const paneScroll = Array.from({ length: 4 }, () => shallowRef<ScrollBoxExpose | null>(null));
  const paneFocus: Array<UseFocusReturn | undefined> = Array.from({ length: 4 });
  const paneGeometry: Array<UseElementGeometryReturn | undefined> = Array.from({ length: 4 });
  const scopes: Array<UseFocusScopeReturn | undefined> = Array.from({ length: 2 });
  const dividerTarget = shallowRef<ComponentPublicInstance | null>(null);
  let dividerGeometry!: UseElementGeometryReturn;
  let overlayFocus: UseFocusReturn | undefined;
  let exit!: (result?: unknown) => void;
  let focusStep = 0;
  let focusBeforeOverlay = -1;

  const focusedPane = (): number => paneFocus.findIndex((focus) => focus?.isFocused.value === true);
  const checksum = (): number =>
    paneRows.reduce((total, rows) => total + rows.reduce((sum, row) => sum + row.value, 0), 0);
  const marker = (side: "TOP" | "BOTTOM"): string =>
    `__J5_${side}__ seq=${sequence.value} action=${actionName.value} focus=${focusedPane()} offsets=${scrollOffsets.join("/")} divider=${leftWidth.value} overlay=${overlayOpen.value ? "open" : "closed"} sum=${checksum()}`;

  const PaneGroup = defineComponent({
    props: { group: { type: Number, required: true } },
    setup(props) {
      const group = props.group;
      const scope = useFocusScope({ isActive: scopeActive[group], trapped: false });
      scopes[group] = scope;
      const firstPane = group * 2;
      for (let local = 0; local < 2; local++) {
        const pane = firstPane + local;
        paneFocus[pane] = useFocus(paneTargets[pane]!, {
          scope,
          autoFocus: local === 0,
        });
        paneGeometry[pane] = useElementGeometry(paneTargets[pane]!);
        useMouseEvent(paneTargets[pane]!, "wheel", (event) => {
          const delta = event.delta.y > 0 ? 1 : event.delta.y < 0 ? -1 : 0;
          if (delta === 0 || !paneScroll[pane]!.value?.scrollByLines(delta)) return "continue";
          scrollOffsets[pane] += delta;
          sequence.value++;
          actionName.value = `wheel-${pane}`;
          return "consume";
        });
      }

      return () => (
        <Box width="100%" height={38} flexDirection="column">
          {[firstPane, firstPane + 1].map((pane) => (
            <Box
              key={pane}
              ref={paneTargets[pane]}
              width="100%"
              height={19}
              flexDirection="column"
              flexShrink={0}
              overflow="hidden"
            >
              <Text>{`${paneFocus[pane]!.isFocused.value ? ">" : " "} pane ${pane}`}</Text>
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

  const Overlay = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const scope = useFocusScope({ trapped: true });
    overlayFocus = useFocus(target, { scope, autoFocus: true });
    useFocusScopeInput(scope, (event) => {
      if (event.sequence !== "c") return "continue";
      overlayOpen.value = false;
      sequence.value++;
      actionName.value = "overlay-close";
      return "consume";
    });
    useMouseEvent(target, "wheel", () => "consume");
    useMouseEvent(target, "click", () => "consume");
    return () => (
      <Box
        ref={target}
        position="absolute"
        left={30}
        top={8}
        width={60}
        height={12}
        borderStyle="single"
      >
        <Text>OVERLAY</Text>
      </Box>
    );
  });

  const App = defineComponent(() => {
    exit = useApp().exit;
    useFocusManager();
    dividerGeometry = useElementGeometry(dividerTarget);
    useMouseDrag(dividerTarget, (event: TuiMouseDragEvent) => {
      if (event.phase !== "start" && event.phase !== "move") return;
      if (event.movement.x === 0) return;
      leftWidth.value = Math.max(40, Math.min(79, leftWidth.value + event.movement.x));
      sequence.value++;
      actionName.value = "divider";
    });
    useInput((event) => {
      if (event.sequence === "f" && !overlayOpen.value) {
        switch (focusStep % 4) {
          case 0:
            (paneFocus[0]!.isFocused.value ? paneFocus[1] : paneFocus[0])!.focus();
            break;
          case 1:
            scopeActive[0]!.value = false;
            scopeActive[1]!.value = true;
            break;
          case 2:
            (paneFocus[2]!.isFocused.value ? paneFocus[3] : paneFocus[2])!.focus();
            break;
          case 3:
            scopeActive[1]!.value = false;
            scopeActive[0]!.value = true;
            break;
        }
        focusStep++;
        sequence.value++;
        actionName.value = "focus";
        return "consume";
      }
      if (event.sequence === "o" && !overlayOpen.value) {
        focusBeforeOverlay = focusedPane();
        overlayOpen.value = true;
        sequence.value++;
        actionName.value = "overlay-open";
        return "consume";
      }
      return "continue";
    });
    return () => (
      <Box width={120} height={40} flexDirection="column">
        <Text>{marker("TOP")}</Text>
        <Box width={120} height={38} flexDirection="row">
          <Box width={leftWidth.value} height={38} flexShrink={0} overflow="hidden">
            <PaneGroup group={0} />
          </Box>
          <Box ref={dividerTarget} width={1} height={38} flexShrink={0}>
            <Text>│</Text>
          </Box>
          <Box width={119 - leftWidth.value} height={38} flexShrink={0} overflow="hidden">
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
      assert.equal(paneFocus.filter((focus) => focus?.isFocused.value).length, 1);
      assertions += 2;
    }

    const wheelPoints = [
      { x: 2, y: 3 },
      { x: 2, y: 22 },
      { x: 62, y: 3 },
      { x: 62, y: 22 },
    ] as const;
    for (let action = 0; action < capacityManifest.j5.wheelActions; action++) {
      const pane = action % 4;
      const direction = action < 20 ? "down" : "up";
      const before = [...scrollOffsets];
      await recordVisible(latencies, async () => {
        await host.mouse.wheel(wheelPoints[pane]!, direction);
        await host.flush(`seq=${sequence.value}`);
      });
      assert.equal(scrollOffsets[pane], before[pane]! + (direction === "down" ? 1 : -1));
      for (let other = 0; other < 4; other++) {
        if (other !== pane) assert.equal(scrollOffsets[other], before[other]);
      }
      assertions += 4;
    }
    assert.deepEqual([...scrollOffsets], [0, 0, 0, 0]);
    assertions++;

    await host.mouse.down({ x: 59, y: 10 });
    for (let move = 1; move <= capacityManifest.j5.dividerMoves; move++) {
      const x = move <= 10 ? 59 + move : 69 - (move - 10);
      await recordVisible(latencies, async () => {
        await host.mouse.move({ x, y: 10 });
        await host.flush(`divider=${leftWidth.value}`);
      });
      const expectedWidth = move <= 10 ? 59 + move : 69 - (move - 10);
      assert.equal(leftWidth.value, expectedWidth);
      const geometry = dividerGeometry.geometry.value;
      assert.equal(geometry.status, "visible");
      if (geometry.status === "visible") {
        assert.equal(geometry.surface.x, leftWidth.value);
        assert.equal(geometry.surface.width, 1);
      }
      assertions += 4;
    }
    await host.mouse.up({ x: 59, y: 10 });
    assert.equal(leftWidth.value, 59);
    assertions++;

    await recordVisible(latencies, () => host.input("o", "overlay=open"));
    assert.equal(overlayFocus?.isFocused.value, true);
    const offsetsBeforeCoveredWheel = [...scrollOffsets];
    await host.mouse.wheel({ x: 35, y: 10 }, "down");
    assert.deepEqual([...scrollOffsets], offsetsBeforeCoveredWheel);
    assertions += 2;
    await recordVisible(latencies, () => host.input("c", "overlay=closed"));
    assert.equal(focusedPane(), focusBeforeOverlay);
    assert.equal(overlayFocus?.isFocused.value, false);
    assertions += 2;

    for (const geometry of paneGeometry) assert.equal(geometry?.geometry.value.status, "visible");
    assertions += paneGeometry.length;
    exit({ checksum: checksum() });
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
  assert.ok(counts.coordinatedBlocked > 0, "the public write result must expose non-acceptance");
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
  let exit!: (result?: unknown) => void;
  const frameMarker = (): string => `__J6I_FRAME__ update=${liveUpdate.value}`;

  const App = defineComponent(() => {
    writeStdout = useStdout().write;
    exit = useApp().exit;
    return () => (
      <Box width="100%" flexDirection="column">
        <Static items={records.value}>
          {{
            default: ({ item }: { item: J6InlineRecord }) => (
              <Text>{`${item.marker} request\nanswer ${item.id.toString().padStart(4, "0")}`}</Text>
            ),
          }}
        </Static>
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

    exit({ volume, records: records.value.length, update: liveUpdate.value });
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
  let exit!: (result?: unknown) => void;
  const checksum = (): number => rows.reduce((sum, row) => sum + row.value, 0);
  const frameMarker = (side: "TOP" | "BOTTOM"): string =>
    `__J6F_FRAME__ update=${liveUpdate.value} side=${side} checksum=${checksum()}`;

  const App = defineComponent(() => {
    writeStdout = useStdout().write;
    exit = useApp().exit;
    return () => (
      <Box width={120} height={40} flexDirection="column">
        <Text>{frameMarker("TOP")}</Text>
        <Box width={120} height={38} flexDirection="column" overflow="hidden">
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

    exit({ volume, update: liveUpdate.value, checksum: checksum() });
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
  let exit!: (result?: unknown) => void;
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
