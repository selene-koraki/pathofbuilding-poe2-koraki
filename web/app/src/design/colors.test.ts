import { describe, it, expect } from 'vitest';
import { parseColor, PALETTE } from './colors';

describe('parseColor', () => {
  it('returns a single uncoloured span for plain text', () => {
    expect(parseColor('Life')).toEqual([{ text: 'Life', color: null }]);
  });

  it('maps ^N palette codes', () => {
    expect(parseColor('^2OK')).toEqual([{ text: 'OK', color: PALETTE['2'] }]);
  });

  it('maps ^xRRGGBB literal colours', () => {
    expect(parseColor('^xFF8800warm')).toEqual([{ text: 'warm', color: '#FF8800' }]);
  });

  it('handles multiple colour segments', () => {
    expect(parseColor('^7white ^1red')).toEqual([
      { text: 'white ', color: PALETTE['7'] },
      { text: 'red', color: PALETTE['1'] },
    ]);
  });

  it('is null/empty safe', () => {
    expect(parseColor(null)).toEqual([]);
    expect(parseColor(undefined)).toEqual([]);
    expect(parseColor('')).toEqual([]);
  });
});
