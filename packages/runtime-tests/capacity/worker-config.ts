export const capacityWorkerV8Flags = Object.freeze([
  "--invocation-count-for-feedback-allocation=1",
] as const);

export function assertCapacityWorkerV8Flags(execArgv: readonly string[]): void {
  for (const flag of capacityWorkerV8Flags) {
    if (!execArgv.includes(flag)) {
      throw new Error(`capacity worker requires V8 flag ${flag}`);
    }
  }
}
