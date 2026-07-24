import type { TuiInputEvent, TuiKeyName } from "@vue-tui/runtime";

export function inputText(event: TuiInputEvent): string | null {
  return event.type === "text" || event.type === "paste" ? event.text : null;
}

export function isKey(event: TuiInputEvent, name: TuiKeyName): boolean {
  return event.type === "key" && event.key.name === name;
}
