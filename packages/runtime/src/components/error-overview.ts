import * as fs from "node:fs";
import { cwd } from "node:process";
import { defineComponent, h, type PropType } from "vue";
import StackUtils from "stack-utils";
import codeExcerpt, { type CodeExcerpt } from "code-excerpt";
import { messageForNonError } from "../error-value.ts";
import Box from "./box.vue";
import Text from "./text.vue";

// Ported from Ink's src/components/ErrorOverview.tsx (v7.0.4). We use the <Box>
// and <Text> wrapper components (not raw host elements) because Ink does, and
// because aria-label support is implemented at that component layer in vue-tui —
// the labels are only emitted when a screen reader is enabled, matching Ink.

// Error's source file is reported as file:///home/user/file.js; this removes
// the `file://[cwd]/` prefix so paths render cwd-relative (Ink cleanupPath).
const cleanupPath = (path: string | undefined): string | undefined => {
  return path?.replace(`file://${cwd()}/`, "");
};

const stackUtils = new StackUtils({
  cwd: cwd(),
  internals: StackUtils.nodeInternals(),
});

export const ErrorOverview = defineComponent({
  name: "ErrorOverview",
  props: {
    // `error` is the RAW thrown value, not necessarily an Error. Ink stores the
    // raw value too (ErrorBoundary.tsx:18) and a primitive throw (e.g.
    // `throw "x"`) has no `.stack`, so only the header renders. Typed `unknown`
    // (validator `null` = "any value, including undefined") and unwrapped
    // defensively below so a non-Error can't crash the overview.
    error: { type: null as unknown as PropType<unknown>, required: true },
  },
  setup(props) {
    return () => {
      const error = props.error;

      // Pull `.stack`/`.message` defensively: the value may be a primitive.
      // Read `.stack` exactly ONCE under try/catch (mirroring how
      // messageForNonError reads `.message` once under guard): a pathological
      // thrown value can carry a throwing `.stack` getter, and this render runs
      // on the error-display path where a throw would re-fault the boundary. If
      // the read throws or isn't a string, treat it as no-stack — the overview
      // then renders header-only, which is already the primitive-throw path.
      let errorStack: string | undefined;
      try {
        const rawStack = (error as { stack?: unknown })?.stack;
        errorStack = typeof rawStack === "string" ? rawStack : undefined;
      } catch {
        errorStack = undefined;
      }
      // Ink renders `{error.message}`. A cross-realm Error has a different
      // prototype and fails `instanceof Error`, so read a string `.message`
      // structurally; primitives still fall back to String(value). The same
      // helper computes the message render.ts rejects waitUntilExit() with, so
      // the shown and rejected messages stay identical (e17).
      const errorMessage = messageForNonError(error);

      // First stack line is the message; the rest are frames. The first frame
      // is the throw origin used for the file:line:col header and excerpt.
      const stack = errorStack ? errorStack.split("\n").slice(1) : undefined;
      const origin = stack ? stackUtils.parseLine(stack[0]!) : undefined;
      const filePath = cleanupPath(origin?.file);
      let excerpt: CodeExcerpt[] | undefined;
      let lineWidth = 0;

      // Guard the source read: a crafted/stale `.stack` can parse to an existing
      // DIRECTORY (fs.existsSync true → fs.readFileSync throws EISDIR) or an
      // unreadable path, and this runs on the error-DISPLAY path. An unguarded
      // throw would re-fault the boundary and repaint the overview for THAT error
      // while waitUntilExit() rejects with the original — a displayed-vs-rejected
      // disagreement (e17). On any failure, treat it as "no excerpt": leave
      // `excerpt` undefined so only the header/origin render (the no-excerpt path).
      if (filePath && origin?.line && fs.existsSync(filePath)) {
        try {
          const sourceCode = fs.readFileSync(filePath, "utf8");
          excerpt = codeExcerpt(sourceCode, origin.line);

          if (excerpt) {
            for (const { line } of excerpt) {
              lineWidth = Math.max(lineWidth, String(line).length);
            }
          }
        } catch {
          excerpt = undefined;
        }
      }

      const children: ReturnType<typeof h>[] = [];

      // ── White-on-red " ERROR " label + the error message ──
      children.push(
        h(
          Box,
          { flexShrink: 0 },
          {
            default: () => [
              h(Text, { backgroundColor: "red", color: "white" }, { default: () => " ERROR " }),
              h(Text, null, { default: () => ` ${errorMessage}` }),
            ],
          },
        ),
      );

      // ── Parsed file:line:column origin (dimColor) ──
      if (origin && filePath) {
        children.push(
          h(
            Box,
            { marginTop: 1 },
            {
              default: () =>
                h(
                  Text,
                  { dimColor: true },
                  {
                    default: () => `${filePath}:${origin.line}:${origin.column}`,
                  },
                ),
            },
          ),
        );
      }

      // ── Code excerpt around the throwing line ──
      if (origin && excerpt) {
        children.push(
          h(
            Box,
            { marginTop: 1, flexDirection: "column" },
            {
              default: () =>
                excerpt!.map(({ line, value }) =>
                  h(
                    Box,
                    { key: line },
                    {
                      default: () => [
                        // Right-padded line-number gutter (width = max digits + 1).
                        h(
                          Box,
                          { width: lineWidth + 1 },
                          {
                            default: () =>
                              h(
                                Text,
                                {
                                  dimColor: line !== origin.line,
                                  backgroundColor: line === origin.line ? "red" : undefined,
                                  color: line === origin.line ? "white" : undefined,
                                  ariaLabel:
                                    line === origin.line ? `Line ${line}, error` : `Line ${line}`,
                                },
                                { default: () => `${String(line).padStart(lineWidth, " ")}:` },
                              ),
                          },
                        ),
                        h(
                          Text,
                          {
                            backgroundColor: line === origin.line ? "red" : undefined,
                            color: line === origin.line ? "white" : undefined,
                          },
                          { default: () => ` ${value}` },
                        ),
                      ],
                    },
                  ),
                ),
            },
          ),
        );
      }

      // ── Parsed stack trace ──
      // Mirrors Ink's `error.stack && …` guard (ErrorOverview.tsx:90): only
      // render the stack block when the thrown value actually carries a stack.
      // A primitive throw has none, so this block (and the origin/excerpt blocks
      // above, which depend on `origin`) is skipped — just the header shows.
      if (errorStack) {
        children.push(
          h(
            Box,
            { marginTop: 1, flexDirection: "column" },
            {
              default: () =>
                errorStack
                  .split("\n")
                  .slice(1)
                  .map((line) => {
                    const parsedLine = stackUtils.parseLine(line);

                    // Unparsable line fallback: print the raw line verbatim.
                    if (!parsedLine) {
                      return h(
                        Box,
                        { key: line },
                        {
                          default: () => [
                            h(Text, { dimColor: true }, { default: () => "- " }),
                            h(
                              Text,
                              { dimColor: true, bold: true },
                              // Ink's JSX `{line}\t{' '}` (ErrorOverview.tsx:105-108): `\t`
                              // in JSXText is TWO LITERAL chars (backslash + 't'), NOT a tab
                              // escape. Emit the literal backslash-'t' + space for byte parity —
                              // a template literal `\t` here would produce a real TAB (0x09).
                              { default: () => line + "\\t " },
                            ),
                          ],
                        },
                      );
                    }

                    const file = cleanupPath(parsedLine.file) ?? "";
                    return h(
                      Box,
                      { key: line },
                      {
                        default: () => [
                          h(Text, { dimColor: true }, { default: () => "- " }),
                          h(
                            Text,
                            { dimColor: true, bold: true },
                            {
                              default: () => parsedLine.function,
                            },
                          ),
                          h(
                            Text,
                            {
                              dimColor: true,
                              color: "gray",
                              ariaLabel: `at ${file} line ${parsedLine.line} column ${parsedLine.column}`,
                            },
                            { default: () => ` (${file}:${parsedLine.line}:${parsedLine.column})` },
                          ),
                        ],
                      },
                    );
                  }),
            },
          ),
        );
      }

      // Keep the fatal header on physical row zero. Vertical padding can consume
      // the entire bounded Inline viewport when the terminal has one row,
      // leaving no observable error at all. Horizontal padding retains the
      // existing visual separation without weakening the renderer row bound.
      return h(
        Box,
        { flexDirection: "column", paddingLeft: 1, paddingRight: 1 },
        { default: () => children },
      );
    };
  },
});
