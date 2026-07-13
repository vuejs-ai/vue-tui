import assert from "node:assert/strict";
import process from "node:process";
import {
  Box,
  Text,
  createApp,
  useApp,
  useCaret,
  useExternalInput,
  useFocus,
  useFocusedInput,
  useFocusManager,
  useFocusScope,
  useFocusScopeInput,
  useInput,
  type TuiInputEvent,
} from "@vue-tui/runtime";
import { defineComponent, h, onMounted, shallowRef, type ComponentPublicInstance } from "vue";

const requestedMode = process.argv[2] === "fullscreen" ? "fullscreen" : "inline";
const assertionRun = process.argv[3] === "assert";
const pastePayload = "terminal-paste";
const pasteSequence = `\x1b[200~${pastePayload}\x1b[201~`;
let completedCalls: readonly string[] = [];

const expectedCalls = [
  "global:x",
  "target:first:x",
  "scope:background:x",
  "external:first:x",
  "global:Tab",
  "target:first:Tab",
  "scope:background:Tab",
  "global:r",
  "target:second:r",
  "scope:background:r",
  "external:second:r",
  "global:o",
  "target:first:o",
  "scope:background:o",
  "external:first:o",
  "global:m",
  "scope:modal:m",
  "target:modal:m",
  "external:modal:m",
  "global:c",
  "scope:modal:c",
  "global:Paste:terminal-paste",
  "target:first:Paste:terminal-paste",
  "scope:background:Paste:terminal-paste",
  "external:first:Paste:terminal-paste",
  "global:q",
] as const;

function eventLabel(event: TuiInputEvent): string {
  if (event.kind === "paste") return `Paste:${event.text}`;
  if (event.kind === "key" && event.key.name === "tab") return "Tab";
  if (event.kind === "text") return event.text;
  return event.sequence;
}

function sequenceLabel(sequence: string): string {
  if (sequence === pasteSequence) return `Paste:${pastePayload}`;
  if (sequence === "\t") return "Tab";
  return sequence;
}

