import process from "node:process";
import { Box, Static, Text, createApp, useAppContext } from "@vue-tui/runtime";
import { Fragment, defineComponent, h, onMounted, onScopeDispose, shallowRef, watch } from "vue";

type RerenderFixtureOptions = {
  readonly completionMarker?: string;
  readonly frameLimit?: number;
  readonly includeStaticLine?: boolean;
  readonly rowsFallback?: number;
  readonly heightForFrame: (rows: number, frameCount: number) => number;
};

const Issue450RerenderFixtureComponent = defineComponent(
  (props: {
    completionMarker?: string;
    frameLimit: number;
    includeStaticLine: boolean;
    heightForFrame: (rows: number, frameCount: number) => number;
    rows: number;
  }) => {
    const { exit } = useAppContext();
    const frameCount = shallowRef(0);
    let timer: ReturnType<typeof setTimeout> | undefined;

    watch(
      frameCount,
      (count) => {
        clearTimeout(timer);

        if (count >= props.frameLimit) {
          timer = setTimeout(() => {
            if (props.completionMarker) {
              process.stdout.write(props.completionMarker);
            }

            exit();
          }, 0);
          return;
        }

        timer = setTimeout(() => {
          frameCount.value++;
        }, 100);
      },
      { immediate: true },
    );

    onScopeDispose(() => {
      clearTimeout(timer);
    });

    return () => {
      const targetHeight = props.heightForFrame(props.rows, frameCount.value);

      return h(Fragment, [
        props.includeStaticLine
          ? h(
              Static,
              { items: ["#450 static line"] },
              {
                default: ({ item }: { item: string }) => h(Text, { key: item }, () => item),
              },
            )
          : null,
        h(Box, { height: targetHeight, flexDirection: "column" }, () => [
          h(Text, null, () => "#450 top"),
          h(Box, { flexGrow: 1 }, () => h(Text, null, () => `frame ${frameCount.value}`)),
          h(Text, null, () => "#450 bottom"),
        ]),
      ]);
    };
  },
  { props: ["completionMarker", "frameLimit", "includeStaticLine", "heightForFrame", "rows"] },
);

export const runIssue450RerenderFixture = ({
  completionMarker,
  frameLimit = 8,
  includeStaticLine = false,
  rowsFallback = 6,
  heightForFrame,
}: RerenderFixtureOptions): void => {
  const rows = Number(process.argv[2]) || rowsFallback;
  process.stdout.rows = rows;

  const app = createApp(Issue450RerenderFixtureComponent, {
    completionMarker,
    frameLimit,
    includeStaticLine,
    heightForFrame,
    rows,
  });
  app.mount();
};

type InitialFixtureOptions = {
  readonly rowsFallback?: number;
  readonly renderedMarker: string;
  readonly lineCount: number;
  readonly linePrefix: string;
};

const Issue450InitialFixtureComponent = defineComponent(
  (props: { renderedMarker: string; lineCount: number; linePrefix: string }) => {
    const { exit } = useAppContext();

    onMounted(() => {
      const timer = setTimeout(() => {
        process.stdout.write(props.renderedMarker);
        exit();
      }, 0);

      onScopeDispose(() => {
        clearTimeout(timer);
      });
    });

    return () => {
      const lines: ReturnType<typeof h>[] = [];
      for (let lineNumber = 1; lineNumber <= props.lineCount; lineNumber++) {
        lines.push(h(Text, { key: lineNumber }, () => `${props.linePrefix} line ${lineNumber}`));
      }

      return h(Box, { flexDirection: "column" }, () => lines);
    };
  },
  { props: ["renderedMarker", "lineCount", "linePrefix"] },
);

export const runIssue450InitialFixture = ({
  rowsFallback = 3,
  renderedMarker,
  lineCount,
  linePrefix,
}: InitialFixtureOptions): void => {
  const rows = Number(process.argv[2]) || rowsFallback;
  process.stdout.rows = rows;

  const app = createApp(Issue450InitialFixtureComponent, {
    renderedMarker,
    lineCount,
    linePrefix,
  });
  app.mount();
};
