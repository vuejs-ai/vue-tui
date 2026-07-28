import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { launchViteChild, type ViteChild } from "./harness/child.ts";

const examplesRoot = fileURLToPath(new URL("../../../examples/", import.meta.url));
const lettersOnly = (value: string): string => value.replace(/[^A-Za-z]/g, "");

async function withExample(
  name: string,
  run: (child: ViteChild) => Promise<void>,
  env?: Readonly<Record<string, string>>,
): Promise<void> {
  let child: ViteChild | undefined;
  try {
    child = await launchViteChild(`${examplesRoot}${name}`, { ci: false, env });
    await run(child);
  } finally {
    await child?.dispose();
  }
}

for (const example of [
  { name: "basic-template", token: "vue-tui basic" },
  { name: "basic-jsx", token: "vue-tui basic" },
  { name: "scroll-box", token: "ScrollBox demo" },
] as const) {
  test(`${example.name} launches through the real Vite system`, async () => {
    await withExample(example.name, async (child) => {
      const expected = lettersOnly(example.token);
      await child.expectFrame((frame) => lettersOnly(frame).includes(expected));
      expect(child.output()).not.toMatch(/doesn't expose the `require`|Calling `require` for/);
    });
  });
}

test("coding-agent launches its idle prompt through the real Vite system", async () => {
  await withExample(
    "coding-agent",
    async (child) => {
      await child.expectFrame((frame) => />\s*█/.test(frame));
    },
    { DEEPSEEK_API_KEY: "test-key-not-used" },
  );
});
