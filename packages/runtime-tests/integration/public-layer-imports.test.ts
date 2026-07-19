import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import ts from "typescript";

const repositoryRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const runtimeSourceRoot = join(repositoryRoot, "packages/runtime/src");
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
const allowedRuntimeEntries = new Set(["@vue-tui/runtime", "@vue-tui/runtime/inline"]);
const removedBoxProps = new Set([
  "alignContent",
  "alignSelf",
  "aspectRatio",
  "borderBackgroundColor",
  "borderBottom",
  "borderBottomBackgroundColor",
  "borderBottomColor",
  "borderBottomDimColor",
  "borderDimColor",
  "borderLeft",
  "borderLeftBackgroundColor",
  "borderLeftColor",
  "borderLeftDimColor",
  "borderRight",
  "borderRightBackgroundColor",
  "borderRightColor",
  "borderRightDimColor",
  "borderTop",
  "borderTopBackgroundColor",
  "borderTopColor",
  "borderTopDimColor",
  "bottom",
  "columnGap",
  "flexWrap",
  "margin",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginX",
  "marginY",
  "maxHeight",
  "maxWidth",
  "overflow",
  "overflowX",
  "padding",
  "paddingX",
  "paddingY",
  "right",
  "rowGap",
]);
const removedTextProps = new Set(["inverse", "italic", "strikethrough", "underline"]);

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
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

function resolvesIntoRuntimeSource(importer: string, specifier: string): boolean {
  return (
    specifier.startsWith(".") && isInside(runtimeSourceRoot, resolve(dirname(importer), specifier))
  );
}

type PrimitiveName = "Box" | "Text";

function camelizeAttribute(name: string): string {
  return name.replace(/^:/, "").replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function isRemovedProp(component: PrimitiveName, rawName: string): boolean {
  const name = camelizeAttribute(rawName);
  return (component === "Box" ? removedBoxProps : removedTextProps).has(name);
}

function staticPropertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}

function removedPrimitivePropUses(file: string, source: string): string[] {
  if (extname(file) === ".vue") {
    const uses: string[] = [];
    for (const tag of source.matchAll(/<(Box|Text)\b([^>]*)>/gs)) {
      const component = tag[1] as PrimitiveName;
      for (const attribute of tag[2]!.matchAll(/(?:^|\s)(:?[A-Za-z][\w-]*)\s*(?:=|(?=\s|$))/g)) {
        const rawName = attribute[1]!;
        if (isRemovedProp(component, rawName))
          uses.push(`${component}.${camelizeAttribute(rawName)}`);
      }
    }
    return uses;
  }

  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const importedPrimitives = new Map<string, PrimitiveName>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@vue-tui/runtime" ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const binding of statement.importClause.namedBindings.elements) {
      const imported = binding.propertyName?.text ?? binding.name.text;
      if (imported === "Box" || imported === "Text") {
        importedPrimitives.set(binding.name.text, imported);
      }
    }
  }

  const uses: string[] = [];
  const record = (component: PrimitiveName, name: string | undefined): void => {
    if (name !== undefined && isRemovedProp(component, name)) {
      uses.push(`${component}.${camelizeAttribute(name)}`);
    }
  };
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName)
    ) {
      const component = importedPrimitives.get(node.tagName.text);
      if (component) {
        for (const property of node.attributes.properties) {
          if (ts.isJsxAttribute(property) && ts.isIdentifier(property.name)) {
            record(component, property.name.text);
          }
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "h" &&
      node.arguments[0] &&
      ts.isIdentifier(node.arguments[0]) &&
      node.arguments[1] &&
      ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      const component = importedPrimitives.get(node.arguments[0].text);
      if (component) {
        for (const property of node.arguments[1].properties) {
          if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
            record(component, staticPropertyName(property.name));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uses;
}

test("application-facing first-party layers use only public Runtime entries", () => {
  const roots = [
    join(repositoryRoot, "packages/components/src"),
    join(repositoryRoot, "packages/use/src"),
    join(repositoryRoot, "examples"),
  ];

  for (const file of roots.flatMap(sourceFiles)) {
    const source = readFileSync(file, "utf8");
    for (const specifier of moduleSpecifiers(source)) {
      expect(
        resolvesIntoRuntimeSource(file, specifier),
        `${file}: relative dependency ${JSON.stringify(specifier)} resolves into Runtime source`,
      ).toBe(false);
      if (specifier === "@vue-tui/runtime" || specifier.startsWith("@vue-tui/runtime/")) {
        expect(allowedRuntimeEntries, `${file}: ${specifier}`).toContain(specifier);
      }
    }
  }
});

test("the dependency scan catches every static syntax and relative Runtime-source bypass", () => {
  const importer = join(repositoryRoot, "packages/components/src/nested/component.ts");
  const source = `
    import value from "../../../runtime/src/value.ts";
    export { other } from "../../../runtime/src/other.ts";
    const lazy = import("../../../runtime/src/lazy.ts");
    const commonJs = require("../../../runtime/src/common.cjs");
  `;
  const specifiers = moduleSpecifiers(source);

  expect(specifiers).toEqual([
    "../../../runtime/src/value.ts",
    "../../../runtime/src/other.ts",
    "../../../runtime/src/lazy.ts",
    "../../../runtime/src/common.cjs",
  ]);
  expect(specifiers.every((specifier) => resolvesIntoRuntimeSource(importer, specifier))).toBe(
    true,
  );
});

test("application and terminal fixtures do not silently retain removed Box or Text props", () => {
  const roots = [
    join(repositoryRoot, "packages/components/src"),
    join(repositoryRoot, "examples"),
    join(repositoryRoot, "packages/runtime-tests/integration/pty/fixtures"),
  ];
  const excluded = new Set([
    join(repositoryRoot, "packages/components/src/runtime-boundary/unsupported-box-attr.vue"),
    join(repositoryRoot, "packages/runtime-tests/integration/pty/fixtures/jsx-children-types.tsx"),
    join(
      repositoryRoot,
      "packages/runtime-tests/integration/pty/fixtures/template-children-types.vue",
    ),
  ]);
  const files = [
    ...roots.flatMap(sourceFiles),
    join(repositoryRoot, "packages/runtime-tests/capacity/workloads.tsx"),
  ].filter((file) => !excluded.has(file) && !file.includes(".test."));

  for (const file of files) {
    expect(removedPrimitivePropUses(file, readFileSync(file, "utf8")), file).toEqual([]);
  }
});
