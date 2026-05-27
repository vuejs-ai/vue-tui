<script setup lang="ts">
import { Box, Text } from "@vue-tui/runtime";
import type { Message } from "../agent";

const { message } = defineProps<{ message: Message }>();

function parseCommand(tc: { function: { arguments: string } }): string {
  return JSON.parse(tc.function.arguments).command;
}
</script>

<template>
  <Box v-if="message.role === 'user'">
    <Text><Text bold color="green">You: </Text>{{ message.content }}</Text>
  </Box>

  <Box v-else-if="message.role === 'assistant' && message.tool_calls" flexDirection="column">
    <Text v-if="message.content">
      <Text bold color="cyan">Agent: </Text>{{ message.content }}
    </Text>
    <Box
      v-for="tc in message.tool_calls"
      :key="tc.id"
      borderStyle="round"
      borderColor="yellow"
      :paddingX="1"
    >
      <Text color="yellow">{{ parseCommand(tc) }}</Text>
    </Box>
  </Box>

  <Box v-else-if="message.role === 'assistant'">
    <Text><Text bold color="cyan">Agent: </Text>{{ message.content }}</Text>
  </Box>

  <Box v-else-if="message.role === 'tool'" :paddingLeft="2">
    <Text dimColor>{{ message.content }}</Text>
  </Box>
</template>
