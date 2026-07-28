import { availableParallelism } from "node:os";
import { defineConfig } from "vite-plus";

// The `test` and `check` entry tasks use this deliberately simple saturation
// heuristic rather than claiming exact CPU use by child processes. Keep up to
// three graph branches active, but never schedule more branches than CPUs.
const TEST_CPU_BUDGET = availableParallelism();
const TEST_TASK_CONCURRENCY = Math.min(3, TEST_CPU_BUDGET);
const TEST_MAX_WORKERS = Math.max(1, Math.floor(TEST_CPU_BUDGET / TEST_TASK_CONCURRENCY));

function testTask(task: string) {
  return {
    command: `vp run ${task} --maxWorkers ${TEST_MAX_WORKERS}`,
    dependsOn: ["build:packages"],
  };
}

const testTasks = {
  "check:test:runtime:integration": testTask("tests-runtime#test:integration"),
  "check:test:runtime:e2e": testTask("tests-runtime#test:pty"),
  "check:test:vite:system": testTask("tests-vite#test"),
  "check:test:runtime:examples": testTask("tests-runtime#test:examples"),
  "check:test:runtime:unit": testTask("@vue-tui/runtime#test"),
  "check:test:vite:unit": testTask("@vue-tui/vite#test"),
  "check:test:testing:unit": testTask("@vue-tui/testing#test"),
  "check:test:components:unit": testTask("@vue-tui/components#test"),
  "check:test:use:unit": testTask("@vue-tui/use#test"),
};

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    // PCR owns its marked block byte-for-byte. Formatting AGENTS.md would rewrite the markers
    // and make future methodology updates unsafe.
    ignorePatterns: ["AGENTS.md"],
  },
  lint: {
    // Don't lint test inputs or runtime scratch projects. Some fixtures are
    // deliberately broken, while Vite e2e creates and removes tmp projects as
    // lint runs concurrently. Neither is repository source, and scanning them
    // introduces races with no useful coverage.
    ignorePatterns: ["**/tests/fixtures/**", "tests/**/fixtures/**", "tests/**/tmp/**"],
    options: { typeAware: true, typeCheck: false },
    rules: {
      // This is a terminal UI library: parsing keyboard escape sequences and
      // stripping ANSI requires regexes that match control characters (ESC,
      // BEL, etc.) by design. no-control-regex flags every such pattern as a
      // false positive across the codebase, so disable it library-wide. We
      // already write them as \x1b /  unicode escapes (the rule's own
      // suggested form), not raw bytes.
      "no-control-regex": "off",
    },
  },
  run: {
    // vite-plus@0.2.6 can leave a cached multi-branch run idle after a Vitest
    // failure even though every child has exited. Keep failure reporting
    // bounded; revisit caching when the runner guarantees graph teardown.
    cache: false,
    // `check` is the repository's parallel verification graph. Build, format,
    // lint, typecheck, and tests retain explicit dependency boundaries; Vite+
    // supplies the scheduler.
    tasks: {
      // Build release candidates before applications. The cloneable template
      // deliberately uses ordinary semver ranges, and Vite Task's workspace
      // ordering does not infer a local edge from those ranges. Phasing the
      // graph prevents a package build from cleaning `dist` while an example
      // or template resolves its declarations.
      "build:runtime": { command: "vp run @vue-tui/runtime#build" },
      "build:packages": {
        command:
          "vp run --filter @vue-tui/components --filter @vue-tui/testing --filter @vue-tui/use --filter @vue-tui/vite build",
        dependsOn: ["build:runtime"],
      },
      "build:applications": {
        command: "vp run --filter './examples/**' --filter './templates/**' build",
        dependsOn: ["build:packages"],
      },
      build: { command: "echo build ok", dependsOn: ["build:applications"] },
      bench: {
        command: "vp run benchmarks-runtime#bench",
        dependsOn: ["build:packages"],
      },
      // These public entry tasks inject the repository-wide task budget before
      // entering the graph, so callers never need to remember option placement.
      check: { command: `vp run --concurrency-limit ${TEST_TASK_CONCURRENCY} check:all` },
      test: { command: `vp run --concurrency-limit ${TEST_TASK_CONCURRENCY} check:test` },
      "check:format": { command: "vp fmt --check" },
      // Type-aware checks resolve workspace packages through their published
      // `dist` entries. Build those libraries once, without rebuilding every
      // example and the cloneable template in each verification branch.
      "check:lint": { command: "vp lint --deny-warnings", dependsOn: ["build:packages"] },
      "check:types": {
        command: `vp run --concurrency-limit ${TEST_TASK_CONCURRENCY} -r check:type`,
        dependsOn: ["build:packages"],
      },
      ...testTasks,
      "check:test": {
        command: "echo tests ok",
        dependsOn: Object.keys(testTasks),
      },
      "check:all": {
        command: "echo check ok",
        dependsOn: ["check:format", "check:lint", "check:types", "check:test"],
      },
    },
  },
});
