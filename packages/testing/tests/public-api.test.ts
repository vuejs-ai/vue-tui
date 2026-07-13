import { expect, test } from "vite-plus/test";
import * as api from "../src/index.ts";

const PUBLIC_VALUE_EXPORTS = ["cleanup", "render"];

test("testing root keeps its exact value surface while adding type-only mouse contracts", () => {
  expect(Object.keys(api).sort()).toEqual(PUBLIC_VALUE_EXPORTS);
  expect(api).not.toHaveProperty("createTestMouse");
});
