/**
 * Extract the "Total for : G.R.N. / TAX INVOICE" amounts from the
 * EOD Creditors Transactions section of an uploaded day-end (.rpt) report.
 *
 * Example line:
 *   Total for : G.R.N. / TAX INVOICE                       345407.13      369.92   345777.05
 *
 * Returns { incl, vat } or null if not found.
 */
export interface DayEndInvoiceTotals {
  incl: number;
  vat: number;
}

export function extractDayEndInvoiceTotals(content: string): DayEndInvoiceTotals | null {
  if (!content) return null;
  const idx = content.indexOf('EOD Creditors Transactions');
  const scope = idx >= 0 ? content.slice(idx, idx + 8000) : content;
  // Match: Total for : G.R.N. / TAX INVOICE  <excl>  <vat>  <incl>
  const m = scope.match(/Total for\s*:\s*G\.R\.N\.\s*\/\s*TAX INVOICE[^\d-]*(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})/i);
  if (!m) return null;
  const vat = parseFloat(m[2].replace(/,/g, ''));
  const incl = parseFloat(m[3].replace(/,/g, ''));
  if (isNaN(vat) || isNaN(incl)) return null;
  return { incl, vat };
}
