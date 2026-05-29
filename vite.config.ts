import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
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
    cache: false,
    // `ci` is the parallel verification graph used by .github/workflows/ci.yml.
    // The task runner fans out independent branches concurrently; the wall-clock
    // critical path is build -> test:pty. fmt and lint have no build dependency,
    // so they run immediately alongside build. check:type and the test suites
    // need the built dist (@vue-tui/runtime exposes no "types" export — its
    // consumers resolve types and runtime from dist/*.d.mts), so they depend on
    // build. The serial `ready` script in package.json stays for simple local use.
    tasks: {
      "ci:build": { command: "vp run build" },
      "ci:fmt": { command: "vp run check:fmt" },
      // lint depends on build: type-aware rules (e.g. no-implied-eval) on the
      // PTY fixtures need @vue-tui/runtime's built types resolved, or they
      // misfire on a fresh checkout. build is already on the critical path, so
      // this doesn't change overall wall-clock.
      "ci:lint": { command: "vp run check:lint", dependsOn: ["ci:build"] },
      "ci:type": { command: "vp run check:type", dependsOn: ["ci:build"] },
      // Test branches, one per suite via package#script. Normal packages keep a
      // plain `test`; only runtime-tests splits into test:integration +
      // test:pty. Targeting each suite directly keeps runtime-tests' slow PTY
      // suite on its own parallel branch (not serial inside its `test`), and
      // covers the runtime/testing unit tests that a runtime-tests-only run
      // would miss.
      "ci:test:runtime": {
        command: "vp run @vue-tui/runtime#test",
        dependsOn: ["ci:build"],
      },
      "ci:test:testing": {
        command: "vp run @vue-tui/testing#test",
        dependsOn: ["ci:build"],
      },
      "ci:test:integration": {
        command: "vp run @vue-tui/runtime-tests#test:integration",
        dependsOn: ["ci:build"],
      },
      "ci:test:pty": {
        command: "vp run @vue-tui/runtime-tests#test:pty",
        dependsOn: ["ci:build"],
      },
      ci: {
        command: "echo ci ok",
        dependsOn: [
          "ci:fmt",
          "ci:lint",
          "ci:type",
          "ci:test:runtime",
          "ci:test:testing",
          "ci:test:integration",
          "ci:test:pty",
        ],
      },
    },
  },
});
