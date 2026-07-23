import { defineComponent } from "vue";
import { Text, useLayoutWidth, useStdin, useViewportHeight } from "@vue-tui/runtime";

export default defineComponent(() => {
  const width = useLayoutWidth();
  const viewportHeight = useViewportHeight();
  const { stdin, isRawModeSupported, setRawMode } = useStdin();
  void stdin;
  void isRawModeSupported;
  setRawMode(false);

  return () => (
    <Text>
      {width.value}x{viewportHeight?.value ?? "unbounded"}
    </Text>
  );
});
