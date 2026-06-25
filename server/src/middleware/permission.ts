/**
 * Permission matching — single source of truth for authorization (T2 / G3).
 *
 * Reconciles the two authorization vocabularies that previously diverged:
 *   - coarse API-key scopes:        'read' | 'write' | 'admin'
 *   - rich role permission strings:  '*' | 'read:*' | 'write:compliance' | 'write:tokens'
 *
 * Both `requireScope` (route guard) and `iam.checkApiKeyScope` delegate here so a
 * key carrying either vocabulary is matched identically.
 *
 * Semantics — a `required` permission (e.g. 'read', 'write:tokens') is granted when any
 * held permission `g` satisfies:
 *   1. superuser:        g === '*' or g === 'admin'         -> grants everything
 *   2. exact:            g === required
 *   3. coarse-covers:    required starts with `${g}:`        e.g. 'write' covers 'write:tokens'
 *   4. wildcard:         g === `${prefix}:*` and required is `prefix` or starts with `${prefix}:`
 *                                                            e.g. 'read:*' covers 'read' and 'read:assets'
 *
 * Note: an action does NOT imply another action — 'write' never satisfies 'read'.
 */
export function permissionGranted(granted: readonly string[] | undefined, required: string): boolean {
  if (!granted || granted.length === 0) return false;
  for (const g of granted) {
    if (g === '*' || g === 'admin') return true;          // 1. superuser
    if (g === required) return true;                       // 2. exact
    if (required.startsWith(`${g}:`)) return true;         // 3. coarse action covers resource
    if (g.endsWith(':*')) {                                // 4. wildcard within an action
      const prefix = g.slice(0, -2);
      if (required === prefix || required.startsWith(`${prefix}:`)) return true;
    }
  }
  return false;
}

/** Build a canonical required-permission string from an action and optional resource. */
export function requiredPermission(action: string, resource?: string): string {
  return resource ? `${action}:${resource}` : action;
}
