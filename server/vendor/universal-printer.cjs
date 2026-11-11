/**
 * ============================================================================================
 *  UNIVERSAL RECEIPT / THERMAL PRINTER KIT            (one file, zero npm dependencies)
 *  Extracted from the Shree Sweets POS printing engine and made app-independent.
 * ============================================================================================
 *
 *  WHAT IT DOES
 *  ------------
 *  1. Builds ESC/POS receipt bytes (text, bold, big text, columns, barcodes, QR, paper cut,
 *     cash-drawer kick). Works in Node, Electron main, and browser renderers.
 *  2. Sends those bytes to a printer WITHOUT locking it, so every app on the PC can print:
 *       - Windows: RAW job through the Windows print spooler (winspool.drv), using a tiny C# helper
 *         that this file compiles on first use with csc.exe, which ships with Windows. It runs as
 *         a persistent daemon, so a job takes about 1-3 ms.
 *       - Network printers: TCP socket to IP:9100.
 *       - Linux / macOS: CUPS `lp -o raw`.
 *       - Direct device path: COM port or /dev/usb/lp0, for the rare case when there is no driver.
 *  3. Picks the printer automatically: it prefers the default thermal printer and never uses
 *     "Microsoft Print to PDF", XPS, OneNote or Fax.
 *  4. Runs one job at a time (a queue), so receipts never interleave.
 *  5. Protects against double prints. A stuck printer times out (12 s) and is not retried. A job
 *     that may already have reached paper is not retried. A jobId is printed only once.
 *  6. Optional: HTML printing in Electron (silent webContents.print), needed for Hindi or other
 *     non-Latin text, which ESC/POS text mode cannot print.
 *  7. Optional: a printer health check (offline, paper out, cover open) on Windows.
 *
 *  WHY "THE OTHER APP CAN'T PRINT" HAPPENS (and how this kit avoids it)
 *  -------------------------------------------------------------------
 *  Some apps open the printer's USB device directly (WebUSB claimInterface, libusb, node-usb,
 *  escpos-usb, or holding a COM port open). That takes EXCLUSIVE ownership of the device, and
 *  every other app then fails. The fix is to never touch the USB device. Install the printer in
 *  Windows instead: use the vendor driver, or if there isn't one, "Generic / Text Only" on the
 *  USB00x port. Then send RAW bytes to the Windows print spooler, which is exactly what this kit
 *  does. The spooler queues jobs from any number of apps, and the ESC/POS bytes reach the
 *  printer unchanged, so the cut, bold and QR commands still work.
 *
 * --------------------------------------------------------------------------------------------
 *  AI / DEVELOPER INTEGRATION GUIDE  (read this first when adding the kit to a new app)
 * --------------------------------------------------------------------------------------------
 *  A) Plain Node / Electron MAIN process:
 *
 *       const printer = require('./universal-printer.cjs');
 *       printer.configure({ defaultPrinter: '', paper: '80mm', logFile: 'C:/logs/print.log' });
 *
 *       const r = new printer.EscPos({ paper: '80mm' })
 *         .align('center').size(2, 2).bold().line('MY SHOP').size(1, 1).bold(false)
 *         .line('Tax Invoice').align('left').divider()
 *         .item('Item', 'Qty', 'Amount', { bold: true }).divider()
 *         .item('Kaju Katli 500g', '1', '450.00')
 *         .item('Samosa', '4', '80.00')
 *         .divider().pair('TOTAL', 'Rs.530.00', { bold: true })
 *         .feed(1).align('center').qr('upi://pay?pa=shop@upi&am=530').line('Thank you!')
 *         .cut();
 *
 *       const res = await printer.print(r.build(), { printer: 'POS-80', jobId: 'INV-1001' });
 *       // res = { success, printerUsed, elapsedMs, error?, timedOut?, noRetry?, virtualPrinter?, skipped? }
 *
 *       app.on('will-quit', () => printer.shutdown());   // stops the helper daemon
 *
 *  B) Electron app (renderer builds bytes, main prints). In the main process:
 *
 *       const printer = require('./universal-printer.cjs');
 *       printer.registerElectronIpc(require('electron').ipcMain);   // registers 'uprint:*' channels
 *
 *     preload.js:
 *       contextBridge.exposeInMainWorld('uprint', {
 *         printRaw:  (bytes, printer, opts) => ipcRenderer.invoke('uprint:print-raw', bytes, printer, opts),
 *         printHtml: (html, opts)           => ipcRenderer.invoke('uprint:print-html', html, opts),
 *         list:      ()                     => ipcRenderer.invoke('uprint:list'),
 *         health:    (printer)              => ipcRenderer.invoke('uprint:health', printer),
 *       });
 *
 *     In the renderer, copy the EscPos class (it has no Node dependencies) or import this file
 *     through your bundler. Call build(), which returns a Uint8Array, then
 *     window.uprint.printRaw(bytes, 'POS-80', { jobId }).
 *
 *  C) Any other language or app on the same PC (Python, .NET, PHP, Java...):
 *     Run `node universal-printer.cjs serve 9333` on that PC. It starts a local HTTP bridge on
 *     127.0.0.1:
 *         POST http://127.0.0.1:9333/print?printer=POS-80&jobId=INV-1   body = raw ESC/POS bytes
 *         GET  http://127.0.0.1:9333/printers
 *
 *  PRINTER TARGET STRING (opts.printer / configure({ defaultPrinter }))
 *     ''                         auto: the default thermal printer, never a PDF/XPS printer
 *     'POS-80'                   Windows/CUPS printer name (exact match first, then partial match)
 *     '192.168.1.50' / ':9100'   network printer over TCP (port 9100 by default)
 *     'tcp://host:9100'          network printer by hostname
 *     'file:COM3' / 'file:/dev/usb/lp0'   write directly to a device (only when there is no driver)
 *
 *  RULES THAT MUST BE KEPT WHEN EDITING (each one fixed a real bug in production)
 *     - Never open the printer's USB device directly. Always go through the spooler.
 *     - Never send ESC/POS to a virtual printer (PDF/XPS/OneNote/Fax): it makes a blank PDF or
 *       pops up a "Save As" dialog in the middle of billing.
 *     - Never retry a job that timed out or that may have reached paper. That is how the same
 *       token got printed twice. Show "check the slip, then reprint" instead.
 *     - Never fall back to the Windows print dialog. It pops up during billing.
 *     - Join all slips of one order into ONE RAW job. That is fastest and prevents another
 *       app's job from landing between your slips.
 *     - ESC/POS text is ASCII. ₹ is printed as "Rs.". For Hindi or other scripts, use printHtml().
 *     - Paper width: 58mm paper = 32 characters, 80mm paper = 42 characters (most Epson/TVS
 *       printers can do 48). With size(2,x), only half as many characters fit on a line.
 *
 *  CLI (for testing on a shop PC):
 *     node universal-printer.cjs list                 list printers (marks default/thermal/virtual)
 *     node universal-printer.cjs test [printer]       print a test slip with a cut
 *     node universal-printer.cjs health [printer]     offline / paper out / cover open (Windows)
 *     node universal-printer.cjs drawer [printer]     open the cash drawer
 *     node universal-printer.cjs build-helper out.exe pre-build the Windows helper so it can be
 *                                                     shipped in your installer (set helperExePath)
 *     node universal-printer.cjs serve [port]         local HTTP print bridge for non-Node apps
 * ============================================================================================
 */
