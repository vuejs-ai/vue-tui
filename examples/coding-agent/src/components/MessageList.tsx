import { defineComponent, type PropType } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import type { Message } from "../agent";

export default defineComponent({
  props: {
    message: { type: Object as PropType<Message>, required: true },
  },
  setup(props) {
    return () => {
      const msg = props.message;

      if (msg.role === "user") {
        return (
          <Box>
            <Text bold color="green">
              {"You: "}
            </Text>
            <Text>{msg.content}</Text>
          </Box>
        );
      }

      if (msg.role === "assistant") {
        if (msg.tool_calls) {
          const parts: any[] = [];
          if (msg.content) {
            parts.push(<Text>{msg.content}</Text>);
          }
          for (const tc of msg.tool_calls) {
            const parsed = JSON.parse(tc.function.arguments);
            parts.push(
              <Box borderStyle="round" borderColor="yellow" paddingX={1}>
                <Text color="yellow">{parsed.command}</Text>
              </Box>,
            );
          }
          return <Box flexDirection="column">{parts}</Box>;
        }
        return (
          <Box>
            <Text>{msg.content}</Text>
          </Box>
        );
      }

      if (msg.role === "tool") {
        return (
          <Box paddingLeft={2}>
            <Text dimColor>{msg.content}</Text>
          </Box>
        );
      }

      return null;
    };
  },
});
