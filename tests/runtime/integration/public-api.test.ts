import { expect, test } from "vite-plus/test";
import * as api from "@vue-tui/runtime";
import * as devtoolsApi from "@vue-tui/runtime/internal/devtools";
import * as inlineApi from "@vue-tui/runtime/inline";
import * as testingApi from "@vue-tui/runtime/internal/testing";

const PUBLIC_VALUE_EXPORTS = [
  "Box",
  "Text",
  "createApp",
  "renderToString",
  "useApp",
  "useBoxMetrics",
  "useFocus",
  "useInput",
  "useLayoutSize",
  "useStdin",
];

const DEVTOOLS_VALUE_EXPORTS = [
  "VueTuiDevSessionConflictError",
  "connectDevtools",
  "disconnectDevtools",
  "getDevtoolsSessionId",
  "invalidateDevHmrUpdate",
  "isDevConnected",
  "isVueTuiDevSessionConflictError",
];

const TESTING_VALUE_EXPORTS = [
  "RUNTIME_TEST_EVENT",
  "createTestHostBridge",
  "emitTestEvent",
  "setTestEventSink",
];

test("public entries keep their exact value surfaces", () => {
  expect(Object.keys(api).sort()).toEqual(PUBLIC_VALUE_EXPORTS);
  expect(Object.keys(inlineApi).sort()).toEqual(["Static"]);
  expect(Object.keys(devtoolsApi).sort()).toEqual(DEVTOOLS_VALUE_EXPORTS);
  expect(Object.keys(testingApi).sort()).toEqual(TESTING_VALUE_EXPORTS);
});
