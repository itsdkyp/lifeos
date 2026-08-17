/**
 * Broker report importers. Handles Groww Stocks + MF today; add adapters here
 * for Ind Money, Zerodha, Fidelity, etc. Each adapter returns a normalized
 * NormHolding[] that the /holdings/import route inserts.
 */
import * as XLSX from "xlsx";

export type NormHolding = {
  symbol: string;
  kind: "stock" | "etf" | "crypto" | "mf";
  shares: number;
  cost_basis: number;         // per unit
  currency: string;
  note?: string;
  isin?: string;              // for cross-format deduplication (e.g. Holdings Statement vs Order History)
  manual_price?: number;      // fallback current price from the report
  imported_from: string;
};

export type ImportResult = { source: string; imported: number; skipped: number; holdings: NormHolding[] };

// A single executed BUY/SELL row from an order-history export. Unlike NormHolding
// (an absolute snapshot), a trade is a DELTA — applied against whatever the position
// already is. This matters because order-history exports are date-range-bounded
// ("orders from 01-04-2026 to 02-08-2026"), not a full point-in-time snapshot like a
// Holdings Statement. Treating it as a snapshot would either double-count existing
// shares (plain insert) or delete pre-window holdings entirely (replace mode).
export type NormTrade = {
  symbol: string; kind: "stock" | "etf" | "mf"; side: "BUY" | "SELL";
  qty: number; price: number; currency: string; note?: string;
  isin?: string;  // for cross-format deduplication
  // Epoch ms of the trade, for chronological ordering. Order-history exports aren't
  // always oldest-first (MF exports are newest-first), so applying in file order can
  // process a SELL before its BUY — the caller sorts by this before applying.
  ts?: number;
  // Broker's own unique order ID, when the source provides one. Lets the caller
  // dedup against re-imports of the same (or an overlapping) export — without this,
  // uploading the same file twice silently double-applies every trade.
  orderId?: string;
};
export type OrderImportResult = { source: string; imported: number; skipped: number; trades: NormTrade[] };

/** Sniff the file and route to the correct adapter. */
export function importBrokerFile(buf: ArrayBuffer, filename: string): ImportResult | OrderImportResult {
  const wb = XLSX.read(buf, { type: "array" });
  const sheets = wb.SheetNames;

  // Groww Stocks Holdings Statement
  const stockSheet = sheets.find(n => /holdings/i.test(n)) ?? sheets[0]!;
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[stockSheet]!, { header: 1, blankrows: false }) as any[][];

  // Mutual Funds ORDER HISTORY — must be checked BEFORE the IndMoney orders check
  // because IndMoney's rowsContain trigger matches "Transaction Type" which also
  // appears in Groww MF order history (false positive). Filename is the reliable signal.
  if (/Mutual_Funds.*Order_History|Mutual_Funds.*Transaction/i.test(filename)
      || (rowsContain(rows, "Scheme Name") && rowsContain(rows, "Transaction Type") && !rowsContain(rows, "Order Amount"))) {
    return { source: "groww_mf_orders", ...parseGrowwMFOrders(rows) };
  }
  if (/IND[-_]?ORDER/i.test(filename) || sheets.includes("ORDER_BOOK") || rowsContain(rows, "Transaction Type", "Order Amount")) {
    return { source: "indmoney_us", ...parseIndMoneyOrders(rows) };
  }
  // Groww Stock ORDER HISTORY (per-trade log) — must be checked BEFORE the Holdings
  // Statement check below, since both share "Stock name"/"ISIN" header cells and would
  // otherwise be misrouted into parseGrowwStocks (whose column layout is completely
  // different — that's the exact bug that made every row "skipped" with 0 imported).
  if (/Stocks.*Order_History|Order_History.*Stocks/i.test(filename) || rowsContain(rows, "Execution date and time", "Exchange Order Id")) {
    return { source: "groww_stock_orders", ...parseGrowwStockOrders(rows) };
  }
  if (/Stocks_Holdings|Holdings_Statement/i.test(filename) || rowsContain(rows, "Stock Name", "ISIN")) {
    return { source: "groww_stocks", ...parseGrowwStocks(rows) };
  }
  if (/Mutual_Funds/i.test(filename) || rowsContain(rows, "Scheme Name")) {
    return { source: "groww_mf", ...parseGrowwMF(rows) };
  }
  throw new Error(`Unknown broker file format. Sheets: ${sheets.join(", ")}. Expected Groww Stocks, Groww MF, Groww Order History, Ind Money Holdings, or Ind Money Orders.`);
}

