import process from "node:process";
import { Box, Text, createApp, useApp, useInput } from "@vue-tui/runtime";
import { useMouseEvent } from "@vue-tui/runtime/fullscreen";
import {
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  vShow,
  watch,
  withDirectives,
  type ComponentPublicInstance,
} from "vue";

const visible = shallowRef(true);
const revision = shallowRef(0);
let mounts = 0;
let unmounts = 0;

function markPhase(phase: string): void {
  process.stdout.write(`\x1b]0;__VSHOW_PHASE__:${phase}:mounts=${mounts}:unmounts=${unmounts}\x07`);
}

async function markAfterCommit(phase: string): Promise<void> {
  await nextTick();
  await nextTick();
  markPhase(phase);
}

const VShowTarget = defineComponent({
  name: "VShowPtyTarget",
  props: {
    visible: { type: Boolean, required: true },
    revision: { type: Number, required: true },
  },
  setup(props) {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const value = shallowRef(props.revision);
    useMouseEvent(target, "click", () => "consume");
    watch(
      () => props.revision,
      (nextRevision) => {
        value.value = nextRevision;
      },
      { flush: "sync" },
    );
    onMounted(() => mounts++);
    onUnmounted(() => unmounts++);

    // This is the exact runtime form generated for
    // `<Box v-show="visible">...</Box>` by Vue's SFC compiler.
    return () =>
      withDirectives(
        h(Box, { ref: target, width: 12, height: 1, flexShrink: 0 }, () =>
          h(Text, null, () => `probe:${value.value}`),
        ),
        [[vShow, props.visible]],
      );
  },
});

const App = defineComponent(() => {
  const { exit } = useApp();
  useInput((event) => {
    if (event.kind !== "text") return;
    if (event.text === "h") {
      visible.value = false;
      void markAfterCommit("hidden");
      return;
    }
    if (event.text === "u") {
      revision.value = 2;
      void markAfterCommit("updated-hidden");
      return;
    }
    if (event.text === "s") {
      visible.value = true;
      void markAfterCommit("shown-again");
      return;
    }
    if (event.text === "q") {
      exit("v-show");
    }
  });

  onMounted(() => {
    void markAfterCommit("shown");
  });

  return () =>
    h(Box, { flexDirection: "column" }, () => [
      h(VShowTarget, { visible: visible.value, revision: revision.value }),
      h(Text, null, () => `visible=${visible.value} revision=${revision.value}`),
    ]);
});

process.stdout.write("__READY__\n");
const app = createApp(App);
app.mount({ mode: "fullscreen", maxFps: 0 });

void app.waitUntilExit().then(() => {
  process.stdout.write(`__VSHOW_OK__:mounts=${mounts}:unmounts=${unmounts}\n`);
});
