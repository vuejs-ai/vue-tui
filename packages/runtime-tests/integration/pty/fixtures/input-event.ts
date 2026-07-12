import type { TuiInputEvent } from "@vue-tui/runtime";

export function inputText(event: TuiInputEvent): string | null {
  if (event.kind === "text" || event.kind === "paste") return event.text;
  if (event.kind !== "key") return null;
  return event.key.reportedText;
}

export function isKey(event: TuiInputEvent, name: string): boolean {
  return event.kind === "key" && event.key.name === name;
}
