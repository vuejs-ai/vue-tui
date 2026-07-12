import { tokenizeAnsi, hasAnsiControlCharacters } from "./ansi-tokenizer.ts";

const sgrParametersRegex = /^[\d:;]*$/;
const singleLineControlCharactersRegex = /[\u0000-\u001f\u007f]/g;
const multilineControlCharactersRegex = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

export interface SanitizeAnsiOptions {
  /** Strip every plain-text C0/DEL byte so the result cannot change physical rows. */
  singleLine?: boolean;
}

type ControlCharacterMode = "preserve" | "single-line" | "multiline";

function stripPlainControls(text: string, mode: ControlCharacterMode): string {
  if (mode === "single-line") return text.replace(singleLineControlCharactersRegex, "");
  if (mode === "multiline") return text.replace(multilineControlCharactersRegex, "");
  return text;
}

function hasSafeOscPayload(value: string): boolean {
  const start = value.startsWith("\x1b]") ? 2 : 1;
  const end = value.endsWith("\x1b\\") ? value.length - 2 : value.length - 1;
  const payload = value.slice(start, end);
  // wrap-ansi understands OSC 8 hyperlinks and keeps their tokens intact while
  // wrapping. Other OSC commands (title, clipboard, working directory, etc.)
  // can be split into visible fragments by wrapping and have terminal-wide
  // side effects, so geometry-safe paths reserve them for the raw-stream bypass.
  return payload.startsWith("8;") && !/[\u0000-\u001f\u007f-\u009f]/.test(payload);
}

function sanitizeAnsiWithControlMode(text: string, mode: ControlCharacterMode): string {
  if (!hasAnsiControlCharacters(text)) return stripPlainControls(text, mode);

  let output = "";

  for (const token of tokenizeAnsi(text)) {
    if (token.type === "text") {
      output += stripPlainControls(token.value, mode);
      continue;
    }

    if (token.type === "osc") {
      // OSC is non-geometric only while its payload contains no executable
      // control bytes. Geometry-safe paths keep OSC 8 hyperlinks but
      // drop control-bearing OSC; callers that need raw terminal protocols can
      // write through the returned stream directly.
      if (mode === "preserve" || hasSafeOscPayload(token.value)) output += token.value;
      continue;
    }

    if (
      token.type === "csi" &&
      token.finalCharacter === "m" &&
      token.intermediateString === "" &&
      sgrParametersRegex.test(token.parameterString)
    ) {
      output += token.value;
    }
  }

  return output;
}

// Strip ANSI escape sequences that would conflict with vue-tui's layout.
// Preserved: SGR sequences (colors, bold, etc. - end with 'm') and
// OSC sequences (hyperlinks, etc. - ESC ] or C1 OSC).
// Stripped: cursor movement, screen clearing, and other control sequences.
export function sanitizeAnsi(text: string, options: SanitizeAnsiOptions = {}): string {
  return sanitizeAnsiWithControlMode(text, options.singleLine ? "single-line" : "preserve");
}

/** Preserve structural LF separators while stripping every other C0/DEL byte. */
export function sanitizeAnsiMultiline(text: string): string {
  return sanitizeAnsiWithControlMode(text, "multiline");
}
