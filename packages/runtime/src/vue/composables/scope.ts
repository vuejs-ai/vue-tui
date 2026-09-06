import { getCurrentScope, onScopeDispose } from "vue";

export function tryOnScopeDispose(cleanup: () => void): boolean {
  if (!getCurrentScope()) return false;
  onScopeDispose(cleanup);
  return true;
}
