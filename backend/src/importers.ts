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
  manual_price?: number;      // fallback current price from the report
  imported_from: string;
};

export type ImportResult = { source: string; imported: number; skipped: number; holdings: NormHolding[] };

/** Sniff the file and route to the correct adapter. */
export function importBrokerFile(buf: ArrayBuffer, filename: string): ImportResult {
  const wb = XLSX.read(buf, { type: "array" });
  const sheets = wb.SheetNames;

  // Groww Stocks Holdings Statement
  const stockSheet = sheets.find(n => /holdings/i.test(n)) ?? sheets[0]!;
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[stockSheet]!, { header: 1, blankrows: false }) as any[][];

  if (/IND[-_]?ORDER/i.test(filename) || sheets.includes("ORDER_BOOK") || rowsContain(rows, "Transaction Type", "Order Amount")) {
    return { source: "indmoney_us", ...parseIndMoneyOrders(rows) };
  }
  if (/IND[-_]?HOLDINGS/i.test(filename) || sheets.includes("HOLDINGS_BOOK") || (rowsContain(rows, "Broker Name", "Alpaca") && rowsContain(rows, "Holdings"))) {
    return { source: "indmoney_us", ...parseIndMoneyUS(rows) };
  }
  if (/Stocks_Holdings|Holdings_Statement/i.test(filename) || rowsContain(rows, "Stock Name", "ISIN")) {
    return { source: "groww_stocks", ...parseGrowwStocks(rows) };
  }
  if (/Mutual_Funds/i.test(filename) || rowsContain(rows, "Scheme Name")) {
    return { source: "groww_mf", ...parseGrowwMF(rows) };
  }
  throw new Error(`Unknown broker file format. Sheets: ${sheets.join(", ")}. Expected Groww Stocks, Groww MF, Ind Money Holdings, or Ind Money Orders.`);
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
      manual_price: num(close) ?? undefined,
      note: `Groww · ${String(name).trim()}${isin ? ` · ${isin}` : ""}`,
      imported_from: "groww_stocks",
    });
  }
  return { imported: out.length, skipped, holdings: out };
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
