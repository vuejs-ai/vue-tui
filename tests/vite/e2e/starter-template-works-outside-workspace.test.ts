import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { childExitWithin } from "./harness/child.ts";
import { withViteChild } from "./harness/e2e.ts";
import { createExternalScratchProject } from "./harness/scratch.ts";
import { resolveViteBin } from "./harness/vite-cli.ts";

const templateRoot = fileURLToPath(new URL("../../../templates/vite/", import.meta.url));
const packagesRoot = fileURLToPath(new URL("../../../packages/", import.meta.url));
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dependencyRanges(packageSource: string): readonly (readonly [string, string])[] {
  const manifest: unknown = JSON.parse(packageSource);
  if (!isRecord(manifest)) {
    throw new TypeError("Template package.json must contain an object");
  }

  const ranges: (readonly [string, string])[] = [];
  for (const field of dependencyFields) {
    const dependencies = manifest[field];
    if (dependencies === undefined) continue;
    if (!isRecord(dependencies)) {
      throw new TypeError(`Template package.json ${field} must contain an object`);
    }
    for (const [name, range] of Object.entries(dependencies)) {
      if (typeof range !== "string") {
        throw new TypeError(`Template dependency ${name} must use a string range`);
      }
      ranges.push([`${field}.${name}`, range]);
    }
  }
  return ranges;
}

function readManifest(root: string): Record<string, unknown> {
  const manifest: unknown = JSON.parse(readFileSync(`${root}/package.json`, "utf8"));
  if (!isRecord(manifest)) {
    throw new TypeError(`${root}/package.json must contain an object`);
  }
  return manifest;
}

function dependencyRange(
  manifest: Record<string, unknown>,
  field: "dependencies" | "devDependencies" | "peerDependencies",
  name: string,
): string {
  const dependencies = manifest[field];
  if (!isRecord(dependencies) || typeof dependencies[name] !== "string") {
    throw new TypeError(`${field}.${name} must contain a string range`);
  }
  return dependencies[name];
}

function packageVersion(manifest: Record<string, unknown>): string {
  if (typeof manifest.version !== "string") {
    throw new TypeError("Package manifest must contain a string version");
  }
  return manifest.version;
}

function acceptsSimpleRange(range: string, version: string): boolean {
  const rangeMatch = /^(?<operator>[~^]?)(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/.exec(range);
  const versionMatch = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/.exec(version);
  if (!rangeMatch?.groups || !versionMatch?.groups) return false;

  const lower = [
    Number(rangeMatch.groups.major),
    Number(rangeMatch.groups.minor),
    Number(rangeMatch.groups.patch),
  ] as const;
  const candidate = [
    Number(versionMatch.groups.major),
    Number(versionMatch.groups.minor),
    Number(versionMatch.groups.patch),
  ] as const;
  let comparison = 0;
  for (const [index, part] of candidate.entries()) {
    if (part === lower[index]) continue;
    comparison = part > lower[index]! ? 1 : -1;
    break;
  }
  if (comparison < 0) return false;

  if (rangeMatch.groups.operator === "") return comparison === 0;
  if (rangeMatch.groups.operator === "~") {
    return candidate[0] === lower[0] && candidate[1] === lower[1];
  }
  if (lower[0] > 0) return candidate[0] === lower[0];
  if (lower[1] > 0) return candidate[0] === 0 && candidate[1] === lower[1];
  return candidate[0] === 0 && candidate[1] === 0 && candidate[2] === lower[2];
}

test("the starter manifest matches the branch-local Vite contract", () => {
  const templateManifest = readManifest(templateRoot);
  const runtimeManifest = readManifest(`${packagesRoot}/runtime`);
  const componentsManifest = readManifest(`${packagesRoot}/components`);
  const viteManifest = readManifest(`${packagesRoot}/vite`);
  const viteConfig = readFileSync(`${templateRoot}/vite.config.ts`, "utf8");

  expect(viteConfig).toContain('from "unplugin-vue/vite"');
  expect(viteConfig).not.toContain('from "@vitejs/plugin-vue"');
  expect(viteConfig).toContain('input: "src/main.ts"');
  expect(viteConfig).toContain("vueTui()");
  expect(viteConfig).not.toContain("entry:");
  expect(viteConfig).not.toContain("ssr:");
  expect(viteConfig).not.toContain("build:");
  expect(viteConfig).not.toContain("resolve:");
  expect(existsSync(`${templateRoot}/tsdown.config.ts`)).toBe(false);

  const scripts = templateManifest.scripts;
  if (!isRecord(scripts)) {
    throw new TypeError("Template package.json scripts must contain an object");
  }
  expect(scripts.build).toBe("vite build");
  expect(scripts["build:exe"]).toBe("pnpm run build && tsdown dist/main.mjs --exe --out-dir build");
  expect(dependencyRange(templateManifest, "devDependencies", "tsdown")).toMatch(/^\^0\.22\./);

  for (const [field, name, localManifest] of [
    ["dependencies", "@vue-tui/runtime", runtimeManifest],
    ["dependencies", "@vue-tui/components", componentsManifest],
    ["devDependencies", "@vue-tui/vite", viteManifest],
  ] as const) {
    const range = dependencyRange(templateManifest, field, name);
    const version = packageVersion(localManifest);
    expect(range, `${field}.${name} must accept the branch-local ${version}`).toSatisfy(
      (candidate: string) => acceptsSimpleRange(candidate, version),
    );
  }

  // The development plugin intentionally supports only the exact Vite/compiler
  // versions exercised by this repository. A cloned starter must resolve those
  // exact versions too, rather than drifting to a newer patch that the plugin
  // will reject at startup.
  for (const name of ["vite", "unplugin-vue"] as const) {
    expect(dependencyRange(templateManifest, "devDependencies", name)).toBe(
      dependencyRange(viteManifest, "peerDependencies", name),
    );
  }
});

function spawnPnpm(root: string, ...args: string[]) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: plainChildEnvironment({ VP_NODE_VERSION: process.versions.node }),
    maxBuffer: 10 * 1024 * 1024,
    timeout: 180_000,
  });
}

