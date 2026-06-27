import { expect, test } from "vite-plus/test";
import { connectDevtools, isDevConnected, devState } from "./hmr.ts";

function fakeHot() {
  const handlers = new Map<string, (p: unknown) => void>();
  return {
    on: (e: string, cb: (p: unknown) => void) => handlers.set(e, cb),
    send: () => {},
    emit: (e: string, p: unknown) => handlers.get(e)?.(p),
  };
}

test("connectDevtools marks dev connected and wires the bridge to the passed hot", () => {
  expect(isDevConnected()).toBe(false);
  const hot = fakeHot();
  connectDevtools(hot);
  expect(isDevConnected()).toBe(true);
  hot.emit("vite:error", { err: { message: "boom" } });
  expect(devState.value).toEqual({ type: "error", error: { message: "boom" } });
});
