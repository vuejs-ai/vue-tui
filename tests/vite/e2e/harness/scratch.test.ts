import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { resolveConfig } from "vite";
import {
  createExternalScratchProject,
  createScratchFixture,
  harnessFixtureNames,
  scratchParent,
  type HarnessFixtureName,
} from "./scratch.ts";

const trackedBasicApp = fileURLToPath(new URL("../fixtures/basic/src/app.vue", import.meta.url));
const starterTemplate = fileURLToPath(new URL("../../../../templates/vite/", import.meta.url));

test("creates isolated direct children of the harness temp directory", () => {
  const first = createScratchFixture("basic");
  const second = createScratchFixture("basic");
  try {
    expect(first.root).not.toBe(second.root);
    expect(dirname(first.root)).toBe(scratchParent);
    expect(dirname(second.root)).toBe(scratchParent);
    expect(basename(first.root)).toMatch(/^basic-/);
    expect(first.cacheDir).not.toBe(second.cacheDir);
    expect(readFileSync(first.file("src/app.vue"), "utf8")).toContain("LABEL-A");
    expect(readFileSync(first.file("package.json"), "utf8")).toContain('"private": true');
    first.cleanup();
    expect(existsSync(second.root)).toBe(true);
  } finally {
    first.cleanup();
    second.cleanup();
  }
  expect(existsSync(first.root)).toBe(false);
  expect(existsSync(second.root)).toBe(false);
});

test("edits only the copied fixture and supports idempotent cleanup", () => {
  const scratch = createScratchFixture("basic");
  const tracked = readFileSync(trackedBasicApp, "utf8");
  try {
    scratch.edit("src/app.vue", (source) => source.replace("LABEL-A", "SCRATCH-ONLY"));
    expect(scratch.read("src/app.vue")).toContain("SCRATCH-ONLY");
    expect(readFileSync(trackedBasicApp, "utf8")).toBe(tracked);
    scratch.write("src/generated/new.ts", "export const generated = true;\n");
    expect(scratch.read("src/generated/new.ts")).toContain("generated = true");
    expect(() => scratch.file("../outside")).toThrow(/inside the scratch fixture/i);
    expect(() => scratch.file("")).toThrow(/inside the scratch fixture/i);
    expect(() => scratch.file(resolve(scratch.root, "src/app.vue"))).toThrow(
      /inside the scratch fixture/i,
    );
    expect(() => scratch.edit("src/app.vue", (source) => source)).toThrow(/did not change/i);
  } finally {
    scratch.cleanup();
    scratch.cleanup();
  }
});

test.skipIf(process.platform === "win32")(
  "rejects edits through a symlink that leaves the scratch fixture",
  () => {
    const scratch = createScratchFixture("basic");
    const tracked = readFileSync(trackedBasicApp, "utf8");
    try {
      symlinkSync(trackedBasicApp, scratch.file("src/escape.vue"));
      expect(() => scratch.edit("src/escape.vue", () => "escaped\n")).toThrow(/symbolic link/i);
      expect(readFileSync(trackedBasicApp, "utf8")).toBe(tracked);
    } finally {
      scratch.cleanup();
    }
  },
);

test("every fixture consumes the plugin through its package entry", () => {
  for (const fixtureName of harnessFixtureNames) {
    const scratch = createScratchFixture(fixtureName);
    try {
      const config = scratch.read("vite.config.ts");
      const pluginImport = config.match(/import\s+\{\s*vueTui\s*\}\s+from\s+["']([^"']+)["']/)?.[1];
      expect(pluginImport, `${fixtureName} must import vueTui`).toBe("@vue-tui/vite");
    } finally {
      scratch.cleanup();
    }
  }
});

test("rejects fixture names outside the harness allowlist", () => {
  expect(() => createScratchFixture("cjs-config" as HarnessFixtureName)).toThrow(
    /unknown harness fixture/i,
  );
  expect(() => createScratchFixture("../basic" as HarnessFixtureName)).toThrow(
    /unknown harness fixture/i,
  );
});

test("keeps Vite's default cache inside each scratch fixture", async () => {
  const scratch = createScratchFixture("basic");
  try {
    const config = await resolveConfig(
      { root: scratch.root, logLevel: "silent" },
      "serve",
      "development",
    );
    expect(relative(scratch.root, config.cacheDir).split(sep)[0]).not.toBe("..");
    expect(config.cacheDir).toBe(join(scratch.root, "node_modules/.vite"));
  } finally {
    scratch.cleanup();
  }
});

test("copies a clean user project outside the workspace", () => {
  const scratch = createExternalScratchProject(starterTemplate, "vue-tui-starter");
  try {
    expect(dirname(scratch.root)).toBe(resolve(tmpdir()));
    expect(scratch.read("package.json")).toContain('"name": "my-vue-tui-app"');
    expect(existsSync(scratch.file("node_modules"))).toBe(false);
    expect(existsSync(scratch.file("dist"))).toBe(false);
  } finally {
    scratch.cleanup();
  }
  expect(existsSync(scratch.root)).toBe(false);
});
