import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import { withViteChild } from "./harness/e2e.ts";

test.each([1, 3])(
  "entry evaluation errors report the authored location on line %s",
  async (line) => {
    const scratch = createScratchFixture("basic");
    scratch.write(
      "src/main.ts",
      `${"\n".repeat(line - 1)}throw new Error("ENTRY_SOURCE_LOCATION");\n${scratch.read("src/main.ts")}`,
    );

    await withViteChild(scratch, async (child) => {
      await child.expectEvent("hmr:error");
      await child.expectOutput("ENTRY_SOURCE_LOCATION");
      await child.expectOutput("src/main.ts:");
      expect(child.output()).toContain(`src/main.ts:${line}:7`);
    });
  },
);
