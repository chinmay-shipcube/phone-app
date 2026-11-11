import type { BillDetail, Settings } from '../../../shared/types.js';
import { paiseToRupees } from '../../../shared/money.js';
import { numberToWords } from '../../../shared/words.js';
import { SHOP_TIME_ZONE } from '../../../shared/invoice.js';
import { kit } from './kit.js';

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: SHOP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));

const pct = (bp: number) => `${bp % 100 === 0 ? bp / 100 : (bp / 100).toFixed(1)}%`;

/**
 * The GST slip as ESC/POS bytes. ASCII only: the kit turns the rupee sign into "Rs.", and
 * item names must be in English. A copy carries a DUPLICATE banner.
 */
export function buildSlip(bill: BillDetail, s: Settings, kind: 'original' | 'copy'): Uint8Array {
  const p = new kit.EscPos({ paper: s.paper });
  const taxInvoice = !!s.gstin;

  p.align('center').bold().size(2, 2).line(s.shopName.toUpperCase()).normal();
  if (s.addressLine1) p.wrapped(s.addressLine1);
  if (s.addressLine2) p.wrapped(s.addressLine2);
  if (s.phone) p.line(`Ph: ${s.phone}`);
  if (s.gstin) p.line(`GSTIN: ${s.gstin}`);
  p.feed(1)
    .bold()
    .line(taxInvoice ? 'TAX INVOICE' : 'BILL')
    .bold(false);
  if (kind === 'copy') p.bold().line('** DUPLICATE COPY **').bold(false);

  p.align('left').divider();
  p.pair('Bill No:', bill.invoiceNo, { bold: true });
  p.pair('Date:', fmtDate(bill.createdAt));
  p.pair('Billed by:', bill.employeeName);
  if (bill.customerName) p.pair('Customer:', bill.customerName);
  if (bill.customerPhone) p.pair('Phone:', bill.customerPhone);
  if (bill.customerGstin) p.pair('Cust. GSTIN:', bill.customerGstin);

  p.divider().item('Item', 'Qty', 'Amount', { bold: true }).divider();
  for (const l of bill.lines) {
    p.item(l.name, String(l.qty), paiseToRupees(l.grossPaise));
    const detail = [`@${paiseToRupees(l.ratePaise)}`, l.hsn ? `HSN ${l.hsn}` : '', `GST ${pct(l.gstBp)}`].filter(Boolean).join('  ');
    p.line(`  ${detail}`);
  }
  p.divider();
  if (bill.discountPaise > 0) {
    p.pair('Subtotal', paiseToRupees(bill.grossPaise));
    p.pair('Discount', `-${paiseToRupees(bill.discountPaise)}`);
  }
  p.bold()
    .size(1, 2)
    .pair('TOTAL', `Rs.${paiseToRupees(bill.totalPaise)}`)
    .normal();
  p.pair('Paid by', bill.paymentMode.toUpperCase());

  // GST summary per rate, as a GST invoice needs.
  // CGST is split per line exactly as computeBill does, so the slip matches the bill totals.
  const slabs = new Map<number, { taxable: number; cgst: number; sgst: number }>();
  for (const l of bill.lines) {
    const x = slabs.get(l.gstBp) ?? { taxable: 0, cgst: 0, sgst: 0 };
    const c = Math.round(l.taxPaise / 2);
    x.taxable += l.taxablePaise;
    x.cgst += c;
    x.sgst += l.taxPaise - c;
    slabs.set(l.gstBp, x);
  }
  p.divider().row(
    [
      { text: 'GST', width: 6 },
      { text: 'Taxable', width: 0.32, align: 'right' },
      { text: 'CGST', width: 0.24, align: 'right' },
      { text: 'SGST', align: 'right' },
    ],
    { bold: true },
  );
  for (const [bp, x] of [...slabs.entries()].sort((a, b) => a[0] - b[0])) {
    p.row([
      { text: pct(bp), width: 6 },
      { text: paiseToRupees(x.taxable), width: 0.32, align: 'right' },
      { text: paiseToRupees(x.cgst), width: 0.24, align: 'right' },
      { text: paiseToRupees(x.sgst), align: 'right' },
    ]);
  }
  p.divider().wrapped(numberToWords(bill.totalPaise / 100));
  if (s.footer) p.feed(1).align('center').wrapped(s.footer);
  p.cut();
  return p.build();
}
