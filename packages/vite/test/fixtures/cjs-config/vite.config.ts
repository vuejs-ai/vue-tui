// Fixture for the #238 regression test (test/cjs-config.test.ts).
//
// The sibling package.json declares `type: commonjs`, so Vite bundles+loads THIS config as
// CommonJS and resolves its imports under the `require` condition. Importing @vue-tui/vite BY
// NAME exercises the published package's exports map: if it isn't resolvable under `require`,
// config loading throws "This package is ESM only but it was tried to load by `require`".
import { vueTui } from "@vue-tui/vite";

export default {
  plugins: [vueTui()],
};
