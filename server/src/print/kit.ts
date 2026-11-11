import { createRequire } from 'node:module';
import { config } from '../config.js';

// The printing kit from the Shree Sweets POS (server/vendor/universal-printer.cjs). It is a
// plain CommonJS file with no dependencies, so it is loaded as-is. Keep its rules: print through
// the Windows spooler, never retry a job that timed out, never open a print dialog.

export interface EscPosBuilder {
  cols: number;
  align(a: 'left' | 'center' | 'right'): EscPosBuilder;
  bold(on?: boolean): EscPosBuilder;
  size(w?: number, h?: number): EscPosBuilder;
  normal(): EscPosBuilder;
  line(s?: string): EscPosBuilder;
  feed(lines?: number): EscPosBuilder;
  divider(ch?: string): EscPosBuilder;
  pair(left: string, right: string, opts?: { bold?: boolean }): EscPosBuilder;
  row(cells: { text: string; width?: number; align?: 'left' | 'right' | 'center' }[], opts?: { bold?: boolean }): EscPosBuilder;
  item(name: string, qty?: string, amount?: string, opts?: { bold?: boolean; wrap?: boolean }): EscPosBuilder;
  wrapped(text: string): EscPosBuilder;
  cut(opts?: { feed?: number; partial?: boolean }): EscPosBuilder;
  build(): Uint8Array;
}

export interface PrintResponse {
  success: boolean;
  printerUsed?: string;
  elapsedMs: number;
  error?: string;
  timedOut?: boolean;
  noRetry?: boolean;
  virtualPrinter?: boolean;
  skipped?: 'duplicate';
}

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  port?: string;
  offline?: boolean;
  isVirtual: boolean;
  isThermal: boolean;
}

interface Kit {
  EscPos: new (opts?: { paper?: '58mm' | '80mm' }) => EscPosBuilder;
  configure(o: Record<string, unknown>): unknown;
  print(data: Uint8Array, opts?: { printer?: string; jobId?: string; force?: boolean }): Promise<PrintResponse>;
  listPrinters(opts?: { fresh?: boolean }): Promise<PrinterInfo[]>;
  testSlip(opts?: { paper?: string }): Uint8Array;
  shutdown(): void;
}

const require = createRequire(import.meta.url);
export const kit = require(config.printerKit) as Kit;

kit.configure({ logFile: config.printLog || '' });

/** The target the kit should use: the .env override first, then the printer chosen in Settings. */
export function printerTarget(settingsPrinter: string): string {
  return config.printerOverride || settingsPrinter || '';
}
