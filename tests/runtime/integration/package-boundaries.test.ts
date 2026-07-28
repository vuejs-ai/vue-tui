import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import ts from "typescript";

const repositoryRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const runtimeSourceRoot = join(repositoryRoot, "packages/runtime/src");
const applicationRoots = [
  join(repositoryRoot, "packages/components/src"),
  join(repositoryRoot, "packages/use/src"),
  join(repositoryRoot, "examples"),
  join(repositoryRoot, "templates/vite/src"),
];
const allowedRuntimeEntries = new Set(["@vue-tui/runtime", "@vue-tui/runtime/inline"]);
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".vue",
]);
const ignoredDirectories = new Set(["node_modules", "dist", "tmp", ".vite", "coverage"]);

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) || entry.name.startsWith(".")
        ? []
        : sourceFiles(path);
    }
    return entry.isFile() && sourceExtensions.has(extname(path)) ? [path] : [];
  });
}

function moduleSpecifiers(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map((entry) => entry.fileName);
}

function isInside(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

test("application-facing packages depend only on public Runtime entries", () => {
  for (const file of applicationRoots.flatMap(sourceFiles)) {
    for (const specifier of moduleSpecifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) {
        expect(
          isInside(runtimeSourceRoot, resolve(dirname(file), specifier)),
          `${file}: relative dependency ${JSON.stringify(specifier)} bypasses the Runtime package boundary`,
        ).toBe(false);
      }
      if (specifier === "@vue-tui/runtime" || specifier.startsWith("@vue-tui/runtime/")) {
        expect(allowedRuntimeEntries, `${file}: ${specifier}`).toContain(specifier);
      }
    }
  }
});

test("official testing uses the consumer's exact Runtime bridge", () => {
  const runtime = JSON.parse(
    readFileSync(join(repositoryRoot, "packages/runtime/package.json"), "utf8"),
  ) as { version: string };
  const testing = JSON.parse(
    readFileSync(join(repositoryRoot, "packages/testing/package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  expect(testing.dependencies?.["@vue-tui/runtime"]).toBeUndefined();
  expect(testing.devDependencies?.["@vue-tui/runtime"]).toBe("workspace:*");
  expect(testing.peerDependencies?.["@vue-tui/runtime"]).toBe("workspace:*");
  expect(runtime.version).toMatch(/^\d+\.\d+\.\d+$/);
});
