import { defineComponent } from "vue";
import { Text, useLayoutSize, useStdin } from "@vue-tui/runtime";

export default defineComponent(() => {
  const { width, height } = useLayoutSize();
  const { stdin, isRawModeSupported, setRawMode } = useStdin();
  void stdin;
  void isRawModeSupported;
  setRawMode(false);

  return () => (
    <Text>
      {width.value}x{height.value === Infinity ? "unbounded" : height.value}
    </Text>
  );
});
