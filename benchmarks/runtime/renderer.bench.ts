import { afterAll, bench, describe } from "vite-plus/test";
import { runtimeBenchmarkScenarios, type RuntimeBenchmarkSession } from "./fixtures/workloads.tsx";

describe("Runtime renderer", () => {
  // Tinybench 2.9 does not await teardown promises. Start disposal synchronously,
  // then await it before the next mount and before the suite finishes.
  let pendingDisposal = Promise.resolve();
  afterAll(() => pendingDisposal);

  for (const scenario of runtimeBenchmarkScenarios) {
    let session: RuntimeBenchmarkSession | undefined;

    bench(
      scenario.name,
      async () => {
        if (!session) throw new Error(`Benchmark session "${scenario.name}" is not mounted.`);
        await session.update();
      },
      {
        async setup() {
          await pendingDisposal;
          session = await scenario.mount();
        },
        teardown() {
          const active = session;
          session = undefined;
          if (active) pendingDisposal = active.dispose();
        },
      },
    );
  }
});
