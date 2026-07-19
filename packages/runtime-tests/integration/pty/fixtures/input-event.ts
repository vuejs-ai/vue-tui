import type { TuiInputEvent, TuiKeyName } from "@vue-tui/runtime";

export function inputText(event: TuiInputEvent): string | null {
  return event.kind === "text" || event.kind === "paste" ? event.text : null;
}

export function isKey(event: TuiInputEvent, name: TuiKeyName): boolean {
  return event.kind === "key" && event.name === name;
}
