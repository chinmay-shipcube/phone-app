// GST maths for a counter sale with GST-inclusive prices. Used by the phone for the live
// preview and by the server for the saved bill, so both always agree. Everything is paise.

export interface LineInput {
  qty: number; // whole units, > 0
  ratePaise: number; // price per unit, GST included
  gstBp: number; // GST rate in basis points (1800 = 18%)
}

export interface LineResult extends LineInput {
  grossPaise: number; // qty x rate
  discountPaise: number; // share of the bill discount
  netPaise: number; // gross - discount, GST included
  taxablePaise: number; // value before GST
  taxPaise: number; // total GST on the line
  cgstPaise: number;
  sgstPaise: number;
}

export interface GstSlab {
  gstBp: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
}

export interface BillTotals {
  lines: LineResult[];
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  taxPaise: number;
  totalPaise: number;
  slabs: GstSlab[]; // one entry per GST rate, for the summary on the slip
}

export class BillMathError extends Error {}

/**
 * Splits a bill discount across lines in proportion to their value (largest remainder, so the
 * shares add up exactly), then backs GST out of each discounted line:
 *   taxable = net x 100 / (100 + rate), tax = net - taxable, CGST = SGST = tax / 2.
 * Intra-state counter sale. Confirm with the shop's CA before changing the rule.
 */
export function computeBill(inputs: LineInput[], discountPaise = 0): BillTotals {
  if (!inputs.length) throw new BillMathError('Add at least one item.');
  for (const l of inputs) {
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw new BillMathError('Quantity must be a whole number above 0.');
    if (!Number.isInteger(l.ratePaise) || l.ratePaise < 0) throw new BillMathError('Rate must be 0 or more.');
    if (!Number.isInteger(l.gstBp) || l.gstBp < 0 || l.gstBp > 10000) throw new BillMathError('GST rate is not valid.');
  }
  const gross = inputs.map((l) => l.qty * l.ratePaise);
  const grossPaise = gross.reduce((a, b) => a + b, 0);
  const discount = Math.round(discountPaise || 0);
  if (discount < 0) throw new BillMathError('Discount cannot be negative.');
  if (discount > grossPaise) throw new BillMathError('Discount is more than the bill.');

  // Largest-remainder split of the discount.
  const shares = gross.map((g) => (grossPaise ? (discount * g) / grossPaise : 0));
  const floors = shares.map(Math.floor);
  let left = discount - floors.reduce((a, b) => a + b, 0);
  const order = shares.map((s, i) => ({ i, r: s - Math.floor(s) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }

  const lines: LineResult[] = inputs.map((l, i) => {
    const netPaise = gross[i] - floors[i];
    const taxablePaise = Math.round((netPaise * 10000) / (10000 + l.gstBp));
    const taxPaise = netPaise - taxablePaise;
    const cgstPaise = Math.round(taxPaise / 2);
    return {
      ...l,
      grossPaise: gross[i],
      discountPaise: floors[i],
      netPaise,
      taxablePaise,
      taxPaise,
      cgstPaise,
      sgstPaise: taxPaise - cgstPaise,
    };
  });

  const slabMap = new Map<number, GstSlab>();
  for (const l of lines) {
    const s = slabMap.get(l.gstBp) ?? { gstBp: l.gstBp, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0 };
    s.taxablePaise += l.taxablePaise;
    s.cgstPaise += l.cgstPaise;
    s.sgstPaise += l.sgstPaise;
    slabMap.set(l.gstBp, s);
  }

  const sum = (k: keyof LineResult) => lines.reduce((a, l) => a + (l[k] as number), 0);
  return {
    lines,
    grossPaise,
    discountPaise: discount,
    taxablePaise: sum('taxablePaise'),
    cgstPaise: sum('cgstPaise'),
    sgstPaise: sum('sgstPaise'),
    taxPaise: sum('taxPaise'),
    totalPaise: sum('netPaise'),
    slabs: [...slabMap.values()].sort((a, b) => a.gstBp - b.gstBp),
  };
}
