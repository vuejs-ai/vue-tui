import { tokenizeAnsi, hasAnsiControlCharacters } from "./ansi-tokenizer.ts";

const sgrParametersRegex = /^[\d:;]*$/;

// Strip ANSI escape sequences that would conflict with vue-tui's layout.
// Preserved: SGR sequences (colors, bold, etc. - end with 'm') and
// OSC sequences (hyperlinks, etc. - ESC ] or C1 OSC).
// Stripped: cursor movement, screen clearing, and other control sequences.
export function sanitizeAnsi(text: string): string {
  if (!hasAnsiControlCharacters(text)) {
    return text;
  }

  let output = "";

  for (const token of tokenizeAnsi(text)) {
    if (token.type === "text" || token.type === "osc") {
      output += token.value;
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
