import { defineComponent } from "vue";
import { Text, useLayoutWidth, useStdin, useViewportHeight } from "@vue-tui/runtime";

export default defineComponent(() => {
  const width = useLayoutWidth();
  const viewportHeight = useViewportHeight();
  const { stdin } = useStdin();
  void stdin;
  // @ts-expect-error Raw-mode control is internal to semantic input demand.
  useStdin().setRawMode(false);

  return () => (
    <Text>
      {width.value}x{viewportHeight?.value ?? "unbounded"}
    </Text>
  );
});
