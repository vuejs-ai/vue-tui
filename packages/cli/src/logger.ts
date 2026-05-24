export type LogMode = "stdout" | "silent";

export interface Logger {
  mode: LogMode;
  info(msg: string): void;
  error(msg: string): void;
}

export function createLogger(): Logger {
  let mode: LogMode = "stdout";
  return {
    get mode() {
      return mode;
    },
    set mode(m: LogMode) {
      mode = m;
    },
    info(msg: string) {
      if (mode === "stdout") process.stdout.write(msg + "\n");
    },
    error(msg: string) {
      if (mode === "stdout") process.stderr.write(msg + "\n");
    },
  };
}