function runPnpm(root: string, ...args: string[]): string {
  const result = spawnPnpm(root, ...args);
  if (result.error === undefined && result.status === 0) {
    return result.stdout;
  }
  throw new Error(
    [
      `pnpm ${args.join(" ")} failed in ${root}`,
      `status: ${result.status ?? "none"}; signal: ${result.signal ?? "none"}`,
      result.error === undefined ? undefined : `error: ${result.error.message}`,
      `stdout:\n${result.stdout}`,
      `stderr:\n${result.stderr}`,
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
  );
}

function plainChildEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NO_COLOR;
  delete environment.NODE_DISABLE_COLORS;
  delete environment.FORCE_COLOR;
  delete environment.NODE_NO_WARNINGS;
  return { ...environment, CI: "true", FORCE_COLOR: "0", ...extra };
}

function packLocalPackage(packageRoot: string, destination: string): string {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["pack", "--pack-destination", destination, "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: plainChildEnvironment(),
    maxBuffer: 10 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      [
        `pnpm pack failed in ${packageRoot}`,
        `status: ${result.status ?? "none"}; signal: ${result.signal ?? "none"}`,
        result.error === undefined ? undefined : `error: ${result.error.message}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ]
        .filter((line) => line !== undefined)
        .join("\n"),
    );
  }

  const packed: unknown = JSON.parse(result.stdout);
  if (!isRecord(packed) || typeof packed.filename !== "string") {
    throw new TypeError(`pnpm pack returned an invalid result for ${packageRoot}`);
  }
  return resolve(destination, packed.filename);
}

function useLocalPackages(scratch: ReturnType<typeof createExternalScratchProject>): void {
  const tarballDirectory = scratch.file(".local-packages");
  mkdirSync(tarballDirectory);
  const manifest: unknown = JSON.parse(scratch.read("package.json"));
  if (!isRecord(manifest)) throw new TypeError("Starter package.json must contain an object");

  for (const [field, name, directory] of [
    ["dependencies", "@vue-tui/runtime", "runtime"],
    ["dependencies", "@vue-tui/components", "components"],
    ["devDependencies", "@vue-tui/vite", "vite"],
  ] as const) {
    const dependencies = manifest[field];
    if (!isRecord(dependencies) || typeof dependencies[name] !== "string") {
      throw new TypeError(`Starter ${field}.${name} must contain a string range`);
    }
    const tarball = packLocalPackage(`${packagesRoot}/${directory}`, tarballDirectory);
    dependencies[name] = `file:.local-packages/${basename(tarball)}`;
  }

  scratch.write("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

test("the starter installs and works outside the workspace", { timeout: 300_000 }, async () => {
  const scratch = createExternalScratchProject(templateRoot, "vue-tui-starter");
  try {
    for (const [name, range] of dependencyRanges(scratch.read("package.json"))) {
      expect(range, `${name} must use an ordinary semver range`).toMatch(/^[~^]?\d/);
      expect(range, `${name} must not depend on repository state`).not.toMatch(
        /(?:catalog|file|link|workspace):/,
      );
    }
    expect(existsSync(scratch.file("node_modules"))).toBe(false);
    expect(existsSync(scratch.file("dist"))).toBe(false);
    expect(existsSync(scratch.file("package-lock.json"))).toBe(false);
    expect(existsSync(scratch.file("npm-shrinkwrap.json"))).toBe(false);
    expect(existsSync(scratch.file("pnpm-lock.yaml"))).toBe(false);

    // Keep the committed template independent from the workspace, then replace
    // only the copied manifest with packed branch-local packages. The contract
    // test above first proves that those local versions satisfy the committed
    // ordinary semver ranges, so this replacement cannot hide manifest drift.
    useLocalPackages(scratch);
    runPnpm(scratch.root, "install");
    runPnpm(scratch.root, "run", "type-check");
    runPnpm(scratch.root, "run", "build");
    expect(existsSync(scratch.file("dist/main.mjs"))).toBe(true);
    expect(readdirSync(scratch.file("dist")).sort()).toEqual(["main.mjs"]);

    const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split(".").map(Number);
    if (nodeMajor >= 26) {
      runPnpm(scratch.root, "run", "build:exe");
      const executable = scratch.file(`build/main${process.platform === "win32" ? ".exe" : ""}`);
      expect(existsSync(executable)).toBe(true);
      const result = spawnSync(executable, [], {
        cwd: scratch.root,
        encoding: "utf8",
        env: plainChildEnvironment(),
        input: "q",
        timeout: 20_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Starting up");
    } else if (nodeMajor < 25 || (nodeMajor === 25 && nodeMinor < 7)) {
      const result = spawnPnpm(scratch.root, "run", "build:exe");
      expect(result.status).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("does not support `exe` option");
      expect(output).toMatch(/Please upgrade to Node\.js .* or later\./);
    }

    const installedViteBin = resolveViteBin(scratch.file("package.json"));
    expect(relative(realpathSync(scratch.root), realpathSync(installedViteBin)).split(sep)[0]).toBe(
      "node_modules",
    );

    await withViteChild(
      scratch,
      async (child) => {
        await child.expectOutput("Hello from vue-tui", { timeoutMs: 20_000 });
        await child.expectFrame((frame) => frame.includes("Hello from vue-tui"), {
          timeoutMs: 20_000,
        });

        child.write("\x1b[A");
        await child.expectFrame((frame) => frame.includes("Count: 1"), { timeoutMs: 20_000 });
        child.write("\x1b[A");
        await child.expectFrame((frame) => frame.includes("Count: 2"), { timeoutMs: 20_000 });

        const updateAfter = child.events.length;
        scratch.edit("src/app.vue", (source) =>
          source.replace("Hello from vue-tui", "Hello after template HMR"),
        );
        await child.expectEvent("hmr:update-received", { after: updateAfter, timeoutMs: 20_000 });
        await child.expectEvent("hmr:update-applied", { after: updateAfter, timeoutMs: 20_000 });
        await child.expectFrame(
          (frame) => frame.includes("Hello after template HMR") && frame.includes("Count: 2"),
          { timeoutMs: 20_000 },
        );

        child.allowUncleanExit("the starter deliberately exits its dev-server process");
        child.write("q");
        await expect(childExitWithin(child, 10_000)).resolves.toMatchObject({ exitCode: 0 });
      },
      {
        // This is the interactive user journey. The currently released
        // Runtime intentionally disables live terminal rendering when CI is
        // present, so omit it just as an ordinary cloned app does.
        ci: false,
        viteBin: installedViteBin,
      },
    );
  } finally {
    scratch.cleanup();
  }
});
