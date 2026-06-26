// Provide a minimal ImportMeta.hot typing for HMR bridge usage.
// vite/client is not in this package's tsconfig types, so we augment here.
interface ImportMeta {
  readonly hot?: {
    on(event: string, cb: (payload: unknown) => void): void;
    send(event: string, data?: unknown): void;
  };
}
