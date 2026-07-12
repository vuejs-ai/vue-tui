import { defineComponent } from "vue";
import { Text, useLayoutSize, useRenderSession, useStdin } from "@vue-tui/runtime";

export default defineComponent(() => {
  const session = useRenderSession();
  const { columns, rows } = useLayoutSize();
  const { stdin } = useStdin();
  void stdin;
  // @ts-expect-error Raw-mode control is internal to semantic input demand.
  useStdin().setRawMode(false);

  return () => (
    <Text>
      {session.host === "live" ? (session.mode.effective ?? "stream") : "document"}:{columns.value}x
      {rows.value ?? "unbounded"}
    </Text>
  );
});
