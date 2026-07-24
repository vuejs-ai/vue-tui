export const showCursorEscape = "\x1b[?25h";
export const hideCursorEscape = "\x1b[?25l";

// ECMA-48 NEL (Next Line): move to column zero of the following row and scroll
// when already at the bottom margin. CSI E can be clamped at the bottom and
// let later output overwrite the final row instead of committing it.
export const nextLineEscape = "\x1bE";
