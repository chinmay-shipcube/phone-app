// Shapes shared by the API and the web app.

export type Role = 'employee' | 'admin';
export type PaymentMode = 'cash' | 'upi' | 'card' | 'other';
export const PAYMENT_MODES: PaymentMode[] = ['cash', 'upi', 'card', 'other'];
export type PrintStatus = 'pending' | 'printed' | 'failed' | 'unknown';
export type BillStatus = 'completed' | 'voided';
export type Paper = '58mm' | '80mm';

export interface Me {
  id: number;
  name: string;
  role: Role;
  hasPin: boolean;
}

/** One button on the login screen. */
export interface LoginName {
  id: number;
  name: string;
  hasPin: boolean;
}

export interface Item {
  id: number;
  name: string;
  defaultPricePaise: number | null;
  hsn: string;
  gstBp: number;
  active: boolean;
}

export interface PublicSettings {
  shopName: string;
  allowCustomItems: boolean;
  defaultGstBp: number;
  defaultHsn: string;
}

export interface Settings extends PublicSettings {
  addressLine1: string;
  addressLine2: string;
  phone: string;
  gstin: string;
  invoicePrefix: string;
  footer: string;
  printerName: string;
  paper: Paper;
  employeeIdleMinutes: number;
  adminIdleMinutes: number;
}

export interface BillLineInput {
  itemId: number | null; // null = unlisted item typed by the employee
  name: string;
  qty: number;
  ratePaise: number;
}

export interface CreateBillInput {
  clientRequestId: string;
  lines: BillLineInput[];
  discountPaise: number;
  paymentMode: PaymentMode;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
}

export interface PrintResult {
  jobId: number;
  status: PrintStatus;
  error?: string;
}

export interface BillLine {
  lineNo: number;
  itemId: number | null;
  name: string;
  custom: boolean;
  hsn: string;
  gstBp: number;
  qty: number;
  ratePaise: number;
  grossPaise: number;
  discountPaise: number;
  netPaise: number;
  taxablePaise: number;
  taxPaise: number;
}

export interface BillSummary {
  id: number;
  invoiceNo: string;
  employeeId: number;
  employeeName: string;
  createdAt: string;
  status: BillStatus;
  paymentMode: PaymentMode;
  totalPaise: number;
  itemCount: number;
  customerName: string;
  lastPrintStatus: PrintStatus | null;
}

export interface BillDetail extends BillSummary {
  customerPhone: string;
  customerGstin: string;
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  voidReason: string;
  voidedAt: string | null;
  voidedByName: string;
  lines: BillLine[];
  prints: { id: number; kind: 'original' | 'copy'; status: PrintStatus; error: string; requestedByName: string; createdAt: string }[];
}

export interface CreateBillResponse {
  bill: BillDetail;
  print: PrintResult | null; // null when a retried request found an earlier print that may have reached paper
  duplicate: boolean; // true when the same clientRequestId was already saved
}

export interface EmployeeReportRow {
  employeeId: number;
  name: string;
  active: boolean;
  bills: number;
  salesPaise: number;
  itemsSold: number;
  discountPaise: number;
  voids: number;
  voidedPaise: number;
  avgBillPaise: number;
  daysActive: number;
  firstBillAt: string | null;
  lastBillAt: string | null;
}

export interface ReportSummary {
  from: string;
  to: string;
  bills: number;
  salesPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  discountPaise: number;
  byPaymentMode: { mode: PaymentMode; bills: number; salesPaise: number }[];
  employees: EmployeeReportRow[];
}

export interface ItemSalesRow {
  name: string;
  itemId: number | null;
  custom: boolean;
  qty: number;
  salesPaise: number;
}

export interface UserRow {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  hasPin: boolean;
  createdAt: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
