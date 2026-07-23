import type { ShallowRef } from "vue";
import type { ClipboardWriteResult } from "../clipboard/clipboard-service.ts";

export type TextSelectionMove =
  | "backward"
  | "forward"
  | "up"
  | "down"
  | "line-start"
  | "line-end"
  | "document-start"
  | "document-end";

export interface TextSelectionRange {
  readonly anchor: number;
  readonly extent: number;
  readonly direction: "forward" | "backward";
  readonly collapsed: boolean;
}

export type TextSelectionUnavailableReason =
  | "host-unavailable"
  | "string-host"
  | "mapping-unavailable";

export type TextSelectionState =
  | { readonly status: "inactive" | "pending"; readonly range: null; readonly selectedText: "" }
  | {
      readonly status: "unavailable";
      readonly reason: TextSelectionUnavailableReason;
      readonly range: null;
      readonly selectedText: "";
    }
  | {
      readonly status: "ready" | "suspended";
      readonly text: string;
      readonly range: TextSelectionRange | null;
      readonly selectedText: string;
    };

export type TextSelectionCopyResult = { readonly status: "empty" } | ClipboardWriteResult;

export interface TextSelectionCommands {
  readonly state: Readonly<ShallowRef<TextSelectionState>>;
  move(direction: TextSelectionMove, options?: { readonly extend?: boolean }): boolean;
  selectAll(): boolean;
  clear(): boolean;
  copy(): Promise<TextSelectionCopyResult>;
}