const App = defineComponent(() => {
  const { exit } = useApp();
  const firstHost = shallowRef<ComponentPublicInstance | null>(null);
  const secondHost = shallowRef<ComponentPublicInstance | null>(null);
  const showSecond = shallowRef(true);
  const showModal = shallowRef(false);
  const latestFact = shallowRef("none");
  const latestRoute = shallowRef<readonly string[]>([]);
  const calls: string[] = [];
  const backgroundScope = useFocusScope();
  const first = useFocus(firstHost, { scope: backgroundScope, autoFocus: true });
  const second = useFocus(secondHost, { scope: backgroundScope });
  const firstCaret = useCaret(firstHost, { focus: first, position: { x: 2, y: 0 } });
  const secondCaret = useCaret(secondHost, { focus: second, position: { x: 2, y: 0 } });
  const manager = useFocusManager();
  const visibleRecipient: Readonly<Record<string, string>> = {
    global: "global",
    "target:first": "first",
    "target:second": "second",
    "scope:background": "background",
    "external:first": "ext:first",
    "external:second": "ext:second",
    "scope:modal": "trap",
    "target:modal": "modal",
    "external:modal": "ext:modal",
  };

  const record = (recipient: string, label: string) => {
    if (recipient === "global") {
      latestFact.value = label.startsWith("Paste:") ? "Paste" : label;
      latestRoute.value = [];
    }
    latestRoute.value = [...latestRoute.value, visibleRecipient[recipient] ?? recipient];
    calls.push(`${recipient}:${label}`);
  };

  const ApprovalModal = defineComponent(() => {
    const modalHost = shallowRef<ComponentPublicInstance | null>(null);
    const modalScope = useFocusScope({ trapped: true });
    const modal = useFocus(modalHost, { scope: modalScope, autoFocus: true });

    useFocusScopeInput(modalScope, (event) => {
      const label = eventLabel(event);
      record("scope:modal", label);
      if (event.kind === "text" && event.text === "c") {
        // Returning consume keeps the closing fact inside the captured modal
        // boundary. The following Vue commit unmounts this component, disposes
        // its scope, and restores the outer focus owner.
        showModal.value = false;
        return "consume";
      }
      return "continue";
    });
    useFocusedInput(modal, (event) => {
      record("target:modal", eventLabel(event));
      return "continue";
    });
    // The modal may explicitly own external fallthrough, but the background
    // external owners remain isolated behind the active trapped boundary.
    useExternalInput(modal, ({ sequence }) => {
      record("external:modal", sequenceLabel(sequence));
    });

    return () =>
      h(
        Box,
        { ref: modalHost, borderStyle: "double", flexDirection: "column", paddingX: 1 },
        {
          default: () => [
            h(Text, { bold: true }, { default: () => "Approval modal (trapped)" }),
            h(Text, null, { default: () => "m isolates; c closes and unmounts" }),
          ],
        },
      );
  });

  useInput((event) => {
    const label = eventLabel(event);
    record("global", label);
    if (event.kind === "text" && event.text === "r") showSecond.value = false;
    if (event.kind === "text" && event.text === "o") showModal.value = true;
    if (event.kind !== "text" || event.text !== "q") return "continue";

    if (assertionRun) {
      assert.equal(manager.focusedTarget.value, first);
      assert.equal(first.isFocused.value, true);
      assert.equal(second.isFocused.value, false);
      assert.equal(showSecond.value, false);
      assert.equal(showModal.value, false);
      assert.deepEqual(calls, expectedCalls);
    }
    completedCalls = [...calls];
    exit();
    return "consume";
  });
  useFocusedInput(first, (event) => {
    record("target:first", eventLabel(event));
    return "continue";
  });
  useFocusedInput(second, (event) => {
    record("target:second", eventLabel(event));
    return "continue";
  });
  useFocusScopeInput(backgroundScope, (event) => {
    record("scope:background", eventLabel(event));
    return "continue";
  });
  useExternalInput(first, ({ sequence }) => {
    record("external:first", sequenceLabel(sequence));
  });
  useExternalInput(second, ({ sequence }) => {
    record("external:second", sequenceLabel(sequence));
  });

  onMounted(() => {
    if (assertionRun) process.stdout.write("__READY__");
  });

  const focusedName = () =>
    manager.focusedTarget.value === first
      ? "first"
      : manager.focusedTarget.value === second
        ? "second"
        : showModal.value
          ? "modal"
          : "none";

  const caretLabel = (state: typeof firstCaret.state.value) =>
    state.status === "hidden" ? `hidden:${state.reason}` : state.status;

  return () =>
    h(
      Box,
      { flexDirection: "column", borderStyle: "round", width: 62, paddingX: 1 },
      {
        default: () => [
          h(
            Text,
            { bold: true },
            { default: () => `Focus and caret lifecycle (${requestedMode})` },
          ),
          h(Text, null, {
            default: () =>
              `focus=${focusedName()} second=${showSecond.value ? "present" : "removed"} modal=${showModal.value ? "open" : "closed"}`,
          }),
          h(Text, null, {
            default: () =>
              `carets=first:${caretLabel(firstCaret.state.value)} second:${caretLabel(secondCaret.state.value)}`,
          }),
          h(Text, null, {
            default: () =>
              `latest=${latestFact.value} route=${latestRoute.value.join(" > ") || "none"}`,
          }),
          h(Text, null, {
            default: () => "Keys: x, Tab, r, o, m, c, paste, q",
          }),
          h(
            Box,
            { ref: firstHost },
            {
              default: () =>
                h(Text, null, {
                  default: () => `${first.isFocused.value ? "> " : "  "}first target`,
                }),
            },
          ),
          showSecond.value
            ? h(
                Box,
                { ref: secondHost },
                {
                  default: () =>
                    h(Text, null, {
                      default: () => `${second.isFocused.value ? "> " : "  "}second target`,
                    }),
                },
              )
            : null,
          showModal.value ? h(ApprovalModal) : null,
        ],
      },
    );
});

const app = createApp(App);
app.mount({
  mode: requestedMode,
  maxFps: 0,
  patchConsole: false,
  // Automatic capability detection has its own real-PTY coverage. This F4
  // journey explicitly enables the protocol so a simulated query reply cannot
  // race the bounded detection window while the full PTY suite runs in parallel.
  kittyKeyboard: { mode: "enabled" },
});
await app.waitUntilExit();
if (assertionRun) {
  process.stdout.write(`__TRACE__${JSON.stringify(completedCalls)}__`);
  process.stdout.write("__FOCUS_ROUTING_OK__");
}
