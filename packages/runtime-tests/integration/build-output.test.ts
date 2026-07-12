import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vite-plus/test";

// Mirror of Ink's test/build-output.ts: walk each published package's
// package.json `exports` map and assert every string target actually exists in
// the built `dist/`. This is an INTEGRATION test run after `vp run build`
// (`vp run ci` builds first); a missing target is a real packaging gap that
// would ship a broken `import`/`require`.

const here = path.dirname(fileURLToPath(import.meta.url));
// integration/ -> runtime-tests/ -> packages/
const packagesDir = path.resolve(here, "..", "..");

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

/**
 * For a TYPED library entry, the declaration sibling sits next to the runtime
 * `.mjs` with a `.d.mts` extension (tsdown/`vp pack` emits `index.mjs` +
 * `index.d.mts`). We assert it explicitly for runtime/testing — the vite plugin
 * has no public type surface (no `index.d.mts`), so it is excluded.
 */
function declarationSibling(mjsTarget: string): string {
  return mjsTarget.replace(/\.mjs$/, ".d.mts");
}

type PackageCase = {
  /** Directory name under packages/ */
  dir: string;
  /** Whether this package ships a public type surface (.d.mts siblings). */
  typed: boolean;
};

const cases: PackageCase[] = [
  { dir: "runtime", typed: true },
  { dir: "vite", typed: false },
  { dir: "testing", typed: true },
];

describe("build output: package.json exports resolve to built files", () => {
  for (const { dir, typed } of cases) {
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

    if (typed) {
      test(`${pkg.name}: each .mjs library export has a .d.mts declaration sibling`, () => {
        const mjsTargets = collectTargets(pkg.exports).filter(
          (t) => t.endsWith(".mjs") && t.startsWith("./dist/"),
        );
        // A typed library must expose at least one runtime entry.
        expect(mjsTargets.length).toBeGreaterThan(0);
        for (const mjs of mjsTargets) {
          const dts = declarationSibling(mjs);
          const abs = path.join(pkgDir, dts);
          expect(fs.existsSync(abs), `${pkg.name} missing declaration sibling: ${dts}`).toBe(true);
        }
      });
    }

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
      if (typed) {
        for (const target of collectTargets(pkg.exports).filter((file) => file.endsWith(".mjs"))) {
          const declaration = declarationSibling(target).replace(/^\.\//, "");
          expect(files.has(declaration), `${pkg.name} omits ${declaration}`).toBe(true);
        }
      }
      expect([...files].filter((file) => /^(?:src|test|tests)\//.test(file))).toEqual([]);
    });
  }

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
});
