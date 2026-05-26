import process from "node:process";
import { Box, Static, Text, createApp, useExit } from "@vue-tui/runtime";
import { defineComponent, onMounted, onScopeDispose, shallowRef, watch } from "vue";

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
    const exit = useExit();
    const frameCount = shallowRef(0);
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Mirror React useEffect: whenever frameCount changes, schedule next action
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

      return (
        <>
          {props.includeStaticLine ? (
            <Static items={["#450 static line"]}>
              {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
            </Static>
          ) : null}
          <Box height={targetHeight} flexDirection="column">
            <Text>#450 top</Text>
            <Box flexGrow={1}>
              <Text>{`frame ${frameCount.value}`}</Text>
            </Box>
            <Text>#450 bottom</Text>
          </Box>
        </>
      );
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
  (props: {
    renderedMarker: string;
    lineCount: number;
    linePrefix: string;
  }) => {
    const exit = useExit();

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
      const lines = [];
      for (let lineNumber = 1; lineNumber <= props.lineCount; lineNumber++) {
        lines.push(<Text key={lineNumber}>{`${props.linePrefix} line ${lineNumber}`}</Text>);
      }

      return <Box flexDirection="column">{lines}</Box>;
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