function rowsContain(rows: any[][], ...needles: string[]): boolean {
  for (const r of rows.slice(0, 30)) {
    for (const cell of r ?? []) {
      if (typeof cell === "string" && needles.some(n => cell.toLowerCase().includes(n.toLowerCase()))) return true;
    }
  }
  return false;
}

function num(v: any): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// "13-04-2026 09:54 AM" (DD-MM-YYYY, optional time) — Groww stock order history.
// Date.parse can't handle DD-MM-YYYY reliably, so parse explicitly.
function parseDmyDate(v: any): number | undefined {
  const m = String(v ?? "").match(/(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);
  if (!m) return undefined;
  const [, dd, mm, yyyy, hh, min, ap] = m;
  let h = hh ? parseInt(hh) : 0;
  if (ap?.toUpperCase() === "PM" && h < 12) h += 12;
  if (ap?.toUpperCase() === "AM" && h === 12) h = 0;
  return new Date(+yyyy, +mm - 1, +dd, h, min ? +min : 0).getTime();
}

// "03 Aug 2026" (DD Mon YYYY) — Groww MF order history. Date.parse handles this natively.
function parseTextDate(v: any): number | undefined {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : undefined;
}

// ══════════════════════════════════════════════════════════════════
//  Groww Stocks Holdings
//  Header row: Stock Name | ISIN | Quantity | Average buy price |
//              Buy value  | Closing price | Closing value | Unrealised P&L
// ══════════════════════════════════════════════════════════════════
function parseGrowwStocks(rows: any[][]): { imported: number; skipped: number; holdings: NormHolding[] } {
  const headerIdx = rows.findIndex(r => r?.some(c => typeof c === "string" && /stock name/i.test(c)));
  if (headerIdx < 0) throw new Error("Groww Stocks: header row not found");
  const out: NormHolding[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.length === 0) continue;
    const [name, isin, qty, avg, , close] = r;
    const shares = num(qty);
    const cost = num(avg);
    if (!name || !shares || !cost) { skipped++; continue; }
    out.push({
      symbol: String(name).trim().split(/\s+/).slice(0, 2).join(" "),  // short-name; user can edit
      kind: /ETF|BEES|GOLD|SILVER/i.test(String(name)) ? "etf" : "stock",
      shares, cost_basis: cost,
      currency: "INR",
      isin: isin ? String(isin).trim() : undefined,
      manual_price: num(close) ?? undefined,
      note: `Groww · ${String(name).trim()}${isin ? ` · ${isin}` : ""}`,
      imported_from: "groww_stocks",
    });
  }
  return { imported: out.length, skipped, holdings: out };
}

// ══════════════════════════════════════════════════════════════════
//  Groww Stock ORDER HISTORY (per-trade log, not a snapshot)
//  Header row: Stock name | Symbol | ISIN | Type | Quantity | Value |
//              Exchange | Exchange Order Id | Execution date and time | Order status
//  "Value" is the TOTAL trade value, not a per-share price — divide by Quantity.
// ══════════════════════════════════════════════════════════════════
function parseGrowwStockOrders(rows: any[][]): { imported: number; skipped: number; trades: NormTrade[] } {
  const headerIdx = rows.findIndex(r => r?.some(c => typeof c === "string" && /execution date/i.test(c)));
  if (headerIdx < 0) throw new Error("Groww Order History: header row not found");
  const out: NormTrade[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.length === 0) continue;
    const [name, symbolCol, isin, type, qtyRaw, valueRaw, , orderId, execDate, status] = r;
    if (typeof name !== "string" || !name.trim()) { skipped++; continue; }
    if (typeof status === "string" && !/executed/i.test(status)) { skipped++; continue; } // e.g. rejected/cancelled
    const side = String(type ?? "").toUpperCase();
    if (side !== "BUY" && side !== "SELL") { skipped++; continue; }
    const qty = num(qtyRaw), value = num(valueRaw);
    if (!qty || !value) { skipped++; continue; }
    const symbol = (typeof symbolCol === "string" && symbolCol.trim()) ? symbolCol.trim().toUpperCase() : String(name).trim().toUpperCase();
    out.push({
      symbol,
      kind: /ETF|BEES|GOLD|SILVER/i.test(String(name)) ? "etf" : "stock",
      side: side as "BUY" | "SELL",
      qty,
      price: value / qty,
      currency: "INR",
      isin: typeof isin === "string" && isin.trim() ? isin.trim() : undefined,
      ts: parseDmyDate(execDate),
      note: `Groww (Order History) · ${String(name).trim()}${isin ? ` · ${isin}` : ""}`,
      orderId: orderId != null ? String(orderId) : undefined,
    });
  }
  return { imported: out.length, skipped, trades: out };
}

