import process from "node:process";
import { computed, defineComponent, shallowRef, type ComponentPublicInstance } from "vue";
import {
  Box,
  Text,
  createApp,
  useApp,
  useFocus,
  useFocusedInput,
  useFocusScope,
  useFocusScopeInput,
  useInput,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

type State = "idle" | "streaming" | "approving";
type HistoryEntry = { readonly id: number; readonly text: string };

const App = defineComponent(() => {
  const state = shallowRef<State>("idle");
  const approvals = shallowRef<readonly string[]>([]);
  const history = shallowRef<HistoryEntry[]>([]);
  let nextHistoryId = 0;
  const composerHost = shallowRef<ComponentPublicInstance | null>(null);
  const approvalHost = shallowRef<ComponentPublicInstance | null>(null);
  const { exit } = useApp();
  const composer = useFocus(composerHost, {
    autoFocus: true,
    disabled: computed(() => state.value !== "idle"),
  });
  const approvalScope = useFocusScope({
    isActive: computed(() => state.value === "approving"),
    trapped: true,
  });
  useFocus(approvalHost, { scope: approvalScope, autoFocus: true });

  const appendHistory = (text: string) => {
    history.value = [...history.value, { id: nextHistoryId++, text }];
  };

  const settleToIdle = () => {
    setTimeout(() => {
      appendHistory(`complete-${approvals.value.length}`);
      state.value = "idle";
      composer.focus();
    }, 10);
  };

  useInput((event) => {
    if (event.kind === "text" && event.text === "q") {
      exit();
      return "consume";
    }
    return "continue";
  });
  useFocusedInput(composer, (event) => {
    if (event.kind !== "key" || event.key.name !== "return") return "continue";
    appendHistory(`user-${approvals.value.length + 1}`);
    state.value = "streaming";
    setTimeout(() => {
      appendHistory(`assistant-${approvals.value.length + 1}`);
      state.value = "approving";
    }, 10);
    return "consume";
  });
  useFocusScopeInput(approvalScope, (event) => {
    if (event.kind !== "key" || (event.key.name !== "return" && event.key.name !== "escape")) {
      return {
        action: "none",
        routing: "stop",
        defaultAction: "prevent",
        external: "block",
      };
    }
    approvals.value = [...approvals.value, event.key.name];
    appendHistory(`tool-${event.key.name}`);
    state.value = "streaming";
    settleToIdle();
    return "consume";
  });

  return () => (
    <Box flexDirection="column">
      {history.value.map((entry) => (
        <Static key={entry.id}>
          <Text>{entry.text}</Text>
        </Static>
      ))}
      <Text>{`state=${state.value} approvals=${approvals.value.join(",") || "none"}`}</Text>
      {state.value === "approving" ? (
        <Box ref={approvalHost}>
          <Text>approval [Enter] run / [Esc] skip</Text>
        </Box>
      ) : null}
      <Box ref={composerHost}>
        <Text>composer</Text>
      </Box>
    </Box>
  );
});

process.stdout.write("__READY__");
const app = createApp(App);
app.mount();
await app.waitUntilExit();
process.stdout.write("__APPROVAL_REACTIVATION_OK__");
