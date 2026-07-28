import { Box, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { defineComponent, shallowReactive, shallowRef } from "vue";
import { mountBenchmarkTerminal } from "./terminal.ts";

export interface RuntimeBenchmarkSession {
  update(): Promise<void>;
  dispose(): Promise<void>;
}

export interface RuntimeBenchmarkScenario {
  readonly name: string;
  mount(): Promise<RuntimeBenchmarkSession>;
}

interface Row {
  readonly id: number;
  readonly label: string;
  readonly value: number;
}

function rows(length: number, prefix: string): Row[] {
  return Array.from({ length }, (_, id) => ({
    id,
    label: `${prefix}-${id.toString().padStart(3, "0")}`,
    value: id,
  }));
}

const inlineTranscript: RuntimeBenchmarkScenario = {
  name: "inline transcript update",
  async mount() {
    const completed = rows(200, "record");
    const sequence = shallowRef(0);
    const tokenCount = shallowRef(1);
    const App = defineComponent(() => () => (
      <Box width={100} flexDirection="column">
        {completed.map((record) => (
          <Static key={record.id}>
            <Text>{`${record.label} value=${record.value}`}</Text>
          </Static>
        ))}
        <Text>{`sequence=${sequence.value}`}</Text>
        <Text>{`response=${"x".repeat(tokenCount.value)}`}</Text>
      </Box>
    ));
    const terminal = await mountBenchmarkTerminal(App, {
      mode: "inline",
      columns: 100,
      rows: 30,
    });

    return Object.freeze({
      async update() {
        sequence.value++;
        tokenCount.value = (tokenCount.value % 80) + 1;
        await terminal.flush();
      },
      dispose: () => terminal.dispose(),
    });
  },
};

const fullscreenTable: RuntimeBenchmarkScenario = {
  name: "fullscreen sparse table update",
  async mount() {
    const table = shallowReactive(rows(120, "metric"));
    let sequence = 0;
    const App = defineComponent(() => () => (
      <Box width={120} height={40} flexDirection="column" overflowY="hidden">
        {table.map((row) => (
          <Box key={row.id} width={120} height={1} flexDirection="row" flexShrink={0}>
            <Box width={24}>
              <Text>{row.label}</Text>
            </Box>
            <Box width={24}>
              <Text>{`value=${row.value}`}</Text>
            </Box>
            <Box width={72}>
              <Text>{"▁▂▃▄▅▆▇█".repeat(9)}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    ));
    const terminal = await mountBenchmarkTerminal(App, {
      mode: "fullscreen",
      columns: 120,
      rows: 40,
    });

    return Object.freeze({
      async update() {
        const index = sequence % table.length;
        const current = table[index]!;
        table[index] = { ...current, value: current.value + 1 };
        sequence++;
        await terminal.flush();
      },
      dispose: () => terminal.dispose(),
    });
  },
};

const nestedPanes: RuntimeBenchmarkScenario = {
  name: "fullscreen nested panes update",
  async mount() {
    const paneRows = Array.from({ length: 4 }, (_, pane) =>
      shallowReactive(rows(80, `pane-${pane}`)),
    );
    const activePane = shallowRef(0);
    const leftWidth = shallowRef(60);
    let sequence = 0;
    const pane = (index: number) => (
      <Box width="100%" height={20} flexDirection="column" overflowY="hidden" flexShrink={0}>
        <Text>{`${activePane.value === index ? ">" : " "} pane ${index}`}</Text>
        {paneRows[index]!.map((row) => (
          <Text key={row.id}>{`${row.label} value=${row.value}`}</Text>
        ))}
      </Box>
    );
    const App = defineComponent(() => () => (
      <Box width={120} height={40} flexDirection="row">
        <Box width={leftWidth.value} height={40} flexDirection="column">
          {pane(0)}
          {pane(1)}
        </Box>
        <Box width={120 - leftWidth.value} height={40} flexDirection="column">
          {pane(2)}
          {pane(3)}
        </Box>
      </Box>
    ));
    const terminal = await mountBenchmarkTerminal(App, {
      mode: "fullscreen",
      columns: 120,
      rows: 40,
    });

    return Object.freeze({
      async update() {
        const paneIndex = sequence % paneRows.length;
        const selectedRows = paneRows[paneIndex]!;
        const rowIndex = sequence % selectedRows.length;
        const current = selectedRows[rowIndex]!;
        selectedRows[rowIndex] = { ...current, value: current.value + 1 };
        activePane.value = paneIndex;
        leftWidth.value = sequence % 2 === 0 ? 58 : 62;
        sequence++;
        await terminal.flush();
      },
      dispose: () => terminal.dispose(),
    });
  },
};

export const runtimeBenchmarkScenarios: readonly RuntimeBenchmarkScenario[] = Object.freeze([
  inlineTranscript,
  fullscreenTable,
  nestedPanes,
]);
