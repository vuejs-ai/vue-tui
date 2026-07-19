<script setup lang="ts">
import { computed, shallowRef, type ComponentPublicInstance } from "vue";
import {
  Box,
  Text,
  useApp,
  useFocus,
  useFocusedInput,
  useFocusScope,
  useFocusScopeInput,
  useInput,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { runAgentLoop, type Message, type ToolCall } from "./agent";
import MessageList from "./components/message-list.vue";

type AppState = "idle" | "streaming" | "approving";
interface CompletedMessage {
  id: number;
  message: Message;
}

const state = shallowRef<AppState>("idle");
const inputText = shallowRef("");
const completedMessages = shallowRef<CompletedMessage[]>([]);
const streamingText = shallowRef("");
const pendingCommand = shallowRef("");
const composerHost = shallowRef<ComponentPublicInstance | null>(null);
const approvalHost = shallowRef<ComponentPublicInstance | null>(null);
const messages: Message[] = [];
let nextCompletedMessageId = 0;

let approvalResolve: ((approved: boolean) => void) | null = null;
const { exit } = useApp();

const autoApprove = process.argv.includes("--yolo");
const composer = useFocus(composerHost, {
  autoFocus: true,
  disabled: computed(() => state.value !== "idle"),
});
const approvalScope = useFocusScope({
  isActive: computed(() => state.value === "approving"),
  trapped: true,
});
useFocus(approvalHost, {
  scope: approvalScope,
  autoFocus: true,
});

function appendCompletedMessages(...pending: Message[]) {
  completedMessages.value = [
    ...completedMessages.value,
    ...pending.map((message) => ({ id: nextCompletedMessageId++, message })),
  ];
}

async function submit() {
  const text = inputText.value.trim();
  if (!text) return;

  inputText.value = "";
  state.value = "streaming";
  streamingText.value = "";

  appendCompletedMessages({ role: "user", content: text });

  try {
    const updated = await runAgentLoop(text, messages, {
      onToken(token) {
        streamingText.value += token;
      },
      onToolCall(tc: ToolCall, command: string) {
        if (streamingText.value) {
          appendCompletedMessages({ role: "assistant", content: streamingText.value });
          streamingText.value = "";
        }
        pendingCommand.value = command;
      },
      onToolResult(tc: ToolCall, output: string) {
        appendCompletedMessages(
          { role: "assistant", tool_calls: [tc] },
          { role: "tool", tool_call_id: tc.id, content: output },
        );
        pendingCommand.value = "";
      },
      onComplete() {
        if (streamingText.value) {
          appendCompletedMessages({ role: "assistant", content: streamingText.value });
          streamingText.value = "";
        }
      },
      autoApprove,
      requestApproval(command) {
        state.value = "approving";
        pendingCommand.value = command;
        return new Promise<boolean>((resolve) => {
          approvalResolve = resolve;
        });
      },
    });

    messages.length = 0;
    messages.push(...updated);
  } catch (err: any) {
    const errParts: Message[] = [];
    if (streamingText.value) {
      errParts.push({ role: "assistant", content: streamingText.value });
    }
    errParts.push({ role: "assistant", content: `Error: ${err.message}` });
    appendCompletedMessages(...errParts);
  }

  streamingText.value = "";
  pendingCommand.value = "";
  state.value = "idle";
  composer.focus();
}

useInput((event) => {
  const isCtrlC =
    event.kind === "key" &&
    event.key.name === "c" &&
    event.key.modifiers.ctrl &&
    event.key.phase !== "release";
  if (isCtrlC) {
    exit();
    return "consume";
  }

  return "continue";
});

useFocusedInput(composer, (event) => {
  if (event.kind === "key" && event.key.name === "return" && event.key.phase !== "release") {
    void submit();
    return "consume";
  }
  if (
    event.kind === "key" &&
    (event.key.name === "backspace" || event.key.name === "delete") &&
    event.key.phase !== "release"
  ) {
    inputText.value = inputText.value.slice(0, -1);
    return "consume";
  }
  if (event.kind === "paste") {
    inputText.value += event.text;
    return "consume";
  }
  if (event.kind === "text") {
    inputText.value += event.text;
    return "consume";
  }
  if (
    event.kind === "key" &&
    event.key.reportedText !== null &&
    event.key.phase !== "release" &&
    !event.key.modifiers.ctrl &&
    !event.key.modifiers.alt &&
    !event.key.modifiers.meta &&
    !event.key.modifiers.super &&
    !event.key.modifiers.hyper
  ) {
    inputText.value += event.key.reportedText;
    return "consume";
  }
  return "continue";
});

useFocusScopeInput(approvalScope, (event) => {
  if (
    event.kind === "key" &&
    (event.key.name === "return" || event.key.name === "escape") &&
    event.key.phase !== "release"
  ) {
    state.value = "streaming";
    approvalResolve?.(event.key.name === "return");
    approvalResolve = null;
    return "consume";
  }
  return {
    action: "none",
    routing: "stop",
    defaultAction: "prevent",
    external: "block",
  };
});
</script>

<template>
  <Box flexDirection="column">
    <Static v-for="entry in completedMessages" :key="entry.id">
      <MessageList :message="entry.message" />
    </Static>

    <Box v-if="streamingText">
      <Text>{{ streamingText }}</Text>
    </Box>

    <Box
      v-if="state === 'approving'"
      ref="approvalHost"
      borderStyle="round"
      borderColor="yellow"
      :paddingLeft="1"
      :paddingRight="1"
    >
      <Text color="yellow">{{ pendingCommand }}</Text>
      <Text dimColor>{{ "  [Enter] run / [Esc] skip" }}</Text>
    </Box>

    <Box ref="composerHost">
      <Text v-if="state === 'idle'">
        <Text color="cyan">&gt; </Text>{{ inputText }}<Text dimColor>█</Text>
      </Text>
      <Text v-else-if="state === 'streaming'" dimColor>...</Text>
    </Box>
  </Box>
</template>