// ══════════════════════════════════════════════════════════════════
//  Groww Mutual Fund ORDER HISTORY (per-transaction log, not a snapshot)
//  Sheet: Transactions
//  Header row: Scheme Name | Transaction Type | Units | NAV | Amount | Date
//  Transaction Type: PURCHASE (BUY) or REDEEM (SELL)
//  No unique broker order ID; composite key = scheme_name|date|type|units for dedup.
// ══════════════════════════════════════════════════════════════════
function parseGrowwMFOrders(rows: any[][]): { imported: number; skipped: number; trades: NormTrade[] } {
  // The sheet may have personal-details header rows before the real header.
  const headerIdx = rows.findIndex(r => r?.some(c => typeof c === "string" && /scheme name/i.test(c)));
  if (headerIdx < 0) throw new Error("Groww MF Order History: 'Scheme Name' header row not found");
  const out: NormTrade[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.length === 0) continue;
    const [schemeName, txType, unitsRaw, navRaw, , dateRaw] = r;
    if (typeof schemeName !== "string" || !schemeName.trim()) { skipped++; continue; }
    const typeStr = String(txType ?? "").toUpperCase();
    const side = typeStr === "PURCHASE" ? "BUY" : typeStr === "REDEEM" ? "SELL" : null;
    if (!side) { skipped++; continue; }
    const units = num(unitsRaw);
    const nav   = num(navRaw);
    if (!units || !nav) { skipped++; continue; }
    // Composite dedup key: no broker-issued order ID exists in this export.
    // scheme|date|type|units is stable for a given transaction.
    const orderId = `${schemeName.trim()}|${String(dateRaw ?? "").trim()}|${typeStr}|${units}`;
    out.push({
      symbol: schemeName.trim(),
      kind: "mf",
      side: side as "BUY" | "SELL",
      qty: units,
      price: nav,
      currency: "INR",
      note: `Groww (MF Order History) · ${schemeName.trim()}`,
      ts: parseTextDate(dateRaw),
      orderId,
    });
  }
  return { imported: out.length, skipped, trades: out };
}

// ══════════════════════════════════════════════════════════════════
//  Groww Mutual Funds
//  Header row: Scheme Name | AMC | Category | Sub-category | Folio No. |
//              Source | Units | Invested Value | Current Value | Returns
// ══════════════════════════════════════════════════════════════════
function parseGrowwMF(rows: any[][]): { imported: number; skipped: number; holdings: NormHolding[] } {
  const headerIdx = rows.findIndex(r => r?.some(c => typeof c === "string" && /scheme name/i.test(c)));
  if (headerIdx < 0) throw new Error("Groww MF: header row not found");
  const out: NormHolding[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.length === 0) continue;
    // Some rows only have folio/units — skip those (they're summary continuation rows).
    const name  = r[0];
    const amc   = r[1];
    const cat   = r[2];
    const subcat= r[3];
    if (typeof name !== "string" || !name.trim()) { skipped++; continue; }
    const units    = num(r[6]);
    const invested = num(r[7]);
    const current  = num(r[8]);
    if (!units || !invested) { skipped++; continue; }
    out.push({
      symbol: String(name).trim(),   // full name; needed to disambiguate Direct/Growth vs IDCW variants
      kind: "mf",
      shares: units,
      cost_basis: invested / units,   // NAV at buy
      currency: "INR",
      manual_price: current && units ? current / units : undefined,
      note: `Groww · ${amc ?? ""}${cat ? ` · ${cat}` : ""}${subcat ? ` · ${subcat}` : ""}`.trim().replace(/^Groww · \s*$/, "Groww"),
      imported_from: "groww_mf",
    });
  }
  return { imported: out.length, skipped, holdings: out };
}

