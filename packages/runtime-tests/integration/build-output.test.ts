import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  }
});
