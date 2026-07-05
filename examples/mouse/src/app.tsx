import { defineComponent, shallowRef } from "vue";
import {
  Box,
  Text,
  useDraggable,
  useInput,
  type MouseTarget,
  type TuiMouseEvent,
  type TuiWheelEvent,
} from "@vue-tui/runtime";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default defineComponent(() => {
  const clicks = shallowRef(0);
  const lastClick = shallowRef("none");
  const lastWheel = shallowRef("none");
  const dragRef = shallowRef<MouseTarget | null>(null);
  const dragLeft = shallowRef(2);
  const dragTop = shallowRef(7);
  let dragStartLeft = 0;
  let dragStartTop = 0;
  let dragStartX = 0;
  let dragStartY = 0;

  useInput((input) => {
    if (input === "q") process.exit(0);
  });

  useDraggable(dragRef, {
    onStart(event: TuiMouseEvent) {
      dragStartLeft = dragLeft.value;
      dragStartTop = dragTop.value;
      dragStartX = event.screenX;
      dragStartY = event.screenY;
    },
    onMove(event: TuiMouseEvent) {
      dragLeft.value = clamp(dragStartLeft + event.screenX - dragStartX, 0, 42);
      dragTop.value = clamp(dragStartTop + event.screenY - dragStartY, 4, 12);
    },
  });

  function onPanelClick(event: TuiMouseEvent) {
    clicks.value += 1;
    lastClick.value = `${event.button} @ ${event.offsetX},${event.offsetY} (${event.detail})`;
  }

  function onPanelWheel(event: TuiWheelEvent) {
    lastWheel.value = `${event.deltaX},${event.deltaY} @ ${event.offsetX},${event.offsetY}`;
  }

  return () => (
    <Box flexDirection="column" width="100%" height="100%" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        vue-tui mouse input
      </Text>
      <Text dimColor>Click, wheel, or drag the block. Press q to quit.</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Clicks: {clicks.value}</Text>
        <Text>Last click: {lastClick.value}</Text>
        <Text>Last wheel: {lastWheel.value}</Text>
      </Box>
      <Box
        marginTop={1}
        width={50}
        height={10}
        borderStyle="single"
        borderColor="gray"
        onClick={onPanelClick}
        onWheel={onPanelWheel}
      >
        <Box
          ref={dragRef}
          position="absolute"
          left={dragLeft.value}
          top={dragTop.value}
          width={8}
          height={3}
          borderStyle="round"
          borderColor="green"
          alignItems="center"
          justifyContent="center"
        >
          <Text color="green">drag</Text>
        </Box>
      </Box>
    </Box>
  );
});
