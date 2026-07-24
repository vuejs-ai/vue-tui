/**
 * Box and Text deliberately have a closed attribute surface. Vue normally
 * treats undeclared component inputs as fallthrough attributes; because these
 * custom-renderer components cannot give browser attributes useful terminal
 * semantics, silently dropping one would turn an old prop or a typo into a
 * layout change with no diagnostic.
 *
 * Vue removes component mechanics such as key, ref, and vnode lifecycle hooks
 * before exposing `attrs`, so rejecting every remaining key does not interfere
 * with ordinary Vue ownership.
 */
export function assertNoUnsupportedAttrs(
  component: "Box" | "Text",
  attrs: Readonly<Record<string, unknown>>,
): true {
  for (const key of Reflect.ownKeys(attrs)) {
    if (typeof key === "symbol") {
      throw new Error(`<${component}> does not accept symbol attributes.`);
    }
    throw new Error(
      `<${component}> does not accept the undeclared attribute ${JSON.stringify(key)}. ` +
        `Use a declared <${component}> prop.`,
    );
  }
  return true;
}