'use strict';

// Node modules are loaded lazily, so the EscPos builder can also be bundled into a browser renderer.
const nodeRequire = (m) => require(m);
const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
const isWin = isNode && process.platform === 'win32';

// ============================================================================================
// 0. CONFIG + LOGGING
// ============================================================================================
const cfg = {
  defaultPrinter: '',          // used when print() gets no `printer`
  paper: '80mm',               // '58mm' | '80mm' (only used for EscPos defaults)
  timeoutMs: 12000,            // a healthy job finishes in < 1 s; longer = stuck printer/spooler
  tcpTimeoutMs: 5000,
  helperExePath: '',           // pre-built helper .exe (ship it with your installer); optional
  cacheDir: '',                // where the helper is compiled; default %LOCALAPPDATA%/universal-printer
  logFile: '',                 // one line per job, e.g. "OK 12ms 534B -> POS-80"; '' = off
  logger: null,                // optional (msg) => void, e.g. console.log
  dedupeSize: 5000,            // how many printed jobIds to remember
};

function configure(options = {}) {
  Object.assign(cfg, options);
  printerListCache = null;
  resolveCache.clear();
  return { ...cfg };
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { if (typeof cfg.logger === 'function') cfg.logger(line); } catch (_) {}
  if (!cfg.logFile || !isNode) return;
  try {
    const fs = nodeRequire('fs');
    try {
      if (fs.statSync(cfg.logFile).size > 2 * 1024 * 1024) fs.renameSync(cfg.logFile, cfg.logFile + '.old');
    } catch (_) {}
    fs.appendFileSync(cfg.logFile, line + '\n');
  } catch (_) {}
}

// ============================================================================================
// 1. ESC/POS BUILDER (portable: no Node APIs)
// ============================================================================================
const PAPER_COLUMNS = { '58mm': 32, '80mm': 42 };

/** Makes text printable in ESC/POS text mode (ASCII only). */
function toPrinterText(s) {
  return String(s == null ? '' : s)
    .replace(/₹/g, 'Rs.')
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, '    ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x0A\x0D\x20-\x7E]/g, '?');
}

function asciiBytes(s) {
  const t = toPrinterText(s);
  const out = new Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
}

function padText(text, width, align) {
  let t = toPrinterText(text);
  if (t.length > width) t = t.substring(0, width);
  const gap = width - t.length;
  if (align === 'right') return ' '.repeat(gap) + t;
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + t + ' '.repeat(gap - Math.floor(gap / 2));
  return t + ' '.repeat(gap);
}

