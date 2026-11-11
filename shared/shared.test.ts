import { describe, expect, it } from 'vitest';
import { computeBill } from './gst';
import { financialYear, formatInvoiceNo, cleanPrefix } from './invoice';
import { formatINR, paiseToRupees, rupeesToPaise } from './money';
import { matchItems } from './search';
import { gstinError } from './gstin';

describe('money', () => {
  it('parses rupees into paise', () => {
    expect(rupeesToPaise('149')).toBe(14900);
    expect(rupeesToPaise('149.5')).toBe(14950);
    expect(rupeesToPaise('₹ 1,299.05')).toBe(129905);
    expect(rupeesToPaise('12.345')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
  });
  it('formats paise', () => {
    expect(paiseToRupees(14950)).toBe('149.50');
    expect(formatINR(12345678)).toBe('₹1,23,456.78');
    expect(formatINR(50000, { short: true })).toBe('₹500');
  });
});

describe('computeBill', () => {
  it('backs GST out of an inclusive price', () => {
    const t = computeBill([{ qty: 1, ratePaise: 11800, gstBp: 1800 }]);
    expect(t.totalPaise).toBe(11800);
    expect(t.taxablePaise).toBe(10000);
    expect(t.cgstPaise).toBe(900);
    expect(t.sgstPaise).toBe(900);
  });

  it('splits a discount so line shares add up exactly', () => {
    const t = computeBill(
      [
        { qty: 1, ratePaise: 10000, gstBp: 1800 },
        { qty: 1, ratePaise: 10000, gstBp: 1800 },
        { qty: 1, ratePaise: 10000, gstBp: 1200 },
      ],
      100,
    );
    expect(t.lines.reduce((a, l) => a + l.discountPaise, 0)).toBe(100);
    expect(t.totalPaise).toBe(29900);
    expect(t.taxablePaise + t.taxPaise).toBe(t.totalPaise);
    expect(t.cgstPaise + t.sgstPaise).toBe(t.taxPaise);
    expect(t.slabs.map((s) => s.gstBp)).toEqual([1200, 1800]);
  });

  it('rejects bad input', () => {
    expect(() => computeBill([])).toThrow();
    expect(() => computeBill([{ qty: 0, ratePaise: 100, gstBp: 1800 }])).toThrow();
    expect(() => computeBill([{ qty: 1, ratePaise: 100, gstBp: 1800 }], 200)).toThrow(/more than the bill/);
  });
});

describe('invoice numbers', () => {
  it('uses the Indian financial year in shop time', () => {
    expect(financialYear(new Date('2026-03-31T18:00:00Z'))).toBe('25-26'); // 31 Mar 23:30 IST
    expect(financialYear(new Date('2026-03-31T18:31:00Z'))).toBe('26-27'); // 1 Apr 00:01 IST
    expect(formatInvoiceNo('CD', '26-27', 12)).toBe('CD/26-27/00012');
    expect(formatInvoiceNo(cleanPrefix('cell decor'), '26-27', 99999).length).toBeLessThanOrEqual(16);
  });
});

describe('item search', () => {
  const items = [{ name: 'iPhone 16 Cover' }, { name: 'iPhone 16 Pro Glass' }, { name: 'Samsung S24 Cover' }, { name: 'Boat Earphones' }];
  it('matches every word in any order', () => {
    expect(matchItems('iphone', items).map((i) => i.name)).toEqual(['iPhone 16 Cover', 'iPhone 16 Pro Glass']);
    expect(matchItems('cover 16', items).map((i) => i.name)).toEqual(['iPhone 16 Cover']);
    expect(matchItems('  ', items)).toEqual([]);
  });
});

describe('gstin', () => {
  it('checks the check digit', () => {
    expect(gstinError('')).toBe('');
    expect(gstinError('27AAPFU0939F1ZV')).toBe('');
    expect(gstinError('27AAPFU0939F1ZX')).toMatch(/check digit/);
  });
});
