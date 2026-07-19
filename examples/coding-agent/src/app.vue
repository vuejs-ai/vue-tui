<script setup lang="ts">
import { shallowRef } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";
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
const messages: Message[] = [];
let nextCompletedMessageId = 0;

let approvalResolve: ((approved: boolean) => void) | null = null;

const autoApprove = process.argv.includes("--yolo");

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
}

useInput((event) => {
  if (state.value === "approving") {
    if (event.kind !== "key" || (event.name !== "enter" && event.name !== "escape")) return;
    state.value = "streaming";
    approvalResolve?.(event.name === "enter");
    approvalResolve = null;
    return;
  }

  if (state.value !== "idle") return;
  if (event.kind === "text" || event.kind === "paste") {
    inputText.value += event.text;
    return;
  }
  if (event.name === "backspace" || event.name === "delete") {
    inputText.value = inputText.value.slice(0, -1);
  } else if (event.name === "enter") {
    void submit();
  }
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
      borderStyle="round"
      borderColor="yellow"
      :paddingLeft="1"
      :paddingRight="1"
    >
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
