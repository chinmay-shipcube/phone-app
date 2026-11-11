// Invoice numbers: PREFIX/YY-YY/NNNNN, unique within an Indian financial year (April to March).
// GST rules cap the number at 16 characters, so the prefix is limited to 4 characters.

export const SHOP_TIME_ZONE = 'Asia/Kolkata';

/** Calendar parts of a moment in shop time. */
export function shopDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** "26-27" for any date from 1 April 2026 to 31 March 2027 (shop time). */
export function financialYear(d: Date): string {
  const { year, month } = shopDateParts(d);
  const start = month >= 4 ? year : year - 1;
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return `${yy(start)}-${yy(start + 1)}`;
}

export function formatInvoiceNo(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(5, '0')}`;
}

export function cleanPrefix(raw: string): string {
  return (
    raw
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4) || 'INV'
  );
}

/** "2026-11-11" in shop time. */
export function shopDateString(d: Date): string {
  const { year, month, day } = shopDateParts(d);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
