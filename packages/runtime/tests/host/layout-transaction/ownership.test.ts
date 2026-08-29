import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const sourceRoot = fileURLToPath(new URL("../../../src/", import.meta.url));

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

test("renderers delegate layout and geometry selection to the layout transaction", () => {
  for (const file of ["render.ts", "render-to-string.ts"]) {
    const source = readFileSync(`${sourceRoot}/${file}`, "utf8");
    expect(source, file).toContain("runLayoutTransaction(");
    expect(source, file).not.toContain(".calculateLayout(");
    expect(source, file).not.toMatch(/\.yoga\.set[A-Z]/);
  }
});

test("raw layout-engine calls stay inside the layout transaction", () => {
  for (const file of productionTypeScriptFiles(sourceRoot)) {
    if (file.endsWith("/host/layout-transaction.ts")) continue;
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toContain(".calculateLayout(");
  }
});

test("paint reads final geometry without starting a layout transaction", () => {
  const paintRoot = `${sourceRoot}/paint`;
  for (const file of productionTypeScriptFiles(paintRoot)) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toContain(".calculateLayout(");
    expect(source, file).not.toContain("runLayoutTransaction(");
  }
});
