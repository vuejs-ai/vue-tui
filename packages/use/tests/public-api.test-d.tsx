import { shallowRef, type VNodeRef } from "vue";
import { Box, Text, type TuiInputEvent } from "@vue-tui/runtime";
import { UseInputWhileMounted } from "../src/components.ts";
import { useInputWhileMounted, type InputWhileMountedTargetRef } from "../src/index.ts";

const targetRef = useInputWhileMounted((event) => {
  if (event.type === "key") event.key.name?.toUpperCase();
});
const acceptedFunctionRef: InputWhileMountedTargetRef = targetRef;
const acceptedVueRef: VNodeRef = targetRef;
const bound = (
  <Box ref={targetRef}>
    <Text>bound</Text>
  </Box>
);

const liveHandler = shallowRef<(event: TuiInputEvent) => void>(() => undefined);
const liveInputRef = useInputWhileMounted(liveHandler);
const component = (
  <UseInputWhileMounted
    onInput={(event) => {
      if (event.type === "text") event.text.toUpperCase();
    }}
  >
    <Text>component</Text>
  </UseInputWhileMounted>
);

// @ts-expect-error The handler receives a normalized TuiInputEvent.
useInputWhileMounted((_event: string) => undefined);
// @ts-expect-error The component emits a normalized TuiInputEvent.
const wrongListener = <UseInputWhileMounted onInput={(_event: string) => undefined} />;
// @ts-expect-error The renderless component has no active prop; mount controls activity.
const wrongProp = <UseInputWhileMounted active />;

void acceptedFunctionRef;
void acceptedVueRef;
void bound;
void liveInputRef;
void component;
void wrongListener;
void wrongProp;
