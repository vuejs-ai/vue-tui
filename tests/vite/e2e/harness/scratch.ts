import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesRoot = fileURLToPath(new URL("../fixtures/", import.meta.url));
export const scratchParent = resolve(fileURLToPath(new URL("../tmp/", import.meta.url)));

export const harnessFixtureNames = [
  "basic",
  "color",
  "exit",
  "fullscreen",
  "input-hmr",
  "jsx",
  "overlay",
  "reload",
] as const;

export type HarnessFixtureName = (typeof harnessFixtureNames)[number];

export interface ScratchFixture {
  readonly root: string;
  readonly cacheDir: string;
  file(relativePath: string): string;
  read(relativePath: string): string;
  write(relativePath: string, contents: string): void;
  edit(relativePath: string, transform: (contents: string) => string): void;
  cleanup(): void;
}

function resolveInside(root: string, relativePath: string): string {
  if (relativePath.length === 0 || isAbsolute(relativePath)) {
    throw new Error(`Path ${JSON.stringify(relativePath)} must stay inside the scratch fixture`);
  }
  const target = resolve(root, relativePath);
  const fromRoot = relative(root, target);
  if (fromRoot.length === 0 || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Path ${JSON.stringify(relativePath)} must stay inside the scratch fixture`);
  }

  let existingAncestor = target;
  while (true) {
    try {
      lstatSync(existingAncestor);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    existingAncestor = dirname(existingAncestor);
  }
  const physicalRoot = realpathSync(root);
  let physicalAncestor: string;
  try {
    physicalAncestor = realpathSync(existingAncestor);
  } catch (error) {
    if (lstatSync(existingAncestor).isSymbolicLink()) {
      throw new Error(
        `Path ${JSON.stringify(relativePath)} resolves through a dangling symbolic link`,
      );
    }
    throw error;
  }
  const physicalRelative = relative(physicalRoot, physicalAncestor);
  if (physicalRelative === ".." || physicalRelative.startsWith(`..${sep}`)) {
    throw new Error(
      `Path ${JSON.stringify(relativePath)} resolves outside the scratch fixture through a symbolic link`,
    );
  }
  return target;
}

function assertScratchName(name: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid scratch project name: ${JSON.stringify(name)}`);
  }
}

function removeScratchRoot(root: string, parent: string, name: string): void {
  if (dirname(root) !== parent || !basename(root).startsWith(`${name}-`)) {
    throw new Error(`Refusing to remove invalid scratch root ${JSON.stringify(root)}`);
  }
  rmSync(root, { recursive: true, force: true });
}

function writeScratchPackage(root: string): void {
  const packagePath = join(root, "package.json");
  if (existsSync(packagePath)) {
    return;
  }

  writeFileSync(packagePath, `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`);
}

function scratchProject(root: string, parent: string, name: string): ScratchFixture {
  let cleaned = false;
  const file = (relativePath: string): string => resolveInside(root, relativePath);

  return {
    root,
    cacheDir: join(root, "node_modules/.vite"),
    file,
    read(relativePath) {
      return readFileSync(file(relativePath), "utf8");
    },
    write(relativePath, contents) {
      const target = file(relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    },
    edit(relativePath, transform) {
      const target = file(relativePath);
      const original = readFileSync(target, "utf8");
      const updated = transform(original);
      if (typeof updated !== "string") {
        throw new TypeError("Scratch fixture edit transform must return a string");
      }
      if (updated === original) {
        throw new Error(`Scratch fixture edit did not change ${JSON.stringify(relativePath)}`);
      }
      writeFileSync(target, updated);
    },
    cleanup() {
      if (cleaned) {
        return;
      }
      removeScratchRoot(root, parent, name);
      cleaned = true;
    },
  };
}

export function createScratchFixture(fixtureName: HarnessFixtureName): ScratchFixture {
  if (!(harnessFixtureNames as readonly string[]).includes(fixtureName)) {
    throw new Error(`Unknown harness fixture: ${JSON.stringify(fixtureName)}`);
  }

  const sourceRoot = join(fixturesRoot, fixtureName);
  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    throw new Error(`Fixture does not exist: ${fixtureName}`);
  }

  mkdirSync(scratchParent, { recursive: true });
  const root = mkdtempSync(join(scratchParent, `${fixtureName}-`));
  try {
    cpSync(sourceRoot, root, { recursive: true });
    writeScratchPackage(root);
  } catch (error) {
    removeScratchRoot(root, scratchParent, fixtureName);
    throw error;
  }

  return scratchProject(root, scratchParent, fixtureName);
}

/**
 * Copy a user-facing project into the host's temporary directory.
 *
 * This deliberately does not reuse the workspace-owned scratch parent: callers
 * use it to prove that a template can install without the monorepo's lockfile,
 * package links, or generated output.
 */
export function createExternalScratchProject(
  sourceRoot: string,
  projectName: string,
): ScratchFixture {
  assertScratchName(projectName);
  if (sourceRoot.length === 0) {
    throw new TypeError("External scratch source must be a non-empty path");
  }
  const resolvedSource = resolve(sourceRoot);
  if (!statSync(resolvedSource).isDirectory()) {
    throw new Error(`External scratch source is not a directory: ${resolvedSource}`);
  }

  const parent = resolve(tmpdir());
  const root = mkdtempSync(join(parent, `${projectName}-`));
  try {
    cpSync(resolvedSource, root, {
      recursive: true,
      filter(source) {
        const firstSegment = relative(resolvedSource, source).split(sep)[0];
        return firstSegment !== "dist" && firstSegment !== "node_modules";
      },
    });
    if (!existsSync(join(root, "package.json"))) {
      throw new Error(`External scratch source has no package.json: ${resolvedSource}`);
    }
  } catch (error) {
    removeScratchRoot(root, parent, projectName);
    throw error;
  }

  return scratchProject(root, parent, projectName);
}
