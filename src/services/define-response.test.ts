import { expect, it } from 'vitest';
import { buildDefineResponse } from './define-response';

it.each([0, 1_999, 2_000])('keeps %i-unit content inline', length => {
  const text = 'a'.repeat(length);
  expect(buildDefineResponse(text)).toEqual({ content: text, files: [] });
});

it.each(['a'.repeat(2_001), '🚀'.repeat(2_000), '👩🏽‍💻\né中文'.repeat(1_000)])(
  'bounds the Unicode preview and preserves the complete UTF-8 attachment', text => {
    const result = buildDefineResponse(text);
    expect(result.content.length).toBeLessThanOrEqual(2_000);
    expect(Buffer.from(result.content).toString('utf8')).toBe(result.content);
    expect(result.content).toContain('definition.txt');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('definition.txt');
    expect((result.files[0].attachment as Buffer).toString('utf8')).toBe(text);
  },
);
