// PoB ^-colour escape handling. The engine emits strings with ^0..^9 palette
// codes and ^xRRGGBB literal colours; we map them to the in-game palette and
// render spans. Engine formatting stays authoritative — we never recolour.

// PoB's ^0-^9 escape palette (close to the desktop renderer's values).
export const PALETTE: Record<string, string> = {
  '0': '#000000',
  '1': '#e63c3c',
  '2': '#46c246',
  '3': '#4757e6',
  '4': '#e6e600',
  '5': '#b44bff',
  '6': '#3cd2d2',
  '7': '#e8e2d4',
  '8': '#9a9384',
  '9': '#5f5848',
};

export interface ColorSpan {
  text: string;
  color: string | null;
}

/** Parse an engine string into colour spans. Pure + tested (no DOM). */
export function parseColor(text: string | null | undefined): ColorSpan[] {
  if (text == null) return [];
  const spans: ColorSpan[] = [];
  let color: string | null = null;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '^') {
      const n = text[i + 1];
      if (n === 'x' || n === 'X') {
        color = '#' + text.substr(i + 2, 6);
        i += 8;
      } else if (n >= '0' && n <= '9') {
        color = PALETTE[n];
        i += 2;
      } else {
        i += 1;
      }
    } else {
      let next = text.indexOf('^', i);
      if (next < 0) next = text.length;
      spans.push({ text: text.slice(i, next), color });
      i = next;
    }
  }
  return spans;
}