// ── Ind Money US stocks holdings (Broker=Alpaca) ────────────────────────────────
// Header row: Stock Symbol | Holding Since | Quantity | Avg. Price ($) | Total Value ($)
function parseIndMoneyUS(rows: any[][]): { imported: number; skipped: number; holdings: NormHolding[] } {
  const headerIdx = rows.findIndex(r => r?.some(c => typeof c === "string" && /stock symbol/i.test(c)));
  if (headerIdx < 0) throw new Error("Ind Money: 'Stock Symbol' header row not found");
  const out: NormHolding[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.length === 0) continue;
    const [sym, , qty, avg, total] = r;
    if (typeof sym !== "string") { skipped++; continue; }
    const symbol = sym.trim().toUpperCase();
    if (!symbol || symbol === "USD" || /disclaimer|note|source/i.test(symbol)) { skipped++; continue; }
    const shares = num(qty), cost = num(avg);
    if (!shares || !cost) { skipped++; continue; }
    out.push({
      symbol,
      kind: /^(QQQ|SPY|VOO|VTI|IVV|SCHD|VUG|VYM|TQQQ|SQQQ|SOXL|SOXX|ARKK)$/.test(symbol) ? "etf" : "stock",
      shares, cost_basis: cost,
      currency: "USD",
      manual_price: num(total) && shares ? num(total)! / shares : undefined,
      note: `Ind Money · Alpaca`,
      imported_from: "indmoney_us",
    });
  }
  return { imported: out.length, skipped, holdings: out };
}

// ── Ind Money US orders → aggregate to net positions ────────────────────────────────
function parseIndMoneyOrders(rows: any[][]): { imported: number; skipped: number; holdings: NormHolding[] } {
  const headerIdx = rows.findIndex(r => r?.some(c => typeof c === "string" && /stock symbol/i.test(c)));
  if (headerIdx < 0) throw new Error("Ind Money Orders: 'Stock Symbol' header row not found");

  type Pos = { name: string; buys: number; sells: number; buyAmount: number };
  const positions = new Map<string, Pos>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.length === 0) continue;
    const [name, symbol, , , , txType, , qty, , amount, brokerage] = r;
    if (typeof symbol !== "string" || !symbol.trim()) continue;
    const sym = symbol.trim().toUpperCase();
    const q = num(qty);
    if (!q) continue;
    const p = positions.get(sym) ?? { name: String(name ?? sym).trim(), buys: 0, sells: 0, buyAmount: 0 };
    const kind = String(txType ?? "").toUpperCase();
    if (kind === "BUY") {
      p.buys += q;
      p.buyAmount += (num(amount) ?? 0) + (num(brokerage) ?? 0);
    } else if (kind === "SELL") {
      p.sells += q;
    }
    positions.set(sym, p);
  }

  const out: NormHolding[] = [];
  let skipped = 0;
  const ETF_TICKERS = /^(QQQ|SPY|VOO|VTI|IVV|SCHD|VUG|VYM|TQQQ|SQQQ|SOXL|SOXX|ARKK|USD|USDT|DUST|NUGT|UPRO|XLK|XLF)$/;
  for (const [sym, p] of positions) {
    const netQty = p.buys - p.sells;
    if (netQty < 0.0001) { skipped++; continue; }  // fully sold
    const avgCost = p.buys > 0 ? p.buyAmount / p.buys : 0;
    out.push({
      symbol: sym,
      kind: ETF_TICKERS.test(sym) ? "etf" : "stock",
      shares: netQty,
      cost_basis: avgCost,
      currency: "USD",
      note: `Ind Money · Alpaca · ${p.name}`,
      imported_from: "indmoney_us",
    });
  }
  return { imported: out.length, skipped, holdings: out };
}
