import { shallowRef, type MaybeRef, type MaybeRefOrGetter } from "vue";
import { expectTypeOf } from "vite-plus/test";
import { useInput } from "@vue-tui/runtime";
import type { TuiInputEvent, TuiKey, TuiKeyName } from "@vue-tui/runtime";

// Semantic input exposes insertion text, complete paste, and one nested logical-key fact.
expectTypeOf<TuiKeyName>().toEqualTypeOf<
  | "backspace"
  | "tab"
  | "enter"
  | "escape"
  | "insert"
  | "delete"
  | "up"
  | "down"
  | "left"
  | "right"
  | "home"
  | "end"
  | "page-up"
  | "page-down"
  | "f1"
  | "f2"
  | "f3"
  | "f4"
  | "f5"
  | "f6"
  | "f7"
  | "f8"
  | "f9"
  | "f10"
  | "f11"
  | "f12"
  | (string & {})
>();
const suggestedKeyName: TuiKeyName = "page-down";
const futureKeyName: TuiKeyName = "media-fast-forward";
void suggestedKeyName;
void futureKeyName;
// @ts-expect-error Named keys are strings.
const invalidKeyName: TuiKeyName = 1;
void invalidKeyName;

type ExpectedTuiKey = {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly super: boolean;
  readonly hyper: boolean;
} & (
  | {
      readonly name: TuiKeyName;
      readonly character?: never;
    }
  | {
      readonly character: string;
      readonly name?: never;
    }
);
expectTypeOf<TuiKey>().toEqualTypeOf<ExpectedTuiKey>();

type ExpectedTuiInputEvent =
  | {
      readonly type: "text";
      readonly text: string;
      readonly key?: TuiKey;
    }
  | {
      readonly type: "key";
      readonly key: TuiKey;
      readonly text?: never;
    }
  | {
      readonly type: "paste";
      readonly text: string;
      readonly key?: never;
    };
expectTypeOf<TuiInputEvent>().toEqualTypeOf<ExpectedTuiInputEvent>();
const completeNamedKey: TuiKey = {
  name: "enter",
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  super: false,
  hyper: false,
};
const plainTextEvent: TuiInputEvent = { type: "text", text: "a" };
const enhancedTextEvent: TuiInputEvent = {
  type: "text",
  text: "A",
  key: { ...completeNamedKey, name: "future-key", shift: true },
};
const keyOnlyEvent: TuiInputEvent = { type: "key", key: completeNamedKey };
const emptyPasteEvent: TuiInputEvent = { type: "paste", text: "" };
void plainTextEvent;
void enhancedTextEvent;
void keyOnlyEvent;
void emptyPasteEvent;
// @ts-expect-error A key event requires one complete nested key.
const incompleteKeyEvent: TuiInputEvent = { type: "key", key: { name: "enter" } };
// @ts-expect-error A key event never carries insertion text.
const textOnKeyEvent: TuiInputEvent = { type: "key", key: completeNamedKey, text: "x" };
// @ts-expect-error Paste carries only its decoded payload.
const keyOnPasteEvent: TuiInputEvent = { type: "paste", text: "", key: completeNamedKey };
void incompleteKeyEvent;
void textOnKeyEvent;
void keyOnPasteEvent;

type InputHandler = (event: TuiInputEvent) => void;
expectTypeOf<Parameters<typeof useInput>[0]>().toEqualTypeOf<MaybeRef<InputHandler>>();
expectTypeOf<Parameters<typeof useInput>[1]>().toEqualTypeOf<
  { readonly isActive?: MaybeRefOrGetter<boolean> } | undefined
>();

const inputHandler: InputHandler = (event) => {
  if (event.type === "key" && event.key.character === "c" && event.key.ctrl) {
    return;
  }
};
const inputActive = shallowRef(true);
useInput(inputHandler, { isActive: inputActive });
useInput(inputHandler, { isActive: () => inputActive.value });
const liveInputHandler = shallowRef(inputHandler);
useInput(liveInputHandler);

declare const inputEvent: TuiInputEvent;
if (inputEvent.type === "key") {
  expectTypeOf(inputEvent.key.shift).toEqualTypeOf<boolean>();
  expectTypeOf(inputEvent.key.alt).toEqualTypeOf<boolean>();
  expectTypeOf(inputEvent.key.ctrl).toEqualTypeOf<boolean>();
  expectTypeOf(inputEvent.key.meta).toEqualTypeOf<boolean>();
  expectTypeOf(inputEvent.key.super).toEqualTypeOf<boolean>();
  expectTypeOf(inputEvent.key.hyper).toEqualTypeOf<boolean>();
  if (inputEvent.key.name !== undefined) {
    expectTypeOf(inputEvent.key.name).toEqualTypeOf<TuiKeyName>();
  } else {
    expectTypeOf(inputEvent.key.character).toEqualTypeOf<string>();
  }
  // @ts-expect-error Normalized key facts are readonly.
  inputEvent.key.ctrl = false;
} else {
  expectTypeOf(inputEvent.text).toEqualTypeOf<string>();
  // @ts-expect-error Normalized text and paste payloads are readonly.
  inputEvent.text = "replacement";
}
if (inputEvent.type === "text" && inputEvent.key) {
  expectTypeOf(inputEvent.key).toEqualTypeOf<TuiKey>();
}

useInput(() => undefined);
// Handler results are deliberately ignored rather than defining propagation or defaults.
useInput(() => 42);
useInput(async () => undefined);
useInput(() => ({ arbitrary: true }));
// @ts-expect-error Activation must resolve to a boolean.
useInput(inputHandler, { isActive: "yes" });
