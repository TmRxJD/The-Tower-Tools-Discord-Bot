const fields = new Set([
  'components', 'embeds', 'attachments', 'files', 'content', 'flags', 'type', 'custom_id',
  'data', 'label', 'value', 'values', 'description', 'placeholder', 'options', 'min_values',
  'max_values', 'default', 'disabled', 'url', 'title', 'fields', 'name', 'image',
  'thumbnail', 'footer', 'text', 'icon_url', 'author', 'style', 'emoji', 'id',
]);
const codes = new Set([
  'BASE_TYPE_REQUIRED', 'BASE_TYPE_MAX_LENGTH', 'BASE_TYPE_MIN_LENGTH', 'BASE_TYPE_BAD_LENGTH',
  'BASE_TYPE_CHOICES', 'BASE_TYPE_BAD_FORMAT', 'BASE_TYPE_INVALID', 'STRING_TYPE_MAX_LENGTH',
  'STRING_TYPE_MIN_LENGTH', 'STRING_TYPE_CONVERT', 'NUMBER_TYPE_MIN', 'NUMBER_TYPE_MAX',
  'COMPONENT_CUSTOM_ID_DUPLICATED', 'COMPONENT_MAX_TOTAL_COMPONENTS',
  'SELECT_COMPONENT_TOO_MANY_DEFAULT_VALUES', 'SELECT_COMPONENT_INVALID_OPTION',
]);

/** Bounded schema locations only. Discord messages and arbitrary object keys may contain user data. */
export function discordValidationDiagnostics(errors: unknown): {
  validationIssues: Array<{ path: string; code: string }>;
  validationTruncated: boolean;
} {
  const validationIssues: Array<{ path: string; code: string }> = [];
  const seen = new WeakSet<object>();
  let nodes = 0;
  let validationTruncated = false;
  function walk(value: unknown, path: string[], depth: number): void {
    if (!value || typeof value !== 'object') return;
    if (++nodes > 128 || depth > 8 || validationIssues.length >= 16 || seen.has(value)) {
      validationTruncated = true;
      return;
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (Array.isArray(record._errors)) {
      const remaining = 16 - validationIssues.length;
      for (const issue of record._errors.slice(0, remaining)) {
        const code = issue && typeof issue === 'object' ? (issue as { code?: unknown }).code : undefined;
        validationIssues.push({ path: path.join('.') || '$', code: typeof code === 'string' && codes.has(code) ? code : 'other' });
      }
      if (record._errors.length > remaining) validationTruncated = true;
    }
    const keys = Object.keys(record).filter(key => key !== '_errors');
    if (keys.length > 32) validationTruncated = true;
    for (const key of keys.slice(0, 32)) {
      if (validationIssues.length >= 16 || nodes >= 128) { validationTruncated = true; break; }
      const safeKey = fields.has(key) || /^\d{1,3}$/.test(key) ? key : '*';
      walk(record[key], [...path, safeKey], depth + 1);
    }
  }
  try { walk(errors, [], 0); } catch { validationTruncated = true; }
  return { validationIssues, validationTruncated };
}
