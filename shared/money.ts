// Money is always stored and calculated as integer paise. Only the screens and the slip
// turn it into rupees.

/** "149", "149.5", "₹ 1,299.00" -> paise. Returns null when it is not a valid amount. */
export function rupeesToPaise(input: string | number): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 100);
  }
  const clean = String(input)
    .replace(/[₹,\s]/g, '')
    .replace(/^rs\.?/i, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

/** 14950 -> "149.50" */
export function paiseToRupees(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paise));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 129950 -> "₹1,299.50" (Indian digit grouping). Whole rupees drop the ".00" when short is set. */
export function formatINR(paise: number, opts: { short?: boolean; symbol?: string } = {}): string {
  const symbol = opts.symbol ?? '₹';
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = String(rupees);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  const decimals = opts.short && p === 0 ? '' : `.${String(p).padStart(2, '0')}`;
  return `${sign}${symbol}${grouped}${decimals}`;
}

/** GST rate in percent (18, 12, 5, 2.5) -> basis points (1800, 1200, 500, 250). */
export function rateToBp(ratePercent: number): number {
  return Math.round(ratePercent * 100);
}

export function bpToRate(bp: number): number {
  return bp / 100;
}
