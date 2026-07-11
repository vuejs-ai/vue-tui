import { defineComponent } from "vue";
import { Text, useLayoutSize, useRenderSession } from "@vue-tui/runtime";

export default defineComponent(() => {
  const session = useRenderSession();
  const { columns, rows } = useLayoutSize();

  return () => (
    <Text>
      {session.host === "live" ? (session.mode.effective ?? "stream") : "document"}:{columns.value}x
      {rows.value ?? "unbounded"}
    </Text>
  );
});
