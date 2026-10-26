import data from "../shared/generated/unicode/unicode16.json";

export const unicodeNameProfile = "unicode16-default-full-nfc-v1";
if (data.formatVersion !== 1 || data.profile !== unicodeNameProfile || data.unicodeVersion !== "16.0.0") {
  throw new Error("Unsupported personal-name Unicode resource");
}
const scalar = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) &&
  value >= 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff);
function sequences(rows: readonly unknown[]): Map<number, number[]> {
  const result = new Map<number, number[]>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 2 || !scalar(row[0]) || !Array.isArray(row[1]) ||
        !row[1].length || !row[1].every(scalar) || result.has(row[0])) throw new Error("Invalid Unicode sequence table");
    result.set(row[0], row[1]);
  }
  return result;
}
const decomposition = sequences(data.canonicalDecompositions), folding = sequences(data.caseFolding);
const classes = new Map<number, number>(), compositions = new Map<number, Map<number, number>>();
for (const row of data.combiningClasses) {
  const [cp, value] = row;
  if (row.length !== 2 || !scalar(cp) || value === undefined || !Number.isInteger(value) ||
      value < 1 || value > 255 || classes.has(cp)) throw new Error("Invalid Unicode combining-class table");
  classes.set(cp, value);
}
for (const row of data.compositions) {
  const [first, second, combined] = row;
  if (row.length !== 3 || !scalar(first) || !scalar(second) || !scalar(combined)) throw new Error("Invalid Unicode composition table");
  const next = compositions.get(first) ?? new Map<number, number>();
  if (next.has(second)) throw new Error("Duplicate Unicode composition");
  next.set(second, combined); compositions.set(first, next);
}
const combiningClass = (cp: number) => classes.get(cp) ?? 0;
function scalars(text: string): number[] {
  const result: number[] = [];
  for (const character of text) {
    const cp = character.codePointAt(0);
    if (cp === undefined || !scalar(cp)) throw new TypeError("Expected a Unicode scalar string");
    result.push(cp);
  }
  return result;
}
const string = (values: readonly number[]) => values.map(cp => String.fromCodePoint(cp)).join("");
function decompose(cp: number, output: number[]): void {
  const syllable = cp - 0xac00;
  if (syllable >= 0 && syllable < 11172) {
    output.push(0x1100 + Math.floor(syllable / 588), 0x1161 + Math.floor((syllable % 588) / 28));
    if (syllable % 28) output.push(0x11a7 + syllable % 28);
    return;
  }
  const children = decomposition.get(cp);
  if (children) for (const child of children) decompose(child, output);
  else output.push(cp);
}
function ordered(text: string): number[] {
  const output: number[] = [];
  for (const cp of scalars(text)) decompose(cp, output);
  for (let i = 1; i < output.length; i++) {
    const cp = output[i];
    if (cp === undefined) throw new Error("Invalid Unicode decomposition");
    const currentClass = combiningClass(cp);
    if (currentClass === 0) continue;
    let j = i;
    while (j > 0) {
      const previous = output[j - 1];
      if (previous === undefined) throw new Error("Invalid Unicode ordering");
      if (combiningClass(previous) <= currentClass) break;
      output[j] = previous; j--;
    }
    output[j] = cp;
  }
  return output;
}
function composite(first: number, second: number): number | undefined {
  const l = first - 0x1100, v = second - 0x1161;
  if (l >= 0 && l < 19 && v >= 0 && v < 21) return 0xac00 + (l * 21 + v) * 28;
  const syllable = first - 0xac00, t = second - 0x11a7;
  if (syllable >= 0 && syllable < 11172 && syllable % 28 === 0 && t > 0 && t < 28) return first + t;
  return compositions.get(first)?.get(second);
}
export const unicodeNfd = (text: string) => string(ordered(text));
export function unicodeNfc(text: string): string {
  const output: number[] = [];
  let starterIndex = -1, previousClass = 0;
  for (const cp of ordered(text)) {
    const currentClass = combiningClass(cp), starter = output[starterIndex];
    const combined = starter === undefined ? undefined : composite(starter, cp);
    if (combined !== undefined && (previousClass === 0 || previousClass < currentClass)) output[starterIndex] = combined;
    else {
      if (currentClass === 0) starterIndex = output.length;
      output.push(cp); previousClass = currentClass;
    }
  }
  return string(output);
}
export const unicodeFullCaseFold = (text: string) => string(scalars(text).flatMap(cp => folding.get(cp) ?? [cp]));
export const unicodeNameKey = (text: string) => unicodeNfc(unicodeFullCaseFold(unicodeNfc(text)));