function wrapText(text, width) {
  const words = toPrinterText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let w of words) {
    while (w.length > width) { // a word longer than the column: hard split
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.substring(0, width));
      w = w.substring(width);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

class EscPos {
  /**
   * @param {{ paper?: '58mm'|'80mm', columns?: number, init?: boolean, codePage?: number }} [opts]
   * columns: characters per line in normal size (58mm=32, 80mm=42; many 80mm printers can do 48).
   */
  constructor(opts = {}) {
    this.paper = opts.paper || cfg.paper || '80mm';
    this.columns = opts.columns || PAPER_COLUMNS[this.paper] || 42;
    this._bytes = [];
    this._widthMul = 1;
    if (opts.init !== false) this.init();
    if (typeof opts.codePage === 'number') this.raw([0x1b, 0x74, opts.codePage]); // ESC t n
  }

  /** Characters that fit on one line at the current text width. */
  get cols() { return Math.max(1, Math.floor(this.columns / this._widthMul)); }

  raw(bytes) { for (const b of bytes) this._bytes.push(b & 0xff); return this; }
  init() { this._widthMul = 1; return this.raw([0x1b, 0x40, 0x1b, 0x4d, 0x00, 0x1b, 0x32]); } // ESC @, Font A, default spacing
  text(s) { return this.raw(asciiBytes(s)); }
  line(s = '') { return this.text(String(s) + '\n'); }
  newline(n = 1) { return this.raw(new Array(Math.max(0, n)).fill(0x0a)); }
  align(a = 'left') { return this.raw([0x1b, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0]); }
  bold(on = true) { return this.raw([0x1b, 0x45, on ? 1 : 0]); }
  /** Double-strike: darker print on faint thermal heads without changing the font size. */
  dark(on = true) { return this.raw([0x1b, 0x47, on ? 1 : 0]); }
  underline(on = true) { return this.raw([0x1b, 0x2d, on ? 1 : 0]); }
  invert(on = true) { return this.raw([0x1d, 0x42, on ? 1 : 0]); }
  /** Character size multiplier 1..8 for width and height (GS ! n). */
  size(w = 1, h = 1) {
    const cw = Math.min(8, Math.max(1, w | 0));
    const ch = Math.min(8, Math.max(1, h | 0));
    this._widthMul = cw;
    return this.raw([0x1d, 0x21, ((cw - 1) << 4) | (ch - 1)]);
  }
  normal() { return this.size(1, 1).bold(false).underline(false).invert(false); }
  feed(lines = 1) { return this.raw([0x1b, 0x64, Math.min(255, Math.max(0, lines))]); }
  divider(ch = '-') { return this.line(String(ch || '-').charAt(0).repeat(this.cols)); }

  /** "Left ............ Right" on one line. */
  pair(left, right, opts = {}) {
    const r = toPrinterText(right);
    const lw = Math.max(1, this.cols - r.length - 1);
    if (opts.bold) this.bold(true);
    this.line(padText(left, lw, 'left') + ' ' + r);
    if (opts.bold) this.bold(false);
    return this;
  }

  /**
   * A row of columns. width = number of chars, or a fraction (0.5) of the line; the last column
   * takes whatever is left. Example: row([{text:'Item',width:0.6},{text:'Qty',width:6,align:'right'},{text:'Amt',align:'right'}])
   */
  row(cells, opts = {}) {
    const total = this.cols;
    let used = 0;
    const widths = cells.map((c, i) => {
      if (i === cells.length - 1) return Math.max(1, total - used);
      let w = c.width == null ? Math.floor(total / cells.length) : c.width < 1 ? Math.floor(total * c.width) : c.width;
      w = Math.max(1, Math.min(w, total - used - (cells.length - 1 - i)));
      used += w;
      return w;
    });
    if (opts.bold) this.bold(true);
    this.line(cells.map((c, i) => padText(c.text, widths[i], c.align || 'left')).join(''));
    if (opts.bold) this.bold(false);
    return this;
  }

  /** Item / Qty / Amount line. Long item names wrap onto extra lines instead of being cut off. */
  item(name, qty = '', amount = '', opts = {}) {
    const total = this.cols;
    const a = toPrinterText(amount);
    const q = toPrinterText(qty);
    const amtW = Math.max(total <= 32 ? 7 : 8, a.length + 1);
    const qtyW = Math.max(total <= 32 ? 6 : 7, q.length + 1);
    const nameW = Math.max(4, total - amtW - qtyW);
    const nameLines = opts.wrap === false ? [toPrinterText(name).substring(0, nameW)] : wrapText(name, nameW);
    if (opts.bold) this.bold(true);
    this.line(padText(nameLines[0], nameW, 'left') + padText(q, qtyW, 'right') + padText(a, amtW, 'right'));
    for (let i = 1; i < nameLines.length; i++) this.line('  ' + nameLines[i]);
    if (opts.bold) this.bold(false);
    return this;
  }

  /** Paragraph text wrapped at word boundaries. */
  wrapped(text) { for (const l of wrapText(text, this.cols)) this.line(l); return this; }

  /**
   * Barcode. type: 'CODE128' (default) | 'CODE39' | 'EAN13'.
   * hri: where the human-readable digits are printed: 'none' | 'above' | 'below' | 'both'.
   */
  barcode(data, opts = {}) {
    const type = (opts.type || 'CODE128').toUpperCase();
    const height = Math.min(255, Math.max(1, opts.height || 60));
    const width = Math.min(6, Math.max(2, opts.width || 2));
    const hri = { none: 0, above: 1, below: 2, both: 3 }[opts.hri || 'below'];
    this.raw([0x1d, 0x68, height, 0x1d, 0x77, width, 0x1d, 0x48, hri]);
    if (type === 'EAN13') {
      const d = String(data).replace(/\D/g, '').substring(0, 13);
      return this.raw([0x1d, 0x6b, 67, d.length, ...asciiBytes(d)]).newline();
    }
    if (type === 'CODE39') {
      const d = toPrinterText(data).toUpperCase().replace(/[^A-Z0-9 \-.$/+%]/g, '');
      return this.raw([0x1d, 0x6b, 69, d.length, ...asciiBytes(d)]).newline();
    }
    const d = [0x7b, 0x42, ...asciiBytes(data)].slice(0, 255); // "{B" = code set B
    return this.raw([0x1d, 0x6b, 73, d.length, ...d]).newline();
  }

  /** QR code (GS ( k). size 1..16 (module dots), ec: 'L'|'M'|'Q'|'H'. */
  qr(data, opts = {}) {
    const bytes = asciiBytes(data);
    const size = Math.min(16, Math.max(1, opts.size || 6));
    const ec = { L: 48, M: 49, Q: 50, H: 51 }[(opts.ec || 'M').toUpperCase()] || 49;
    const len = bytes.length + 3;
    return this.raw([
      0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00, // model 2
      0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size,       // module size
      0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ec,         // error correction
      0x1d, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes, // store
      0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,       // print
    ]).newline();
  }

  /** Feed paper past the blade and cut. partial=true leaves a small hinge (most shops prefer it). */
  cut(opts = {}) {
    const feedLines = opts.feed == null ? 4 : opts.feed;
    this.feed(feedLines);
    return this.raw([0x1d, 0x56, opts.partial === false ? 0x00 : 0x01]);
  }

  /** Kick the cash drawer connected to the printer (pin 2; pass pin:5 for the second drawer). */
  drawer(opts = {}) { return this.raw([0x1b, 0x70, opts.pin === 5 ? 1 : 0, 0x19, 0xfa]); }

  /** Short beep on printers that have a buzzer (ignored by others). */
  beep(times = 1) { return this.raw([0x1b, 0x42, Math.min(9, Math.max(1, times)), 0x02]); }

  /** Final bytes as Uint8Array (send to print(), or over IPC from a renderer). */
  build() { return Uint8Array.from(this._bytes); }
}

/** Join several slips (each already ending in cut()) into ONE job. */
function concatBytes(list) {
  const arrs = list.map((x) => (x instanceof Uint8Array ? x : Uint8Array.from(x || [])));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

// ============================================================================================
// 2. PRINTER NAMES: virtual / thermal detection, listing, resolution
// ============================================================================================
const VIRTUAL_RE = /pdf|xps|onenote|fax|document writer|send to|snagit|image writer/i;
const THERMAL_RE = /epson|pos|thermal|receipt|tm-|t82|t20|t88|tsp|citizen|star|tvs|xp-|rp-|retsol|rtp|t08|bixolon|srp-|xprinter|rongta|sewoo|gprinter|hoin|munbyn|zjiang|\b58|\b80/i;
const isVirtualPrinter = (name) => VIRTUAL_RE.test(String(name || ''));
const isThermalName = (name) => THERMAL_RE.test(String(name || ''));
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

function parseTarget(target) {
  const t = String(target == null ? '' : target).trim();
  if (IP_RE.test(t)) {
    const [host, port] = t.split(':');
    return { kind: 'tcp', host, port: port ? parseInt(port, 10) : 9100 };
  }
  const m = t.match(/^tcp:\/\/([^:/]+)(?::(\d+))?\/?$/i);
  if (m) return { kind: 'tcp', host: m[1], port: m[2] ? parseInt(m[2], 10) : 9100 };
  if (/^file:/i.test(t)) {
    let p = t.substring(5);
    if (isWin && /^(COM\d+|LPT\d+)$/i.test(p)) p = `\\\\.\\${p.toUpperCase()}`;
    return { kind: 'file', path: p };
  }
  return { kind: 'os', name: t };
}

let printerListCache = null; // { at, list }
const resolveCache = new Map(); // wanted name (lowercase) -> resolved name
const LIST_TTL_MS = 60 * 1000;
const RESOLVE_TTL_MS = 5 * 60 * 1000;

function execFileP(file, args, opts = {}) {
  const { execFile } = nodeRequire('child_process');
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/**
 * Lists installed printers: [{ name, isDefault, port, driver, offline, isVirtual, isThermal }]
 * Windows: native helper (fast), falling back to PowerShell CIM. Linux/macOS: lpstat.
 */
async function listPrinters(opts = {}) {
  if (!isNode) return [];
  if (!opts.fresh && printerListCache && Date.now() - printerListCache.at < LIST_TTL_MS) return printerListCache.list;
  let list = [];
  try {
    if (isWin) {
      const exe = await getHelperExe();
      if (exe) {
        const r = await execFileP(exe, ['--list'], { timeout: 8000 });
        if (!r.err) {
          list = JSON.parse(r.stdout.trim() || '[]').map((p) => ({
            name: p.name,
            isDefault: !!p.isDefault,
            port: p.port || '',
            driver: p.driver || '',
            offline: ((p.attributes || 0) & 0x400) !== 0 || ((p.status || 0) & 0x80) !== 0,
          }));
        }
      }
      if (!list.length) {
        const ps = "Get-CimInstance Win32_Printer | Select-Object Name,Default,PortName,DriverName,WorkOffline | ConvertTo-Json -Compress";
        const r = await execFileP('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 15000 });
        if (!r.err && r.stdout.trim()) {
          let arr = JSON.parse(r.stdout.trim());
          if (!Array.isArray(arr)) arr = [arr];
          list = arr.map((p) => ({ name: p.Name, isDefault: !!p.Default, port: p.PortName || '', driver: p.DriverName || '', offline: !!p.WorkOffline }));
        }
      }
    } else {
      const [p, d] = await Promise.all([
        execFileP('lpstat', ['-p'], { timeout: 5000, env: { ...process.env, LC_ALL: 'C' } }),
        execFileP('lpstat', ['-d'], { timeout: 5000, env: { ...process.env, LC_ALL: 'C' } }),
      ]);
      const def = (d.stdout.match(/system default destination:\s*(\S+)/i) || [])[1] || '';
      for (const line of p.stdout.split('\n')) {
        const m = line.match(/^printer\s+(\S+)\s+(.*)$/i);
        if (m) list.push({ name: m[1], isDefault: m[1] === def, port: '', driver: '', offline: /disabled/i.test(m[2]) });
      }
    }
  } catch (e) {
    log(`listPrinters failed: ${e.message}`);
  }
  list = list.filter((p) => p && p.name).map((p) => ({ ...p, isVirtual: isVirtualPrinter(p.name), isThermal: isThermalName(p.name) }));
  printerListCache = { at: Date.now(), list };
  return list;
}

/** Picks the real printer name for a wanted name ('' = automatic). */
async function resolvePrinter(wanted = '', opts = {}) {
  const want = String(wanted || '').trim();
  const key = want.toLowerCase();
  const hit = resolveCache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.name;

  const printers = await listPrinters({ fresh: opts.fresh });
  let name = want;
  if (printers.length) {
    if (want) {
      const exact = printers.find((p) => p.name.trim().toLowerCase() === key);
      const partial = exact ? null : printers.find((p) => p.name.toLowerCase().includes(key));
      name = (exact || partial || { name: want }).name;
    } else {
      const pick =
        printers.find((p) => p.isDefault && p.isThermal && !p.isVirtual) ||
        printers.find((p) => p.isThermal && !p.isVirtual) ||
        printers.find((p) => p.isDefault && !p.isVirtual) ||
        printers.find((p) => !p.isVirtual);
      name = pick ? pick.name : '';
    }
  }
  if (name) resolveCache.set(key, { name, at: Date.now() });
  return name;
}

async function virtualPrinterProblem(name) {
  if (!isVirtualPrinter(name)) return '';
  const printers = await listPrinters().catch(() => []);
  const real = printers.find((p) => !p.isVirtual);
  return real
    ? `"${name}" is a PDF/virtual printer, not a receipt printer. Select "${real.name}" instead.`
    : `Only PDF/virtual printers were found ("${name}"). Install the receipt printer in Windows first.`;
}

// ============================================================================================
// 3. WINDOWS RAW SPOOLER HELPER (C#, compiled once with csc.exe that ships with Windows)
// ============================================================================================
const HELPER_VERSION = 3; // bump when HELPER_CS_SOURCE changes, so PCs recompile it

const HELPER_CS_SOURCE = String.raw`
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;

public class UniversalPrintHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOC_INFO_1 {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct PRINTER_INFO_2 {
        public string pServerName; public string pPrinterName; public string pShareName;
        public string pPortName; public string pDriverName; public string pComment;
        public string pLocation; public IntPtr pDevMode; public string pSepFile;
        public string pPrintProcessor; public string pDatatype; public string pParameters;
        public IntPtr pSecurityDescriptor; public uint Attributes; public uint Priority;
        public uint DefaultPriority; public uint StartTime; public uint UntilTime;
        public uint Status; public uint cJobs; public uint AveragePPM;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOC_INFO_1 di);
    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    [DllImport("winspool.drv", EntryPoint = "GetDefaultPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern bool GetDefaultPrinter(StringBuilder pszBuffer, ref int size);
    [DllImport("winspool.drv", EntryPoint = "EnumPrintersW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern bool EnumPrinters(int flags, string name, uint level, IntPtr pPrinterEnum, uint cbBuf, out uint pcbNeeded, out uint pcReturned);

    static string DefaultPrinterName() {
        int size = 512;
        StringBuilder sb = new StringBuilder(size);
        if (GetDefaultPrinter(sb, ref size) && sb.Length > 0) return sb.ToString().Trim();
        return "";
    }

    static PRINTER_INFO_2[] Printers() {
        uint need = 0, count = 0;
        EnumPrinters(6, null, 2, IntPtr.Zero, 0, out need, out count); // LOCAL | CONNECTIONS
        if (need == 0) return new PRINTER_INFO_2[0];
        IntPtr buf = Marshal.AllocHGlobal((int)need);
        try {
            if (!EnumPrinters(6, null, 2, buf, need, out need, out count)) return new PRINTER_INFO_2[0];
            PRINTER_INFO_2[] list = new PRINTER_INFO_2[count];
            int sz = Marshal.SizeOf(typeof(PRINTER_INFO_2));
            for (int i = 0; i < count; i++) {
                list[i] = (PRINTER_INFO_2)Marshal.PtrToStructure(new IntPtr(buf.ToInt64() + (long)i * sz), typeof(PRINTER_INFO_2));
            }
            return list;
        } finally { Marshal.FreeHGlobal(buf); }
    }

    public static string ResolvePrinter(string target) {
        if (!string.IsNullOrEmpty(target) && target.Trim().Length > 0) return target.Trim();
        string def = DefaultPrinterName();
        if (def.Length > 0 && def.ToLower().IndexOf("pdf") < 0 && def.ToLower().IndexOf("xps") < 0) return def;
        foreach (PRINTER_INFO_2 p in Printers()) {
            string n = (p.pPrinterName ?? "").ToLower();
            if (n.Contains("pos") || n.Contains("receipt") || n.Contains("thermal") || n.Contains("epson") || n.Contains("tvs") || n.Contains("tm-")) return p.pPrinterName;
        }
        return def;
    }

    static string J(string s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        foreach (char c in s) {
            if (c == '\\' || c == '"') { sb.Append('\\'); sb.Append(c); }
            else if (c < 0x20) { sb.Append("\\u"); sb.Append(((int)c).ToString("x4")); }
            else sb.Append(c);
        }
        sb.Append('"');
        return sb.ToString();
    }

    public static int ListPrinters() {
        string def = DefaultPrinterName();
        StringBuilder o = new StringBuilder("[");
        bool first = true;
        foreach (PRINTER_INFO_2 p in Printers()) {
            if (!first) o.Append(',');
            first = false;
            o.Append("{\"name\":" + J(p.pPrinterName) + ",\"port\":" + J(p.pPortName) + ",\"driver\":" + J(p.pDriverName)
                + ",\"isDefault\":" + (p.pPrinterName == def ? "true" : "false")
                + ",\"status\":" + p.Status + ",\"attributes\":" + p.Attributes + "}");
        }
        o.Append("]");
        Console.WriteLine(o.ToString());
        return 0;
    }

    public static int PrintBytes(string printerName, byte[] bytes) {
        if (bytes == null || bytes.Length == 0) return 0;
        IntPtr h;
        if (!OpenPrinter(printerName, out h, IntPtr.Zero))
            throw new Exception("OpenPrinter failed for '" + printerName + "' (Win32 Error: " + Marshal.GetLastWin32Error() + ")");
        try {
            DOC_INFO_1 di = new DOC_INFO_1();
            di.pDocName = "Receipt";
            di.pOutputFile = null;
            di.pDataType = "RAW";
            int job = StartDocPrinter(h, 1, ref di);
            if (job == 0) {
                di.pDataType = null; // some drivers reject an explicit "RAW"
                job = StartDocPrinter(h, 1, ref di);
                if (job == 0) throw new Exception("StartDocPrinter failed for '" + printerName + "' (Win32 Error: " + Marshal.GetLastWin32Error() + ")");
            }
            try {
                if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed for '" + printerName + "' (Win32 Error: " + Marshal.GetLastWin32Error() + ")");
                try {
                    IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
                    try {
                        Marshal.Copy(bytes, 0, p, bytes.Length);
                        int written = 0;
                        bool ok = WritePrinter(h, p, bytes.Length, out written);
                        if (!ok || written != bytes.Length)
                            throw new Exception("WritePrinter failed for '" + printerName + "' (Win32 Error: " + Marshal.GetLastWin32Error() + ", Written: " + written + "/" + bytes.Length + ")");
                    } finally { Marshal.FreeCoTaskMem(p); }
                } finally { EndPagePrinter(h); }
            } finally { EndDocPrinter(h); }
        } finally { ClosePrinter(h); }
        return bytes.Length;
    }

    public static int Main(string[] args) {
        if (args.Length > 0 && args[0] == "--list") {
            try { return ListPrinters(); } catch (Exception ex) { Console.Error.WriteLine(ex.Message); return 3; }
        }
        if (args.Length > 0 && args[0] == "--daemon") {
            // Protocol (stdin): int32 nameLen, UTF-8 name, int32 byteCount, payload. Reply: one line "OK:<n>:<printer>" or "ERR:<msg>".
            Console.WriteLine("[READY]");
            BinaryReader reader = new BinaryReader(Console.OpenStandardInput());
            while (true) {
                try {
                    int nameLen = reader.ReadInt32();
                    if (nameLen < 0) break;
                    string target = Encoding.UTF8.GetString(reader.ReadBytes(nameLen));
                    int count = reader.ReadInt32();
                    byte[] payload = reader.ReadBytes(count);
                    string printer = ResolvePrinter(target);
                    if (string.IsNullOrEmpty(printer)) { Console.WriteLine("ERR:No target printer found on system"); continue; }
                    PrintBytes(printer, payload);
                    Console.WriteLine("OK:" + payload.Length + ":" + printer);
                } catch (EndOfStreamException) {
                    break;
                } catch (Exception ex) {
                    Console.WriteLine("ERR:" + ex.Message.Replace("\r", " ").Replace("\n", " "));
                }
            }
            return 0;
        }
        // One-shot: helper.exe "<printer>" "<file.bin>"
        try {
            string printer = ResolvePrinter(args.Length > 0 ? args[0] : "");
            if (string.IsNullOrEmpty(printer)) { Console.Error.WriteLine("No target printer found on system"); return 1; }
            byte[] bytes = (args.Length > 1 && File.Exists(args[1])) ? File.ReadAllBytes(args[1]) : new byte[0];
            if (bytes.Length == 0) { Console.Error.WriteLine("No payload bytes provided"); return 2; }
            PrintBytes(printer, bytes);
            Console.WriteLine("OK:" + bytes.Length + ":" + printer);
            return 0;
        } catch (Exception ex) {
            Console.Error.WriteLine(ex.Message);
            return 3;
        }
    }
}
`;

const H = { exe: null, compiling: null, failedAt: 0, proc: null, buf: '', pending: null };

function helperDir() {
  const path = nodeRequire('path');
  const os = nodeRequire('os');
  return cfg.cacheDir || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'universal-printer');
}

/** Compiles the C# helper to `outExe`. Uses csc.exe (always on Win10/11), else PowerShell Add-Type. */
async function compileHelper(outExe) {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  fs.mkdirSync(path.dirname(outExe), { recursive: true });
  const csPath = outExe.replace(/\.exe$/i, '') + '.cs';
  fs.writeFileSync(csPath, HELPER_CS_SOURCE, 'utf8');
  try {
    const windir = process.env.WINDIR || 'C:\\Windows';
    const csc = [
      `${windir}\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe`,
      `${windir}\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe`,
      `${windir}\\Microsoft.NET\\Framework64\\v3.5\\csc.exe`,
      `${windir}\\Microsoft.NET\\Framework\\v3.5\\csc.exe`,
    ].find((p) => fs.existsSync(p));
    let r;
    if (csc) {
      r = await execFileP(csc, ['/nologo', '/optimize+', '/target:exe', `/out:${outExe}`, csPath], { timeout: 60000 });
    } else {
      const q = (s) => s.replace(/'/g, "''");
      const cmd = `Add-Type -TypeDefinition (Get-Content -LiteralPath '${q(csPath)}' -Raw) -OutputAssembly '${q(outExe)}' -OutputType ConsoleApplication`;
      r = await execFileP('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { timeout: 90000 });
    }
    if (r.err || !fs.existsSync(outExe)) throw new Error((r.stderr || r.stdout || (r.err && r.err.message) || 'compile failed').trim());
    return outExe;
  } finally {
    try { fs.unlinkSync(csPath); } catch (_) {}
  }
}

async function getHelperExe() {
  if (!isWin) return null;
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  if (cfg.helperExePath && fs.existsSync(cfg.helperExePath)) return cfg.helperExePath;
  if (H.exe && fs.existsSync(H.exe)) return H.exe;
  if (H.compiling) return H.compiling;
  if (H.failedAt && Date.now() - H.failedAt < 10 * 60 * 1000) return null; // don't recompile on every job
  H.compiling = (async () => {
    const exe = path.join(helperDir(), `uprint-helper-v${HELPER_VERSION}.exe`);
    try {
      if (!fs.existsSync(exe)) {
        log('Compiling Windows RAW print helper (first run only)...');
        await compileHelper(exe);
        log(`Helper ready: ${exe}`);
      }
      H.exe = exe;
      return exe;
    } catch (e) {
      H.failedAt = Date.now();
      log(`Helper compile failed (slow PowerShell route will be used): ${e.message}`);
      return null;
    }
  })();
  try { return await H.compiling; } finally { H.compiling = null; }
}

function startDaemon(exe) {
  if (H.proc && H.proc.exitCode === null && !H.proc.killed) return H.proc;
  const { spawn } = nodeRequire('child_process');
  let proc;
  try {
    proc = spawn(exe, ['--daemon'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    log(`Helper daemon could not start: ${e.message}`);
    return null;
  }
  H.proc = proc;
  H.buf = '';
  const answer = (line) => {
    const p = H.pending;
    H.pending = null;
    if (p) p(line);
  };
  proc.stdout.on('data', (chunk) => {
    if (H.proc !== proc) return; // output from an abandoned (timed-out) daemon
    H.buf += chunk.toString('utf8');
    const lines = H.buf.split('\n');
    H.buf = lines.pop();
    for (const l of lines) {
      const t = l.trim();
      if (!t || t === '[READY]') continue;
      answer(t);
    }
  });
  proc.stderr.on('data', () => {});
  proc.stdin.on('error', () => {}); // EPIPE is reported through 'exit'
  proc.on('error', (e) => { if (H.proc === proc) { H.proc = null; answer(`ERR:helper error (exited): ${e.message}`); } });
  proc.on('exit', () => { if (H.proc === proc) { H.proc = null; answer('ERR:helper exited during the job'); } });
  return proc;
}

function killDaemon() {
  const p = H.proc;
  H.proc = null;
  H.pending = null;
  try { if (p && p.exitCode === null) p.kill(); } catch (_) {}
}

/** Sends one job to the daemon. Jobs are serialized by the queue, so only one is pending at a time. */
function daemonPrint(exe, printerName, buf, timeoutMs) {
  return new Promise((resolve) => {
    const proc = startDaemon(exe);
    if (!proc || !proc.stdin.writable) return resolve({ ok: false, error: 'helper not running (nothing sent)' });
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      killDaemon(); // the next job starts a fresh daemon
      resolve({ ok: false, timedOut: true, error: 'Printer not responding (timed out). Check paper/cable/power, then reprint.' });
    }, timeoutMs);
    H.pending = (line) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (line.startsWith('OK:')) resolve({ ok: true, printerUsed: line.split(':').slice(2).join(':') || printerName });
      else resolve({ ok: false, error: line.replace(/^ERR:/, '') });
    };
    const name = Buffer.from(printerName || '', 'utf8');
    const head = Buffer.alloc(4);
    head.writeInt32LE(name.length, 0);
    const len = Buffer.alloc(4);
    len.writeInt32LE(buf.length, 0);
    proc.stdin.write(Buffer.concat([head, name, len, buf]));
  });
}

/** Slow last resort (5-10 s) when the helper exe can't be compiled: runs the same C# through PowerShell. */
async function powershellPrint(printerName, buf, timeoutMs) {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const os = nodeRequire('os');
  const id = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const bin = path.join(os.tmpdir(), `uprint_${id}.bin`);
  const ps1 = path.join(os.tmpdir(), `uprint_${id}.ps1`);
  const cs = path.join(os.tmpdir(), `uprint_${id}.cs`);
  fs.writeFileSync(bin, buf);
  fs.writeFileSync(cs, HELPER_CS_SOURCE, 'utf8');
  const q = (s) => String(s).replace(/'/g, "''");
  fs.writeFileSync(ps1, [
    `$ErrorActionPreference = 'Stop'`,
    `if (-not ([System.Management.Automation.PSTypeName]'UniversalPrintHelper').Type) { Add-Type -TypeDefinition (Get-Content -LiteralPath '${q(cs)}' -Raw) }`,
    `$p = [UniversalPrintHelper]::ResolvePrinter('${q(printerName)}')`,
    `if (-not $p) { throw 'No target printer found on system' }`,
    `[void][UniversalPrintHelper]::PrintBytes($p, [System.IO.File]::ReadAllBytes('${q(bin)}'))`,
    `Write-Output "OK:$p"`,
  ].join('\r\n'), 'utf8');
  const r = await execFileP('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1], { timeout: Math.max(timeoutMs, 30000) });
  for (const f of [bin, ps1, cs]) { try { fs.unlinkSync(f); } catch (_) {} }
  if (r.err && r.err.killed) return { ok: false, timedOut: true, error: 'Printer not responding (timed out).' };
  if (r.err) return { ok: false, error: (r.stderr || r.err.message).trim() };
  const m = r.stdout.match(/OK:(.*)/);
  return { ok: true, printerUsed: m ? m[1].trim() : printerName };
}

/**
 * Errors that happen BEFORE any byte reaches the printer are safe to retry.
 * Anything else (bytes written, helper died mid-job) may already be on paper: never retry.
 */
function errorMayHavePrinted(err) {
  const e = String(err || '');
  if (/No target printer|OpenPrinter|StartDocPrinter failed|StartPagePrinter failed|Invalid printer|not found|nothing sent/i.test(e)) return false;
  const m = e.match(/Written:\s*(\d+)/i);
  if (m) return Number(m[1]) > 0;
  return /exited|EPIPE|write after end|stdin/i.test(e);
}

// ============================================================================================
// 4. TRANSPORTS
// ============================================================================================
function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.from(data);
  if (typeof data === 'string') return Buffer.from(data, 'latin1');
  if (data && typeof data === 'object') return Buffer.from(Object.values(data)); // Uint8Array that lost its type over IPC/JSON
  return Buffer.alloc(0);
}

function sendTcp(host, port, buf, timeoutMs) {
  const net = nodeRequire('net');
  return new Promise((resolve) => {
    let done = false;
    let wrote = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.on('error', (e) => { sock.destroy(); finish(wrote ? { ok: false, error: `${e.message} (exited after write)` } : { ok: false, error: `nothing sent: ${e.message}` }); });
    sock.on('timeout', () => { sock.destroy(); finish(wrote ? { ok: false, timedOut: true, error: 'Network printer stopped answering.' } : { ok: false, error: `nothing sent: printer ${host}:${port} not reachable` }); });
    sock.connect(port, host, () => {
      wrote = true;
      sock.write(buf, (err) => {
        if (err) { sock.destroy(); return finish({ ok: false, error: `${err.message} (exited after write)` }); }
        sock.end();
        finish({ ok: true, printerUsed: `${host}:${port}` });
      });
    });
  });
}

function sendFile(devicePath, buf) {
  const fs = nodeRequire('fs');
  return new Promise((resolve) => {
    fs.writeFile(devicePath, buf, (err) => resolve(err ? { ok: false, error: `nothing sent: ${err.message}` } : { ok: true, printerUsed: devicePath }));
  });
}

async function sendCups(printerName, buf, timeoutMs) {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const os = nodeRequire('os');
  const file = path.join(os.tmpdir(), `uprint_${Date.now()}_${Math.floor(Math.random() * 1e6)}.bin`);
  fs.writeFileSync(file, buf);
  const args = printerName ? ['-d', printerName, '-o', 'raw', file] : ['-o', 'raw', file];
  const r = await execFileP('lp', args, { timeout: timeoutMs });
  try { fs.unlinkSync(file); } catch (_) {}
  if (r.err && r.err.killed) return { ok: false, timedOut: true, error: 'lp timed out' };
  if (r.err) return { ok: false, error: `nothing sent: ${(r.stderr || r.err.message).trim()}` };
  return { ok: true, printerUsed: printerName || 'default' };
}

async function printWindows(wanted, buf, timeoutMs) {
  let name = await resolvePrinter(wanted);
  const vp = await virtualPrinterProblem(name);
  if (vp) return { ok: false, virtualPrinter: true, error: vp };

  const exe = await getHelperExe();
  if (!exe) return powershellPrint(name, buf, timeoutMs);

  let r = await daemonPrint(exe, name, buf, timeoutMs);
  if (r.ok || r.timedOut || errorMayHavePrinted(r.error)) return r;

  // Safe failure (nothing reached the printer): maybe the printer was renamed or re-plugged.
  resolveCache.delete(String(wanted || '').trim().toLowerCase());
  const fresh = await resolvePrinter(wanted, { fresh: true });
  if (fresh && fresh !== name && !isVirtualPrinter(fresh)) {
    log(`Retrying on re-detected printer "${fresh}" (was "${name}"): ${r.error}`);
    name = fresh;
    r = await daemonPrint(exe, name, buf, timeoutMs);
  }
  return r;
}

// ============================================================================================
// 5. PUBLIC PRINT API (queue + duplicate protection)
// ============================================================================================
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(() => task());
  queue = run.catch(() => {});
  return run;
}

const printedJobs = new Set();
function rememberJob(id) {
  printedJobs.add(id);
  if (printedJobs.size > cfg.dedupeSize) printedJobs.delete(printedJobs.values().next().value);
}

/**
 * Print raw ESC/POS bytes.
 * @param {Uint8Array|Buffer|number[]|string} data   bytes (e.g. new EscPos()...build())
 * @param {{ printer?: string, jobId?: string, force?: boolean, timeoutMs?: number }} [opts]
 *   jobId: same id is never printed twice (unless force:true, e.g. a "Reprint" button).
 * @returns {Promise<{success:boolean, printerUsed?:string, elapsedMs:number, error?:string,
 *           timedOut?:boolean, noRetry?:boolean, virtualPrinter?:boolean, skipped?:'duplicate'}>}
 *   timedOut / noRetry: DON'T reprint automatically. Ask the user to check whether the slip came out.
 */
function print(data, opts = {}) {
  if (!isNode) return Promise.resolve({ success: false, elapsedMs: 0, error: 'print() runs in Node/Electron main. In a renderer, send build() bytes over IPC.' });
  const buf = toBuffer(data);
  const jobId = opts.jobId ? String(opts.jobId) : '';
  if (!buf.length) return Promise.resolve({ success: false, elapsedMs: 0, error: 'Nothing to print' });
  if (jobId && !opts.force && printedJobs.has(jobId)) return Promise.resolve({ success: true, skipped: 'duplicate', elapsedMs: 0 });

  return enqueue(async () => {
    if (jobId && !opts.force && printedJobs.has(jobId)) return { success: true, skipped: 'duplicate', elapsedMs: 0 };
    const t0 = Date.now();
    const timeoutMs = opts.timeoutMs || cfg.timeoutMs;
    const target = parseTarget(opts.printer != null && opts.printer !== '' ? opts.printer : cfg.defaultPrinter);
    let r;
    try {
      if (target.kind === 'tcp') r = await sendTcp(target.host, target.port, buf, Math.min(timeoutMs, cfg.tcpTimeoutMs));
      else if (target.kind === 'file') r = await sendFile(target.path, buf);
      else if (isWin) r = await printWindows(target.name, buf, timeoutMs);
      else {
        const name = await resolvePrinter(target.name);
        const vp = await virtualPrinterProblem(name);
        r = vp ? { ok: false, virtualPrinter: true, error: vp } : await sendCups(name, buf, timeoutMs);
      }
    } catch (e) {
      r = { ok: false, error: e.message };
    }
    const res = { success: !!r.ok, elapsedMs: Date.now() - t0 };
    if (r.printerUsed) res.printerUsed = r.printerUsed;
    if (!r.ok) {
      res.error = String(r.error || 'Print failed').replace(/^nothing sent:\s*/i, '');
      if (r.timedOut) res.timedOut = true;
      if (r.virtualPrinter) res.virtualPrinter = true;
      if (r.timedOut || errorMayHavePrinted(r.error)) {
        res.noRetry = true;
        res.error = `${res.error} Check whether the slip came out before reprinting.`;
      }
    }
    if (res.success && jobId) rememberJob(jobId);
    log(`${res.success ? 'OK' : 'FAILED'} ${res.elapsedMs}ms ${buf.length}B -> ${res.printerUsed || opts.printer || cfg.defaultPrinter || 'auto'}${jobId ? ` job=${jobId}` : ''}${res.error ? ` | ${res.error}` : ''}`);
    return res;
  });
}

/** Opens the cash drawer wired to the receipt printer. */
function openCashDrawer(opts = {}) {
  return print(new EscPos({ init: false }).drawer(opts).build(), { printer: opts.printer });
}

// ============================================================================================
// 6. HTML PRINTING (Electron main only) for Hindi/Devanagari, logos and complex layouts
// ============================================================================================
/**
 * Silently prints HTML with the printer's normal Windows driver (no dialog, ever).
 * @param {string} html  body HTML or a full <!DOCTYPE html> document
 * @param {{ printer?: string, paperWidthMm?: number, timeoutMs?: number }} [opts]
 */
function printHtml(html, opts = {}) {
  let BrowserWindow;
  try { ({ BrowserWindow } = nodeRequire('electron')); } catch (_) {}
  if (!BrowserWindow) return Promise.resolve({ success: false, elapsedMs: 0, error: 'printHtml() needs the Electron main process' });

  return enqueue(async () => {
    const t0 = Date.now();
    const target = parseTarget(opts.printer != null && opts.printer !== '' ? opts.printer : cfg.defaultPrinter);
    if (target.kind !== 'os') return { success: false, elapsedMs: 0, error: 'HTML printing needs a Windows/CUPS printer name (not an IP or device path)' };
    const deviceName = await resolvePrinter(target.name);
    const vp = await virtualPrinterProblem(deviceName);
    if (vp) return { success: false, virtualPrinter: true, elapsedMs: Date.now() - t0, error: vp };

    const w = opts.paperWidthMm || (cfg.paper === '58mm' ? 58 : 80);
    const full = /^\s*<!doctype html/i.test(html) ? html : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page { size: ${w}mm auto; margin: 0 }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
      html, body { margin: 0; padding: 0; width: 100%; background: #fff; color: #000; font-family: Consolas, 'Courier New', monospace }
    </style></head><body>${html}<div style="height:18mm"></div></body></html>`;

    const win = new BrowserWindow({ show: false, width: 400, height: 800, webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true } });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(full)}`);
      const r = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, timedOut: true, error: 'Print spooler timeout' }), opts.timeoutMs || 20000);
        win.webContents.print(
          { silent: true, printBackground: true, margins: { marginType: 'none' }, ...(deviceName ? { deviceName } : {}) },
          (ok, reason) => { clearTimeout(timer); resolve(ok ? { ok: true } : { ok: false, error: reason || 'Print failed' }); }
        );
      });
      const res = { success: r.ok, printerUsed: deviceName || 'default', elapsedMs: Date.now() - t0 };
      if (!r.ok) { res.error = r.error; if (r.timedOut) { res.timedOut = true; res.noRetry = true; } }
      log(`HTML ${res.success ? 'OK' : 'FAILED'} ${res.elapsedMs}ms -> ${res.printerUsed}${res.error ? ` | ${res.error}` : ''}`);
      return res;
    } catch (e) {
      return { success: false, elapsedMs: Date.now() - t0, error: e.message };
    } finally {
      try { if (!win.isDestroyed()) win.destroy(); } catch (_) {}
    }
  });
}

