// Pure string helpers for the i18n layer. No React, no side effects — kept
// separate so they can be unit-tested in isolation (tests/lib/i18nFormat.test.ts).

/**
 * Interpolates `{var}` placeholders in `template` with values from `vars`.
 * Placeholders with no matching key are left intact (so a missing var never
 * silently erases text — it stays visible and easy to spot).
 */
export function tf(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  )
}

/**
 * Picks the singular/plural form by `count` (English and Spanish share the
 * 1/other rule), injects `{count}` automatically, then interpolates any extra
 * `vars` through `tf`.
 */
export function plural(
  p: { one: string; other: string },
  count: number,
  vars?: Record<string, string | number>,
): string {
  const template = count === 1 ? p.one : p.other
  return tf(template, { count, ...vars })
}
