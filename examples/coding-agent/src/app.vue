<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, Static, useInput, useApp } from "@vue-tui/runtime";
import { runAgentLoop, type Message, type ToolCall } from "./agent";
import MessageList from "./components/message-list.vue";

type AppState = "idle" | "streaming" | "approving";

const state = shallowRef<AppState>("idle");
const inputText = shallowRef("");
const completedMessages = shallowRef<Message[]>([]);
const streamingText = shallowRef("");
const pendingCommand = shallowRef("");
const messages: Message[] = [];

let approvalResolve: ((approved: boolean) => void) | null = null;
const { exit } = useApp();

const autoApprove = process.argv.includes("--yolo");

async function submit() {
  const text = inputText.value.trim();
  if (!text) return;

  inputText.value = "";
  state.value = "streaming";
  streamingText.value = "";

  completedMessages.value = [...completedMessages.value, { role: "user" as const, content: text }];

  try {
    const updated = await runAgentLoop(text, messages, {
      onToken(token) {
        streamingText.value += token;
      },
      onToolCall(tc: ToolCall, command: string) {
        if (streamingText.value) {
          completedMessages.value = [
            ...completedMessages.value,
            { role: "assistant", content: streamingText.value },
          ];
          streamingText.value = "";
        }
        pendingCommand.value = command;
      },
      onToolResult(tc: ToolCall, output: string) {
        completedMessages.value = [
          ...completedMessages.value,
          { role: "assistant", tool_calls: [tc] },
          { role: "tool", tool_call_id: tc.id, content: output },
        ];
        pendingCommand.value = "";
      },
      onComplete() {
        if (streamingText.value) {
          completedMessages.value = [
            ...completedMessages.value,
            { role: "assistant", content: streamingText.value },
          ];
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
    completedMessages.value = [...completedMessages.value, ...errParts];
  }

  streamingText.value = "";
  pendingCommand.value = "";
  state.value = "idle";
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

  if (state.value === "approving") {
    if (event.kind === "key" && event.key.name === "return" && event.key.phase !== "release") {
      state.value = "streaming";
      approvalResolve?.(true);
      approvalResolve = null;
      return "consume";
    }
    if (event.kind === "key" && event.key.name === "escape" && event.key.phase !== "release") {
      state.value = "streaming";
      approvalResolve?.(false);
      approvalResolve = null;
      return "consume";
    }
    return {
      action: "none",
      routing: "stop",
      defaultAction: "prevent",
      external: "block",
    };
  }

  if (state.value !== "idle") {
    return {
      action: "none",
      routing: "stop",
      defaultAction: "prevent",
      external: "block",
    };
  }

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
</script>

<template>
  <Box flexDirection="column">
    <Static :items="completedMessages">
      <template #default="{ item, index }">
        <MessageList :key="index" :message="item" />
      </template>
    </Static>

    <Box v-if="streamingText">
      <Text>{{ streamingText }}</Text>
    </Box>

    <Box v-if="state === 'approving'" borderStyle="round" borderColor="yellow" :paddingX="1">
      <Text color="yellow">{{ pendingCommand }}</Text>
      <Text dimColor>{{ "  [Enter] run / [Esc] skip" }}</Text>
    </Box>

    <Box>
      <Text v-if="state === 'idle'">
        <Text color="cyan">&gt; </Text>{{ inputText }}<Text dimColor>█</Text>
      </Text>
      <Text v-else-if="state === 'streaming'" dimColor>...</Text>
    </Box>
  </Box>
</template>
