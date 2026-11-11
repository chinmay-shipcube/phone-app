// Indian GSTIN check, taken from the sweet shop OMS (orderValidation.ts).

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Upper-case, no spaces: "23 advfs 4206n1zk" -> "23ADVFS4206N1ZK". */
export const normalizeGstin = (v: string) => (v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Returns an error message, or '' when valid or empty (GSTIN is optional). */
export function gstinError(raw: string): string {
  const g = normalizeGstin(raw);
  if (!g) return '';
  if (g.length !== 15) return `GSTIN must be 15 characters (this has ${g.length}).`;
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g)) return 'This does not look like a GSTIN (e.g. 23ABCDE1234F1Z5).';
  const state = Number(g.slice(0, 2));
  if (state < 1 || (state > 38 && state !== 97 && state !== 99)) return 'GSTIN state code (first 2 digits) is not valid.';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  const check = GSTIN_CHARS[(36 - (sum % 36)) % 36];
  if (g[14] !== check) return 'GSTIN check digit does not match. Please re-check the number.';
  return '';
}
