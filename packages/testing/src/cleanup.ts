/// <reference types="vite-plus/test/globals" />

const activeHosts = new Set<() => void>();

export function trackHost(dispose: () => void): () => void {
  activeHosts.add(dispose);
  return () => {
    activeHosts.delete(dispose);
  };
}

export function cleanup(): void {
  const disposers = Array.from(activeHosts);
  activeHosts.clear();
  const errors: unknown[] = [];

  for (const dispose of disposers) {
    try {
      dispose();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Failed to clean up test hosts.");
}

if (typeof afterEach === "function") {
  afterEach(() => cleanup());
}
