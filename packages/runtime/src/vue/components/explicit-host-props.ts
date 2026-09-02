import { camelize } from "vue";

/**
 * Forward only props the caller supplied on the current component VNode.
 *
 * Component `props` contains every declaration, including absent Boolean and
 * defaulted values. Binding that complete reactive object makes Vue enumerate
 * and copy the whole declaration table whenever slot content updates. Native
 * hosts already own the same defaults, so omitted declarations need no patch.
 * Explicit values are read from `resolvedProps` to retain Vue's Boolean and
 * default normalization, including an explicitly supplied `undefined`.
 */
export function explicitHostProps<Resolved extends object>(
  resolvedProps: Resolved,
  vnodeProps: Readonly<Record<string, unknown>> | null,
  declarations: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const forwarded: Record<string, unknown> = {};
  if (vnodeProps === null) return forwarded;
  const resolved = resolvedProps as Readonly<Record<string, unknown>>;
  for (const rawKey of Object.keys(vnodeProps)) {
    const key = camelize(rawKey);
    if (!Object.prototype.hasOwnProperty.call(declarations, key)) continue;
    forwarded[key] = resolved[key];
  }
  return forwarded;
}
