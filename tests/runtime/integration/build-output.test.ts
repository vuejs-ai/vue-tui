import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vite-plus/test";
import { defineComponent } from "vue";

// Mirror of Ink's test/build-output.ts: walk each published package's
// package.json `exports` map and assert every string target actually exists in
// the built `dist/`. This is an INTEGRATION test run after `vp run build`
// (`vp run check` builds first); a missing target is a real packaging gap that
// would ship a broken `import`/`require`.

const here = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(here, "../../..", "packages");

type Exports = string | { [condition: string]: Exports };

/**
 * Collect every string leaf reachable from an `exports` value, descending
 * through nested condition objects (`import`/`require`/`types`/...) and named
 * subpaths (`.`, `./internal`, `./package.json`). Each leaf is the literal path
 * the resolver would hand back, so each must exist on disk.
 */
function collectTargets(value: Exports, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  for (const nested of Object.values(value)) {
    collectTargets(nested, out);
  }
  return out;
}

/** The package build emits each `.mjs` library entry beside its `.d.mts` declaration. */
function declarationSibling(mjsTarget: string): string {
  return mjsTarget.replace(/\.mjs$/, ".d.mts");
}

function readPackedManifest(packageDirectory: string): Record<string, unknown> {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vue-tui-packed-manifest-"));
  try {
    const packed = JSON.parse(
      execFileSync("pnpm", ["pack", "--pack-destination", temporaryDirectory, "--json"], {
        cwd: packageDirectory,
        encoding: "utf8",
      }),
    ) as { filename: string };
    const archivePath = path.isAbsolute(packed.filename)
      ? packed.filename
      : path.join(temporaryDirectory, packed.filename);
    return JSON.parse(
      execFileSync("tar", ["-xOf", archivePath, "package/package.json"], {
        encoding: "utf8",
      }),
    ) as Record<string, unknown>;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const packageDirectories = fs
  .readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((dir) => {
    const manifestPath = path.join(packagesDir, dir, "package.json");
    if (!fs.existsSync(manifestPath)) return false;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      private?: boolean;
      publishConfig?: unknown;
    };
    return manifest.private !== true && manifest.publishConfig !== undefined;
  })
  .sort();

describe("build output: package.json exports resolve to built files", () => {
  test("discovers every publishable package", () => {
    expect(packageDirectories).toEqual(["components", "runtime", "testing", "use", "vite"]);
  });

  for (const dir of packageDirectories) {
    const pkgDir = path.join(packagesDir, dir);
    const pkgJsonPath = path.join(pkgDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as {
      name: string;
      exports: Exports;
    };

    test(`${pkg.name}: every exports target exists`, () => {
      const targets = collectTargets(pkg.exports);
      // Sanity: the map must have at least the root entry.
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const abs = path.join(pkgDir, target);
        expect(fs.existsSync(abs), `${pkg.name} exports target missing: ${target}`).toBe(true);
      }
    });

    test(`${pkg.name}: each .mjs library export has a .d.mts declaration sibling`, () => {
      const mjsTargets = collectTargets(pkg.exports).filter(
        (target) => target.endsWith(".mjs") && target.startsWith("./dist/"),
      );
      expect(mjsTargets.length).toBeGreaterThan(0);
      for (const mjs of mjsTargets) {
        const dts = declarationSibling(mjs);
        const abs = path.join(pkgDir, dts);
        expect(fs.existsSync(abs), `${pkg.name} missing declaration sibling: ${dts}`).toBe(true);
      }
    });

    test(`${pkg.name}: the actual package contains its exports without workspace sources`, () => {
      const packed = JSON.parse(
        execFileSync("pnpm", ["pack", "--dry-run", "--json"], {
          cwd: pkgDir,
          encoding: "utf8",
        }),
      ) as { files: Array<{ path: string }> };
      const files = new Set(packed.files.map((file) => file.path));

      for (const target of collectTargets(pkg.exports)) {
        expect(files.has(target.replace(/^\.\//, "")), `${pkg.name} omits ${target}`).toBe(true);
      }
      for (const target of collectTargets(pkg.exports).filter((file) => file.endsWith(".mjs"))) {
        const declaration = declarationSibling(target).replace(/^\.\//, "");
        expect(files.has(declaration), `${pkg.name} omits ${declaration}`).toBe(true);
      }
      expect([...files].filter((file) => /^(?:src|test|tests)\//.test(file))).toEqual([]);
    });
  }

  test("runtime publishes exactly the accepted public and privileged entries", () => {
    const pkgDir = path.join(packagesDir, "runtime");
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
    };
    // The frozen package boundary: the public root and /inline, plus the narrow
    // privileged entries reserved for official packages. Exact-key assertions
    // belong here rather than in an application-facing public API test.
    expect(Object.keys(pkg.exports).sort()).toEqual([
      ".",
      "./inline",
      "./internal/devtools",
      "./internal/testing",
      "./package.json",
    ]);
  });

  test("runtime delegates renderer state and types to the consumer's single Vue peer", () => {
    const pkgDir = path.join(packagesDir, "runtime");
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const distDir = path.join(pkgDir, "dist");
    const runtimeOutput = fs
      .readdirSync(distDir)
      .filter((file) => file.endsWith(".mjs"))
      .map((file) => fs.readFileSync(path.join(distDir, file), "utf8"))
      .join("\n");
    const declarations = fs
      .readdirSync(distDir)
      .filter((file) => file.endsWith(".d.mts"))
      .map((file) => fs.readFileSync(path.join(distDir, file), "utf8"))
      .join("\n");

    expect(pkg.peerDependencies?.vue).toBeDefined();
    expect(pkg.dependencies?.["@vue/runtime-core"]).toBeUndefined();
    expect(runtimeOutput).toContain('from "vue"');
    expect(runtimeOutput).not.toContain('from "@vue/runtime-core"');
    expect(declarations).toContain('from "vue"');
    expect(declarations).not.toContain('from "@vue/runtime-core"');
    expect(declarations).not.toContain("DefineComponent<");
    // This Vue augmentation is present only when @vue/runtime-core declarations
    // were accidentally inlined into our own public declaration bundle.
    expect(declarations).not.toContain("runtimeCoreBailTypes");
  });

  test("the packed testing package uses and loads the matching Runtime bridge", async () => {
    const runtimeManifest = JSON.parse(
      fs.readFileSync(path.join(packagesDir, "runtime/package.json"), "utf8"),
    ) as { version: string };
    const testingDir = path.join(packagesDir, "testing");
    const testingManifest = readPackedManifest(testingDir) as {
      dependencies?: Record<string, string>;
      exports: { ".": string };
      peerDependencies?: Record<string, string>;
    };

    expect(testingManifest.dependencies?.["@vue-tui/runtime"]).toBeUndefined();
    expect(testingManifest.peerDependencies?.["@vue-tui/runtime"]).toBe(runtimeManifest.version);

    const testing = (await import(
      pathToFileURL(path.join(testingDir, testingManifest.exports["."])).href
    )) as { render: (component: object) => Promise<{ dispose: () => void }> };
    const result = await testing.render(defineComponent(() => () => null));
    result.dispose();
  });
});
