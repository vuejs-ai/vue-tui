import { shallowRef, defineComponent } from "vue";
import { Box, Text, Static, useInput, useExit } from "@vue-tui/runtime";
import { runAgentLoop, type Message } from "./agent";
import MessageList from "./components/MessageList";

type AppState = "idle" | "streaming" | "approving";

export default defineComponent(() => {
  const state = shallowRef<AppState>("idle");
  const inputText = shallowRef("");
  const completedMessages = shallowRef<Message[]>([]);
  const streamingText = shallowRef("");
  const pendingCommand = shallowRef("");
  const messages: Message[] = [];

  let approvalResolve: ((approved: boolean) => void) | null = null;
  const exit = useExit();

  const autoApprove = process.argv.includes("--yolo");

  async function submit() {
    const text = inputText.value.trim();
    if (!text) return;

    inputText.value = "";
    state.value = "streaming";
    streamingText.value = "";

    try {
      const updated = await runAgentLoop(text, messages, {
        onToken(token) {
          streamingText.value += token;
        },
        onToolCall(command) {
          // Flush current streaming text as a completed message before showing tool
          if (streamingText.value) {
            completedMessages.value = [
              ...completedMessages.value,
              { role: "assistant", content: streamingText.value },
            ];
            streamingText.value = "";
          }
          pendingCommand.value = command;
        },
        onToolResult(output) {
          // Flush the tool call and result as completed messages
          pendingCommand.value = "";
        },
        onComplete() {
          // Final streaming text becomes a completed message
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

      // Sync full message history
      messages.length = 0;
      messages.push(...updated);
    } catch (err: any) {
      completedMessages.value = [
        ...completedMessages.value,
        { role: "assistant", content: `Error: ${err.message}` },
      ];
    }

    streamingText.value = "";
    pendingCommand.value = "";
    state.value = "idle";
  }

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (state.value === "approving") {
      if (key.return) {
        state.value = "streaming";
        approvalResolve?.(true);
        approvalResolve = null;
      } else if (key.escape) {
        state.value = "streaming";
        approvalResolve?.(false);
        approvalResolve = null;
      }
      return;
    }

    if (state.value !== "idle") return;

    if (key.return) {
      submit();
    } else if (key.backspace || key.delete) {
      inputText.value = inputText.value.slice(0, -1);
    } else if (input && !key.ctrl && !key.meta) {
      inputText.value += input;
    }
  });

  return () => (
    <Box flexDirection="column">
      <Static items={completedMessages.value}>
        {{
          default: ({ item, index }: { item: Message; index: number }) => (
            <MessageList key={index} message={item} />
          ),
        }}
      </Static>

      {streamingText.value && (
        <Box>
          <Text>{streamingText.value}</Text>
        </Box>
      )}

      {state.value === "approving" && (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">{pendingCommand.value}</Text>
          <Text dimColor>{"  [Enter] run / [Esc] skip"}</Text>
        </Box>
      )}

      <Box>
        {state.value === "idle" ? (
          <Text>
            <Text color="cyan">{"> "}</Text>
            {inputText.value}
            <Text dimColor>{"█"}</Text>
          </Text>
        ) : state.value === "streaming" ? (
          <Text dimColor>{"..."}</Text>
        ) : null}
      </Box>
    </Box>
  );
});
