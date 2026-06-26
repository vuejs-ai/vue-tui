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

test("does not throw when the ssr environment is absent", () => {
  const original = vi.fn();
  const server = {
    environments: {},
    ws: { send: original },
  } as unknown as import("vite").ViteDevServer;
  expect(() => bridgeHmrEventsToRunner(server)).not.toThrow();
});
