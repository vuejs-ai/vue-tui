import { describe, test, expect } from "vite-plus/test";
import { parseKeypress } from "./parse-keypress.ts";

function kittyKey(
  codepoint: number,
  modifiers?: number,
  eventType?: number,
  textCodepoints?: number[],
): string {
  let seq = `\x1b[${codepoint}`;
  if (modifiers !== undefined || eventType !== undefined || textCodepoints !== undefined) {
    seq += `;${modifiers ?? 1}`;
  }
  if (eventType !== undefined || textCodepoints !== undefined) {
    seq += `:${eventType ?? 1}`;
  }
  if (textCodepoints !== undefined) {
    seq += `;${textCodepoints.join(":")}`;
  }
  seq += "u";
  return seq;
}

// --- Task 4: Basic characters, modifiers, special keys ---

describe("kitty protocol - basic characters and modifiers", () => {
  test("simple character", () => {
    const result = parseKeypress(kittyKey(97));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(false);
    expect(result.shift).toBe(false);
    expect(result.meta).toBe(false);
    expect(result.eventType).toBe("press");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("uppercase character (shift)", () => {
    const result = parseKeypress(kittyKey(97, 2));
    expect(result.name).toBe("a");
    expect(result.shift).toBe(true);
    expect(result.ctrl).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("ctrl modifier", () => {
    const result = parseKeypress(kittyKey(97, 5));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("alt/option modifier", () => {
    const result = parseKeypress(kittyKey(97, 3));
    expect(result.name).toBe("a");
    expect(result.alt).toBe(true);
    expect(result.meta).toBe(false);
    expect(result.ctrl).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("super modifier", () => {
    const result = parseKeypress(kittyKey(97, 9));
    expect(result.name).toBe("a");
    expect(result.super).toBe(true);
    expect(result.ctrl).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("hyper modifier", () => {
    const result = parseKeypress(kittyKey(97, 17));
    expect(result.name).toBe("a");
    expect(result.hyper).toBe(true);
    expect(result.super).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("meta modifier", () => {
    const result = parseKeypress(kittyKey(97, 33));
    expect(result.name).toBe("a");
    expect(result.meta).toBe(true);
    expect(result.eventType).toBe("press");
  });

  test("caps lock", () => {
    const result = parseKeypress(kittyKey(97, 65));
    expect(result.name).toBe("a");
    expect(result.capsLock).toBe(true);
    expect(result.eventType).toBe("press");
  });

  test("num lock", () => {
    const result = parseKeypress(kittyKey(97, 129));
    expect(result.name).toBe("a");
    expect(result.numLock).toBe(true);
    expect(result.eventType).toBe("press");
  });

  test("combined modifiers (ctrl+shift)", () => {
    const result = parseKeypress(kittyKey(97, 6));
    expect(result.name).toBe("a");
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(true);
    expect(result.meta).toBe(false);
    expect(result.eventType).toBe("press");
  });

  test("combined modifiers (super+ctrl)", () => {
    const result = parseKeypress(kittyKey(115, 13));
    expect(result.name).toBe("s");
    expect(result.super).toBe(true);
    expect(result.ctrl).toBe(true);
    expect(result.shift).toBe(false);
    expect(result.eventType).toBe("press");
  });
});

describe("kitty protocol - special keys", () => {
  test("escape key", () => {
    const result = parseKeypress(kittyKey(27));
    expect(result.name).toBe("escape");
    expect(result.eventType).toBe("press");
  });

  test("return/enter key", () => {
    const result = parseKeypress(kittyKey(13));
    expect(result.name).toBe("return");
    expect(result.eventType).toBe("press");
  });

  test("tab key", () => {
    const result = parseKeypress(kittyKey(9));
    expect(result.name).toBe("tab");
    expect(result.eventType).toBe("press");
  });

  test("C0 codepoint 8 is not a Kitty backspace key", () => {
    const result = parseKeypress(kittyKey(8));
    expect(result.name).toBe("");
    expect(result.isPrintable).toBe(false);
  });

  test("backspace key (codepoint 127)", () => {
    const result = parseKeypress(kittyKey(127));
    expect(result.name).toBe("backspace");
    expect(result.eventType).toBe("press");
  });

  test("legacy meta+backspace (0x7F)", () => {
    const result = parseKeypress("\x1b\x7f");
    expect(result.name).toBe("backspace");
    expect(result.meta).toBe(true);
  });

  test("space key", () => {
    const result = parseKeypress(kittyKey(32));
    expect(result.name).toBe("space");
    expect(result.eventType).toBe("press");
  });
});

// --- Task 5: Event types, text/unicode, arrows, errors ---

describe("kitty protocol - event types", () => {
  test("press", () => {
    const result = parseKeypress(kittyKey(97, 1, 1));
    expect(result.name).toBe("a");
    expect(result.eventType).toBe("press");
  });

  test("repeat", () => {
    const result = parseKeypress(kittyKey(97, 1, 2));
    expect(result.name).toBe("a");
    expect(result.eventType).toBe("repeat");
  });

  test("release", () => {
    const result = parseKeypress(kittyKey(97, 1, 3));
    expect(result.name).toBe("a");
    expect(result.eventType).toBe("release");
  });
});

describe("kitty protocol - text and unicode", () => {
  test("number keys", () => {
    const result = parseKeypress(kittyKey(49));
    expect(result.name).toBe("1");
    expect(result.eventType).toBe("press");
  });

  test("special character (@)", () => {
    const result = parseKeypress(kittyKey(64));
    expect(result.name).toBe("@");
    expect(result.eventType).toBe("press");
  });

  test("rejects the non-standard C0 codepoint form for ctrl+letter", () => {
    const result = parseKeypress(kittyKey(1, 5));
    expect(result.name).toBe("");
    expect(result.isPrintable).toBe(false);
  });

  test("preserves sequence and raw", () => {
    const seq = kittyKey(97, 5);
    const result = parseKeypress(seq);
    expect(result.sequence).toBe(seq);
    expect(result.raw).toBe(seq);
  });

  test("text-as-codepoints field", () => {
    const result = parseKeypress(kittyKey(97, 2, 1, [65]));
    expect(result.name).toBe("a");
    expect(result.text).toBe("A");
    expect(result.shift).toBe(true);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("text-as-codepoints with multiple codepoints", () => {
    const result = parseKeypress(kittyKey(97, 1, 1, [72, 101]));
    expect(result.text).toBe("He");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("supplementary unicode codepoint (emoji)", () => {
    const result = parseKeypress(kittyKey(128_512));
    expect(result.name).toBe("\u{1F600}");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("text-as-codepoints with supplementary unicode", () => {
    const result = parseKeypress(kittyKey(97, 1, 1, [128_512]));
    expect(result.text).toBe("\u{1F600}");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("does not invent reported text when the field is absent", () => {
    const result = parseKeypress(kittyKey(97));
    expect(result.text).toBeUndefined();
    expect(result.isKittyProtocol).toBe(true);
  });
});

describe("kitty protocol - enhanced special keys", () => {
  test("arrow keys with event type", () => {
    const up = parseKeypress("\x1b[1;1:1A");
    expect(up.name).toBe("up");
    expect(up.eventType).toBe("press");
    expect(up.isKittyProtocol).toBe(true);

    const down = parseKeypress("\x1b[1;1:3B");
    expect(down.name).toBe("down");
    expect(down.eventType).toBe("release");

    const right = parseKeypress("\x1b[1;1:2C");
    expect(right.name).toBe("right");
    expect(right.eventType).toBe("repeat");

    const left = parseKeypress("\x1b[1;1:1D");
    expect(left.name).toBe("left");
    expect(left.eventType).toBe("press");
  });

  test("arrow keys with modifiers", () => {
    const result = parseKeypress("\x1b[1;5:1A");
    expect(result.name).toBe("up");
    expect(result.ctrl).toBe(true);
    expect(result.eventType).toBe("press");
    expect(result.isKittyProtocol).toBe(true);
  });

  test("home and end keys", () => {
    const home = parseKeypress("\x1b[1;1:1H");
    expect(home.name).toBe("home");
    expect(home.eventType).toBe("press");
    expect(home.isKittyProtocol).toBe(true);

    const end = parseKeypress("\x1b[1;1:1F");
    expect(end.name).toBe("end");
    expect(end.eventType).toBe("press");
  });

  test("tilde-terminated special keys", () => {
    const del = parseKeypress("\x1b[3;1:1~");
    expect(del.name).toBe("delete");
    expect(del.isKittyProtocol).toBe(true);

    const ins = parseKeypress("\x1b[2;1:1~");
    expect(ins.name).toBe("insert");

    const pgup = parseKeypress("\x1b[5;1:1~");
    expect(pgup.name).toBe("pageup");

    const f5 = parseKeypress("\x1b[15;1:1~");
    expect(f5.name).toBe("f5");
  });

  test("tilde keys with modifiers", () => {
    const result = parseKeypress("\x1b[3;2:1~");
    expect(result.name).toBe("delete");
    expect(result.shift).toBe(true);
    expect(result.eventType).toBe("press");
    expect(result.isKittyProtocol).toBe(true);
  });
});

describe("kitty protocol - error handling", () => {
  test("invalid codepoint above U+10FFFF returns safe empty keypress", () => {
    const result = parseKeypress("\x1b[1114112u");
    expect(result.name).toBe("");
    expect(result.ctrl).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
    expect(result.isPrintable).toBe(false);
  });

  test("surrogate codepoint returns safe empty keypress", () => {
    const result = parseKeypress("\x1b[55296u");
    expect(result.name).toBe("");
    expect(result.ctrl).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
    expect(result.isPrintable).toBe(false);
  });

  test("invalid text codepoint returns a safe uninterpreted keypress", () => {
    const result = parseKeypress(kittyKey(97, 1, 1, [1_114_112]));
    expect(result.name).toBe("");
    expect(result.text).toBeUndefined();
    expect(result.isKittyProtocol).toBe(true);
    expect(result.isPrintable).toBe(false);
  });

  test("malformed modifier 0 returns a safe uninterpreted keypress", () => {
    const result = parseKeypress("\x1b[97;0u");
    expect(result.name).toBe("");
    expect(result.ctrl).toBe(false);
    expect(result.shift).toBe(false);
    expect(result.meta).toBe(false);
    expect(result.super ?? false).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
    expect(result.isPrintable).toBe(false);
  });
});

// --- Task 6: Query filter, legacy fallback, isPrintable, non-printable keys ---

describe("kitty protocol - query response filtering", () => {
  test("query response returns ignored keypress", () => {
    const result = parseKeypress("\x1b[?1u");
    expect(result.name).toBe("");
    expect(result.ignore).toBe(true);
  });

  test("multi-digit query response returns ignored keypress", () => {
    const result = parseKeypress("\x1b[?31u");
    expect(result.name).toBe("");
    expect(result.ignore).toBe(true);
  });
});

describe("kitty protocol - legacy fallback", () => {
  test("non-kitty sequences fall back to legacy parsing", () => {
    const result = parseKeypress("\x1b[A");
    expect(result.name).toBe("up");
    expect(result.isKittyProtocol).toBeUndefined();
  });

  test("ctrl+c legacy fallback", () => {
    const result = parseKeypress("\x03");
    expect(result.name).toBe("c");
    expect(result.ctrl).toBe(true);
    expect(result.isKittyProtocol).toBeUndefined();
  });
});

describe("kitty protocol - isPrintable field", () => {
  test("true for regular characters", () => {
    expect(parseKeypress(kittyKey(97)).isPrintable).toBe(true);
  });

  test("true for digits", () => {
    expect(parseKeypress(kittyKey(49)).isPrintable).toBe(true);
  });

  test("true for symbols", () => {
    expect(parseKeypress(kittyKey(64)).isPrintable).toBe(true);
  });

  test("true for emoji", () => {
    expect(parseKeypress(kittyKey(128_512)).isPrintable).toBe(true);
  });

  test("false for escape", () => {
    expect(parseKeypress(kittyKey(27)).isPrintable).toBe(false);
  });

  test("false for return", () => {
    expect(parseKeypress(kittyKey(13)).isPrintable).toBe(false);
  });

  test("false for tab", () => {
    expect(parseKeypress(kittyKey(9)).isPrintable).toBe(false);
  });

  test("true for space", () => {
    expect(parseKeypress(kittyKey(32)).isPrintable).toBe(true);
  });

  test("false for backspace", () => {
    expect(parseKeypress(kittyKey(127)).isPrintable).toBe(false);
  });

  test("true for the printable key identity in ctrl+letter", () => {
    expect(parseKeypress(kittyKey(97, 5)).isPrintable).toBe(true);
  });

  test("false for special keys (arrows)", () => {
    expect(parseKeypress("\x1b[1;1:1A").isPrintable).toBe(false);
  });
});

describe("kitty protocol - non-printable key suppression", () => {
  test("capslock (57358) is non-printable", () => {
    const result = parseKeypress("\x1b[57358u");
    expect(result.name).toBe("capslock");
    expect(result.isPrintable).toBe(false);
    expect(result.isKittyProtocol).toBe(true);
  });

  test("printscreen (57361) is non-printable", () => {
    const result = parseKeypress("\x1b[57361u");
    expect(result.name).toBe("printscreen");
    expect(result.isPrintable).toBe(false);
  });

  test("f13 (57376) is non-printable", () => {
    const result = parseKeypress("\x1b[57376u");
    expect(result.name).toBe("f13");
    expect(result.isPrintable).toBe(false);
  });

  test("media key (57428 mediaplay) is non-printable", () => {
    const result = parseKeypress("\x1b[57428u");
    expect(result.name).toBe("mediaplay");
    expect(result.isPrintable).toBe(false);
  });

  test("modifier-only key (57441 leftshift) is non-printable", () => {
    const result = parseKeypress("\x1b[57441u");
    expect(result.name).toBe("leftshift");
    expect(result.isPrintable).toBe(false);
  });

  test("modifier-only key (57442 leftcontrol) is non-printable", () => {
    const result = parseKeypress("\x1b[57442u");
    expect(result.name).toBe("leftcontrol");
    expect(result.isPrintable).toBe(false);
  });

  test("kp keys (57399 kp0) are non-printable", () => {
    const result = parseKeypress("\x1b[57399u");
    expect(result.name).toBe("kp0");
    expect(result.isPrintable).toBe(false);
  });

  test("scrolllock (57359) is non-printable", () => {
    const result = parseKeypress("\x1b[57359u");
    expect(result.name).toBe("scrolllock");
    expect(result.isPrintable).toBe(false);
  });

  test("numlock (57360) is non-printable", () => {
    const result = parseKeypress("\x1b[57360u");
    expect(result.name).toBe("numlock");
    expect(result.isPrintable).toBe(false);
  });

  test("pause (57362) is non-printable", () => {
    const result = parseKeypress("\x1b[57362u");
    expect(result.name).toBe("pause");
    expect(result.isPrintable).toBe(false);
  });

  test("volume keys are non-printable", () => {
    const lower = parseKeypress("\x1b[57438u");
    expect(lower.name).toBe("lowervolume");
    expect(lower.isPrintable).toBe(false);

    const raise = parseKeypress("\x1b[57439u");
    expect(raise.name).toBe("raisevolume");
    expect(raise.isPrintable).toBe(false);

    const mute = parseKeypress("\x1b[57440u");
    expect(mute.name).toBe("mutevolume");
    expect(mute.isPrintable).toBe(false);
  });
});

describe("kitty protocol - absent associated text", () => {
  test("space key does not fabricate a reported text field", () => {
    const result = parseKeypress(kittyKey(32));
    expect(result.text).toBeUndefined();
  });

  test("return key does not fabricate a reported text field", () => {
    const result = parseKeypress(kittyKey(13));
    expect(result.text).toBeUndefined();
  });
});
