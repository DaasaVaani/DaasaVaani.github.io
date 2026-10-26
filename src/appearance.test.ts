import { expect, test } from "vitest";

function luminance(color: string) {
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(first: string, second: string) {
  const left = luminance(first), right = luminance(second);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}
for (const [name, palette] of Object.entries(__WEB_CONFIG__.themes)) {
  test(`${name} palette meets normal-text and interactive-boundary contrast thresholds`, () => {
    for (const background of [palette.background, palette.surface, palette.highlight]) {
      expect(contrast(palette.text, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.muted, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.accent, background)).toBeGreaterThanOrEqual(4.5);
    }
    for (const background of [palette.background, palette.surface]) {
      expect(contrast(palette.border, background)).toBeGreaterThanOrEqual(3);
    }
  });
}
