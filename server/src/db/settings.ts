import type { PublicSettings, Settings } from '../../../shared/types.js';
import { pool, type Db } from './pool.js';

interface Row {
  shop_name: string;
  address_line1: string;
  address_line2: string;
  phone: string;
  gstin: string;
  invoice_prefix: string;
  default_gst_bp: number;
  default_hsn: string;
  footer: string;
  printer_name: string;
  paper: '58mm' | '80mm';
  allow_custom_items: boolean;
  employee_idle_minutes: number;
  admin_idle_minutes: number;
}

const toSettings = (r: Row): Settings => ({
  shopName: r.shop_name,
  addressLine1: r.address_line1,
  addressLine2: r.address_line2,
  phone: r.phone,
  gstin: r.gstin,
  invoicePrefix: r.invoice_prefix,
  defaultGstBp: r.default_gst_bp,
  defaultHsn: r.default_hsn,
  footer: r.footer,
  printerName: r.printer_name,
  paper: r.paper,
  allowCustomItems: r.allow_custom_items,
  employeeIdleMinutes: r.employee_idle_minutes,
  adminIdleMinutes: r.admin_idle_minutes,
});

// Settings are read on every request (idle timeouts), so keep a copy in memory.
let cache: Settings | null = null;

export async function getSettings(db: Db = pool): Promise<Settings> {
  if (cache && db === pool) return cache;
  const r = await db.query('SELECT * FROM shop_settings WHERE id = 1');
  const s = toSettings(r.rows[0] as Row);
  if (db === pool) cache = s;
  return s;
}

export function publicSettings(s: Settings): PublicSettings {
  return {
    shopName: s.shopName,
    allowCustomItems: s.allowCustomItems,
    defaultGstBp: s.defaultGstBp,
    defaultHsn: s.defaultHsn,
  };
}

export async function saveSettings(s: Settings, db: Db = pool): Promise<Settings> {
  await db.query(
    `UPDATE shop_settings SET shop_name=$1, address_line1=$2, address_line2=$3, phone=$4, gstin=$5,
       invoice_prefix=$6, default_gst_bp=$7, default_hsn=$8, footer=$9, printer_name=$10, paper=$11,
       allow_custom_items=$12, employee_idle_minutes=$13, admin_idle_minutes=$14, updated_at=now()
     WHERE id = 1`,
    [
      s.shopName,
      s.addressLine1,
      s.addressLine2,
      s.phone,
      s.gstin,
      s.invoicePrefix,
      s.defaultGstBp,
      s.defaultHsn,
      s.footer,
      s.printerName,
      s.paper,
      s.allowCustomItems,
      s.employeeIdleMinutes,
      s.adminIdleMinutes,
    ],
  );
  cache = null;
  return getSettings();
}

export function clearSettingsCache() {
  cache = null;
}
