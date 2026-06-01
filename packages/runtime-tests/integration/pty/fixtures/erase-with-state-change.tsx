import process from "node:process";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, onScopeDispose, shallowRef } from "vue";

const Erase = defineComponent(() => {
  const show = shallowRef(true);

  onMounted(() => {
    const timer = setTimeout(() => {
      show.value = false;
    });

    onScopeDispose(() => {
      clearTimeout(timer);
    });
  });

  return () =>
    h(Box, { flexDirection: "column" }, () =>
      show.value
        ? [h(Text, null, () => "A"), h(Text, null, () => "B"), h(Text, null, () => "C")]
        : [],
    );
});

process.stdout.rows = Number(process.argv[2]);
const app = createApp(Erase);
app.mount({ rawMode: "auto" }); // relies on auto-exit (default "always" holds raw & never exits)
