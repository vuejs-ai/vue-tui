import { expect, test } from "vite-plus/test";

test("@vue-tui/use has exact root and components value surfaces", async () => {
  const root = await import("../src/index.ts");
  const components = await import("../src/components.ts");

  expect(Object.keys(root).sort()).toEqual(["useInputWhileMounted", "useTextInput"]);
  expect(Object.keys(components).sort()).toEqual(["UseInputWhileMounted"]);
});