// ============================================================================================
// 7. HEALTH CHECK (Windows; best effort: USB thermal printers often report only "ready")
// ============================================================================================
async function getPrinterHealth(wanted = '') {
  const checkedAt = new Date().toISOString();
  const target = parseTarget(wanted || cfg.defaultPrinter);
  if (target.kind === 'tcp') {
    const net = nodeRequire('net');
    const ok = await new Promise((resolve) => {
      const s = net.connect(target.port, target.host);
      s.setTimeout(2500);
      s.on('connect', () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
      s.on('timeout', () => { s.destroy(); resolve(false); });
    });
    return { state: ok ? 'ok' : 'offline', detail: ok ? 'Network printer reachable' : 'Network printer not reachable', checkedAt };
  }
  if (target.kind === 'file') return { state: 'unknown', detail: 'Device path: status not available', checkedAt };
  const name = await resolvePrinter(target.name);
  if (!name) return { state: 'unknown', detail: 'No printer found', checkedAt };

  if (!isWin) {
    const r = await execFileP('lpstat', ['-p', name], { timeout: 4000, env: { ...process.env, LC_ALL: 'C' } });
    if (r.err) return { state: 'unknown', detail: r.stderr.trim() || 'lpstat failed', checkedAt, printer: name };
    return /disabled/i.test(r.stdout) ? { state: 'offline', detail: r.stdout.trim(), checkedAt, printer: name } : { state: 'ok', detail: 'Printer is ready', checkedAt, printer: name };
  }

  const esc = name.replace(/'/g, "''");
  const ps = `$p = Get-CimInstance -ClassName Win32_Printer -Filter "Name = '${esc}'"; if ($p) { [PSCustomObject]@{ WorkOffline=[bool]$p.WorkOffline; PrinterStatus=[int]$p.PrinterStatus; DetectedErrorState=[int]$p.DetectedErrorState; ExtendedPrinterStatus=[int]$p.ExtendedPrinterStatus } | ConvertTo-Json -Compress }`;
  const r = await execFileP('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 4000 });
  if (r.err || !r.stdout.trim()) return { state: 'unknown', detail: r.err ? 'Status query failed or timed out' : `Printer "${name}" not found`, checkedAt, printer: name };
  let i;
  try { i = JSON.parse(r.stdout.trim()); } catch (_) { return { state: 'unknown', detail: 'Unreadable status', checkedAt, printer: name }; }
  const err = Number(i.DetectedErrorState || 0);
  const st = Number(i.PrinterStatus || 0);
  const ext = Number(i.ExtendedPrinterStatus || 0);
  const out = (state, detail) => ({ state, detail, checkedAt, printer: name });
  if (i.WorkOffline) return out('offline', 'Printer is set to "Use Printer Offline"');
  if (err === 4) return out('paper_out', 'Out of paper');
  if (err === 7) return out('cover_open', 'Cover / door open');
  if (err === 9 || st === 7 || ext === 7) return out('offline', 'Printer is offline');
  if (err === 8) return out('error', 'Paper jam');
  if (err === 10 || st === 9 || ext === 9) return out('error', 'Printer error reported by Windows');
  if (err === 2 || st === 3 || ext === 3 || st === 4 || ext === 4) return out('ok', 'Printer is ready');
  return out('unknown', `Status ${st}, error state ${err}`);
}

// ============================================================================================
// 8. ELECTRON IPC GLUE + LIFECYCLE
// ============================================================================================
function registerElectronIpc(ipcMain, prefix = 'uprint') {
  ipcMain.handle(`${prefix}:print-raw`, (_e, bytes, printer, opts) => print(bytes, { ...(opts || {}), printer }));
  ipcMain.handle(`${prefix}:print-html`, (_e, html, opts) => printHtml(html, opts || {}));
  ipcMain.handle(`${prefix}:list`, (_e, opts) => listPrinters(opts || {}));
  ipcMain.handle(`${prefix}:health`, (_e, printer) => getPrinterHealth(printer));
  ipcMain.handle(`${prefix}:drawer`, (_e, printer) => openCashDrawer({ printer }));
  // Start compiling the Windows helper in the background, so the first receipt is fast.
  if (isWin) setTimeout(() => { getHelperExe().then((exe) => exe && startDaemon(exe)).catch(() => {}); }, 2000);
}

/** Stops the helper daemon. Call on app quit (otherwise a CLI script won't exit). */
function shutdown() { killDaemon(); }

/** Ready-made test slip, also useful as a template. */
function testSlip(opts = {}) {
  const now = new Date();
  return new EscPos({ paper: opts.paper })
    .align('center').size(2, 2).bold().line('TEST PRINT').normal()
    .line('Universal Printer Kit')
    .line(now.toLocaleString())
    .align('left').divider()
    .item('Item', 'Qty', 'Amount', { bold: true })
    .divider()
    .item('Kaju Katli (500 g) special festive box', '1', '450.00')
    .item('Samosa', '4', '80.00')
    .divider('=')
    .pair('TOTAL', '₹530.00', { bold: true })
    .feed(1).align('center')
    .barcode('INV1001', { height: 50 })
    .qr('https://example.com/bill/INV1001', { size: 5 })
    .line('If this cut cleanly, ESC/POS works.')
    .cut()
    .build();
}

module.exports = {
  // builder
  EscPos, concatBytes, toPrinterText, PAPER_COLUMNS,
  // printing
  configure, print, printHtml, openCashDrawer, testSlip,
  // printers
  listPrinters, resolvePrinter, getPrinterHealth, isVirtualPrinter, isThermalName, parseTarget,
  // electron + lifecycle
  registerElectronIpc, shutdown,
  // windows helper (pre-build it for your installer)
  compileHelper, HELPER_CS_SOURCE, HELPER_VERSION,
  // internals exported for tests
  _internal: { errorMayHavePrinted, toBuffer, wrapText, daemonPrint, killDaemon },
};

// ============================================================================================
// 9. CLI + LOCAL HTTP BRIDGE
// ============================================================================================
if (isNode && require.main === module) {
  const [cmd = 'help', arg, arg2] = process.argv.slice(2);
  configure({ logger: (l) => console.log(l) });
  const done = (code = 0) => { shutdown(); process.exit(code); };
  (async () => {
    if (cmd === 'list') {
      const list = await listPrinters({ fresh: true });
      if (!list.length) console.log('No printers found.');
      for (const p of list) console.log(`${p.isDefault ? '*' : ' '} ${p.name}${p.isThermal ? '  [thermal]' : ''}${p.isVirtual ? '  [virtual - never used]' : ''}${p.offline ? '  [offline]' : ''}  ${p.port || ''}`);
      console.log(`\nAuto-selected: ${(await resolvePrinter('')) || '(none)'}`);
      return done();
    }
    if (cmd === 'test') {
      const r = await print(testSlip({ paper: arg2 }), { printer: arg || '' });
      console.log(r);
      return done(r.success ? 0 : 1);
    }
    if (cmd === 'drawer') {
      const r = await openCashDrawer({ printer: arg || '' });
      console.log(r);
      return done(r.success ? 0 : 1);
    }
    if (cmd === 'health') {
      console.log(await getPrinterHealth(arg || ''));
      return done();
    }
    if (cmd === 'build-helper') {
      if (!isWin) { console.log('build-helper must run on Windows.'); return done(1); }
      const out = nodeRequire('path').resolve(arg || 'uprint-helper.exe');
      await compileHelper(out);
      console.log(`Built ${out}. Ship it and call configure({ helperExePath: '<path>' }).`);
      return done();
    }
    if (cmd === 'serve') {
      const http = nodeRequire('http');
      const port = parseInt(arg || '9333', 10);
      http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (req.method === 'GET' && url.pathname === '/printers') return listPrinters().then((l) => reply(200, l));
        if (req.method === 'GET' && url.pathname === '/health') return getPrinterHealth(url.searchParams.get('printer') || '').then((h) => reply(200, h));
        if (req.method === 'POST' && url.pathname === '/print') {
          const chunks = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            print(Buffer.concat(chunks), {
              printer: url.searchParams.get('printer') || '',
              jobId: url.searchParams.get('jobId') || undefined,
              force: url.searchParams.get('force') === '1',
            }).then((r) => reply(r.success ? 200 : 500, r));
          });
          return;
        }
        reply(404, { error: 'Use POST /print?printer=&jobId= (body = ESC/POS bytes), GET /printers, GET /health?printer=' });
      }).listen(port, '127.0.0.1', () => console.log(`Print bridge on http://127.0.0.1:${port}`));
      process.on('SIGINT', () => done());
      return;
    }
    console.log('Usage: node universal-printer.cjs list | test [printer] [58mm|80mm] | health [printer] | drawer [printer] | build-helper out.exe | serve [port]');
    return done();
  })().catch((e) => { console.error(e); done(1); });
}
