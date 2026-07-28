import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

let nextAddressId = 0;

export function createEventAddress(): string {
  const suffix = [
    process.pid.toString(36),
    (nextAddressId++).toString(36),
    randomBytes(4).toString("hex"),
  ].join("-");

  if (process.platform === "win32") {
    return String.raw`\\.\pipe\vue-tui-hmr-${suffix}`;
  }

  return join(tmpdir(), `vue-tui-hmr-${suffix}.sock`);
}
