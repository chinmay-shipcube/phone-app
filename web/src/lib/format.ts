import { SHOP_TIME_ZONE, shopDateString } from '../../../shared/invoice';
export { formatINR, paiseToRupees, rupeesToPaise } from '../../../shared/money';

export const today = () => shopDateString(new Date());

export function daysAgo(n: number): string {
  return shopDateString(new Date(Date.now() - n * 86400000));
}

export function monthStart(): string {
  return `${today().slice(0, 8)}01`;
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: SHOP_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(
    new Date(iso),
  );
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: SHOP_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    Date.UTC(y, m - 1, d),
  );
}

export const pct = (bp: number) => `${bp % 100 === 0 ? bp / 100 : (bp / 100).toFixed(1)}%`;

export const modeLabel: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other' };

/** crypto.randomUUID needs a secure context, which plain http on the LAN is not. */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
