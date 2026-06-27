import { test, expect, vi } from "vite-plus/test";
import { bridgeHmrEventsToRunner } from "./bridge-hmr.ts";

test("custom ws payloads are forwarded onto the ssr hot channel", () => {
  const ssrSend = vi.fn();
  const original = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server);
  // plugin-vue calls ws.send("file-changed", { file }) — the string form
  (server.ws.send as unknown as (e: string, d: unknown) => void)("file-changed", { file: "x.vue" });
  expect(ssrSend).toHaveBeenCalledWith({
    type: "custom",
    event: "file-changed",
    data: { file: "x.vue" },
  });
  expect(original).toHaveBeenCalledWith("file-changed", { file: "x.vue" });
});

test("object-form custom payloads are forwarded onto the ssr hot channel", () => {
  const ssrSend = vi.fn();
  const original = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server);
  const payload = { type: "custom", event: "hmr:update", data: {} } as const;
  server.ws.send(payload);
  expect(ssrSend).toHaveBeenCalledWith({ type: "custom", event: "hmr:update", data: {} });
  expect(original).toHaveBeenCalledWith(payload);
});

test("error payloads are forwarded as-is onto the ssr hot channel", () => {
  const ssrSend = vi.fn();
  const original = vi.fn();
  const server = {
    environments: { ssr: { hot: { send: ssrSend } } },
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  bridgeHmrEventsToRunner(server);
  // Vite emits compile/build errors as a typed { type: "error", err } payload. The
  // module runner dispatches `vite:error` from this exact shape, so it must be
  // forwarded as-is (not re-wrapped) for the dev overlay to render the error.
  // err.stack is required by Vite's ErrorPayload type, so include it.
  const payload = {
    type: "error",
    err: { message: "boom", stack: "boom\n    at x" },
  } satisfies import("vite").HotPayload;
  server.ws.send(payload);
  expect(ssrSend).toHaveBeenCalledWith(payload);
  expect(original).toHaveBeenCalledWith(payload);
});

test("does not throw when the ssr environment is absent", () => {
  const original = vi.fn();
  const server = {
    environments: {},
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  expect(() => bridgeHmrEventsToRunner(server)).not.toThrow();
});
