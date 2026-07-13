import assert from "node:assert/strict";
import process from "node:process";
import {
  Box,
  Text,
  createApp,
  useApp,
  useExternalInput,
  useFocus,
  useFocusedInput,
  useFocusManager,
  useFocusScope,
  useFocusScopeInput,
  useInput,
} from "@vue-tui/runtime";
import { defineComponent, onMounted, shallowRef, type ComponentPublicInstance } from "vue";

const requestedMode = process.argv[2] === "fullscreen" ? "fullscreen" : "inline";

const App = defineComponent(() => {
  const { exit } = useApp();
  const firstHost = shallowRef<ComponentPublicInstance | null>(null);
  const secondHost = shallowRef<ComponentPublicInstance | null>(null);
  const status = shallowRef("ready");
  const calls: string[] = [];
  const scope = useFocusScope();
  const first = useFocus(firstHost, { scope, autoFocus: true });
  const second = useFocus(secondHost, { scope });
  const manager = useFocusManager();

  useInput((event) => {
    calls.push(`global:${event.sequence}`);
    if (event.sequence !== "q") return "continue";
    assert.equal(manager.focusedTarget.value, second);
    assert.deepEqual(calls, [
      "global:x",
      "target:first:x",
      "scope:x",
      "external:first:x",
      "global:\t",
      "target:first:\t",
      "scope:\t",
      "global:y",
      "target:second:y",
      "scope:y",
      "external:second:y",
      "global:q",
    ]);
    exit();
    return "consume";
  });
  useFocusedInput(first, (event) => {
    calls.push(`target:first:${event.sequence}`);
    return "continue";
  });
  useFocusedInput(second, (event) => {
    calls.push(`target:second:${event.sequence}`);
    return "continue";
  });
  useFocusScopeInput(scope, (event) => {
    calls.push(`scope:${event.sequence}`);
    return "continue";
  });
  useExternalInput(first, ({ sequence }) => {
    calls.push(`external:first:${sequence}`);
    status.value = `external:first:${sequence}`;
  });
  useExternalInput(second, ({ sequence }) => {
    calls.push(`external:second:${sequence}`);
    status.value = `external:second:${sequence}`;
  });

  onMounted(() => process.stdout.write("__READY__"));

  return () => (
    <Box flexDirection="column">
      <Text>{manager.focusedTarget.value === first ? "focus:first" : "focus:second"}</Text>
      <Text>{status.value}</Text>
      <Box ref={firstHost}>
        <Text>first</Text>
      </Box>
      <Box ref={secondHost}>
        <Text>second</Text>
      </Box>
    </Box>
  );
});

const app = createApp(App);
app.mount({ mode: requestedMode, maxFps: 0, patchConsole: false });
await app.waitUntilExit();
process.stdout.write("__FOCUS_ROUTING_OK__");
