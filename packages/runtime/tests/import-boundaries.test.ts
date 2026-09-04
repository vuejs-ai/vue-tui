import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import ts from "typescript";

const runtimeSourceRoot = resolve(fileURLToPath(new URL("../src", import.meta.url)));

/**
 * One entry per row of the two **May import** tables in
 * `.agents/docs/architecture.md` ("Units and what they may import"), in the
 * record's order, so the two can be read side by side.
 *
 * - `directories` mirrors the row's directory entries, written without their
 *   trailing slash.
 * - `packages` mirrors the bare npm packages the row names; in the record's
 *   `May import` column `vue` without a slash always means the npm package.
 *
 * Beyond the directories themselves, these tables govern only `vue` and the
 * Boundaries rules only Node's builtins and the layout engine; a unit's other
 * npm dependencies — `cli-boxes` in `paint/`, `ansi-escapes` in `surface/`, the
 * text packages in `text/` — are not their subject, so no check below reads
 * them.
 *
 * A row is an upper bound, never a requirement: `layout/` may import `frame/`
 * and does not today, so the checks below reject what a row omits rather than
 * asserting a row's exact set.
 */
interface UnitRow {
  readonly directories: readonly string[];
  readonly packages: readonly string[];
}

/** The render and input stages, in the record's pipeline order. */
const stageUnits = ["host", "layout", "paint", "surface", "input", "terminal"] as const;
/** Shared data and utilities, on no stage of their own. */
const sharedUnits = ["frame", "text"] as const;
/** Above both paths. */
const upperUnits = ["api", "dev", "session", "vue"] as const;
/** What the `api/` row's "everything" and the `session/` row's "everything below" cover. */
const everyUnit = [...stageUnits, ...sharedUnits, ...upperUnits];
const everyUnitBelowSession = [...stageUnits, ...sharedUnits];

const mayImport: Readonly<Record<string, UnitRow>> = {
  // The render and input stages, in pipeline order.
  host: { directories: [], packages: [] },
  layout: { directories: ["host", "text", "frame"], packages: [] },
  paint: { directories: ["host", "layout", "text", "frame"], packages: [] },
  surface: { directories: ["terminal", "frame"], packages: [] },
  input: { directories: ["terminal"], packages: [] },
  terminal: { directories: [], packages: [] },
  // Shared data and utilities.
  frame: { directories: [], packages: [] },
  text: { directories: ["frame"], packages: [] },
  // Above both paths. The `api/` row reads "everything, plus `vue`, and
  // `node:stream` as types only", where "everything" is every unit the tables
  // list.
  api: { directories: everyUnit, packages: ["vue"] },
  dev: { directories: ["session", "vue"], packages: ["vue"] },
  session: { directories: [...everyUnitBelowSession, "vue"], packages: ["vue"] },
  vue: { directories: ["host", "layout", "frame", "input", "session"], packages: ["vue"] },
};

/**
 * The first two import rules of the record's **Boundaries** table.
 *
 * "Only `terminal/node/` imports `node:*` and `process` for values", with the
 * record's exemption: `MountOptions` and `UseStdinReturn` are accepted public
 * contracts that name Node stream types, so `api/` and `vue/` may spell
 * `node:stream` as types.
 *
 * "Only `layout/` imports the layout engine."
 */
const nodeValueImportRoot = join(runtimeSourceRoot, "terminal", "node");
const typeOnlyNodeImports: Readonly<Record<string, readonly string[]>> = {
  "node:stream": ["api", "vue"],
};
const layoutEnginePackage = "yoga-layout";

/**
 * The directory pairs a row admits as types only, keyed by the importing unit.
 * The `vue/` row reads "… `session/` and `node:stream` as types only", and
 * the record says why: the composables reach what the session provides through
 * injection keys rather than by importing it, so `vue/` needs `session/` for
 * types alone, and both directions as values would be a cycle.
 */
const typeOnlyUnitImports: Readonly<Record<string, readonly string[]>> = {
  vue: ["session"],
};

function isTypeOnlyUnitImport(unit: string | null, target: string | null): boolean {
  if (unit === null || target === null) return false;
  return (typeOnlyUnitImports[unit] ?? []).includes(target);
}

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

// `sourceFiles`, `moduleSpecifiers` and `isInside` are restated from
// `tests/runtime/integration/package-boundaries.test.ts`: they are
// module-private in the private `tests/runtime` workspace, which this
// package-local test does not reach into.

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

/**
 * The unit a path belongs to, or `null` when it belongs to none: a file
 * directly beneath `src/` such as `env.d.ts`, a path that escapes `src/`, or a
 * directory the record's tables do not list. A path with no row may import
 * nothing and nothing may import it, so a new unit is added to the record
 * before it is added to the code.
 */
