import { readonly, shallowRef, type Ref } from "vue";

export type InputAvailability =
  | { readonly status: "available" }
  | {
      readonly status: "unavailable";
      readonly reason: "string-host" | "stdin-not-tty" | "stdin-not-controllable";
    };

const available: InputAvailability = Object.freeze({ status: "available" });
const stdinNotTty: InputAvailability = Object.freeze({
  status: "unavailable",
  reason: "stdin-not-tty",
});
const stdinNotControllable: InputAvailability = Object.freeze({
  status: "unavailable",
  reason: "stdin-not-controllable",
});
export const stringInputUnavailable: InputAvailability = Object.freeze({
  status: "unavailable",
  reason: "string-host",
});

/** Classify the stable mount-time capability of one live stdin host. */
export function classifyLiveInputAvailability(stdin: NodeJS.ReadStream): InputAvailability {
  const input = stdin as NodeJS.ReadStream & {
    readonly isRaw?: boolean;
    readonly isTTY?: boolean;
    readonly setRawMode?: (mode: boolean) => unknown;
  };
  if (input.isTTY !== true) return stdinNotTty;
  if (input.isRaw === true || typeof input.setRawMode === "function") return available;
  return stdinNotControllable;
}

/** Create the stable runtime-readonly ref exposed for one render host lifetime. */
export function createInputAvailabilityRef(
  availability: InputAvailability,
): Readonly<Ref<InputAvailability>> {
  return readonly(shallowRef(availability));
}