function unitOf(path: string): string | null {
  if (!isInside(runtimeSourceRoot, path)) return null;
  const head = relative(runtimeSourceRoot, path).split(sep)[0];
  return head !== undefined && head in mayImport ? head : null;
}

function rowOf(unit: string | null): UnitRow {
  return (unit === null ? undefined : mayImport[unit]) ?? { directories: [], packages: [] };
}

const scriptBlock = /<script\b[^>]*>([\s\S]*?)<\/script>/g;

/**
 * The source the parser reads. `moduleSpecifiers` scans an SFC directly, but
 * the parser needs an SFC's script blocks on their own.
 */
function scriptSource(file: string, source: string): string {
  if (extname(file) !== ".vue") return source;
  return [...source.matchAll(scriptBlock)].map((match) => match[1]).join("\n");
}

function isTypeOnlyImport(clause: ts.ImportClause | undefined): boolean {
  // `import "x"` has no clause and still runs the module.
  if (clause === undefined) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name !== undefined) return false;
  const bindings = clause.namedBindings;
  return (
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function isTypeOnlyExport(declaration: ts.ExportDeclaration): boolean {
  if (declaration.isTypeOnly) return true;
  const clause = declaration.exportClause;
  return (
    clause !== undefined &&
    ts.isNamedExports(clause) &&
    clause.elements.length > 0 &&
    clause.elements.every((element) => element.isTypeOnly)
  );
}

/**
 * The specifiers a file imports as values. `ts.preProcessFile` reports a
 * specifier without saying whether the import was type-only, and the record
 * exempts `node:stream` types, so the Node rule reads the AST instead. A
 * specifier counts as a value as soon as one of its occurrences is not
 * type-only.
 */
function valueSpecifiers(file: string, source: string): Set<string> {
  const extension = extname(file);
  const parsed = ts.createSourceFile(
    file,
    scriptSource(file, source),
    ts.ScriptTarget.Latest,
    true,
    extension === ".tsx" || extension === ".jsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const values = new Set<string>();
  const add = (node: ts.Node | undefined): void => {
    if (node !== undefined && ts.isStringLiteralLike(node)) values.add(node.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (!isTypeOnlyImport(node.importClause)) add(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      if (!isTypeOnlyExport(node)) add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require")
      ) {
        add(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return values;
}

function label(file: string, specifier: string): string {
  return `${relative(runtimeSourceRoot, file)}: ${JSON.stringify(specifier)}`;
}

test("every relative import beneath src/ appears in the May-import tables", () => {
  for (const file of sourceFiles(runtimeSourceRoot)) {
    const unit = unitOf(file);
    const source = readFileSync(file, "utf8");
    const values = valueSpecifiers(file, source);
    for (const specifier of moduleSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const target = unitOf(resolve(dirname(file), specifier));
      // A row governs what one unit may import from another; a unit's own
      // files are its internals.
      if (target !== null && target === unit) continue;
      expect(
        rowOf(unit).directories,
        `${label(file, specifier)} is not an import the May-import table's ${unit ?? "(no)"} row allows`,
      ).toContain(target);
      if (isTypeOnlyUnitImport(unit, target)) {
        expect(
          values.has(specifier),
          `${label(file, specifier)} imports ${target ?? "(no)"}/ as a value; the May-import table's ${unit ?? "(no)"} row admits it as types only`,
        ).toBe(false);
      }
    }
  }
});

test("every bare import beneath src/ obeys the Boundaries table", () => {
  for (const file of sourceFiles(runtimeSourceRoot)) {
    const unit = unitOf(file);
    const source = readFileSync(file, "utf8");
    const values = valueSpecifiers(file, source);
    for (const specifier of moduleSpecifiers(source)) {
      if (specifier.startsWith(".")) continue;

      if (specifier === "process" || specifier.startsWith("node:")) {
        const exemptedUnits = values.has(specifier) ? [] : (typeOnlyNodeImports[specifier] ?? []);
        expect(
          isInside(nodeValueImportRoot, file) || exemptedUnits.includes(unit ?? ""),
          `${label(file, specifier)} imports Node outside terminal/node/ without a type-only exemption`,
        ).toBe(true);
      }

      if (specifier === layoutEnginePackage || specifier.startsWith(`${layoutEnginePackage}/`)) {
        expect(unit, `${label(file, specifier)} imports the layout engine outside layout/`).toBe(
          "layout",
        );
      }

      if (specifier === "vue" || specifier.startsWith("vue/")) {
        expect(
          rowOf(unit).packages,
          `${label(file, specifier)} imports the vue package, which the May-import table's ${unit ?? "(no)"} row does not name`,
        ).toContain("vue");
      }
    }
  }
});
