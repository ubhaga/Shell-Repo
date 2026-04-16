/**
 * Extract the "Payouts" amount from the Daily Takings Summary section
 * of an uploaded day-end (.rpt) report.
 *
 * Example line:
 *   Payouts                -3162.01
 *
 * The amount in the report is negative — we return the absolute value
 * (i.e. amount * -1) which represents the cash payouts total to be used
 * in the cashier sheet.
 *
 * Returns null if no Payouts line is found.
 */
export function extractDayEndPayouts(content: string): number | null {
  if (!content) return null;
  // Restrict search to the "Daily Takings Summary" block to avoid false matches
  const idx = content.indexOf('Daily Takings Summary');
  const scope = idx >= 0 ? content.slice(idx, idx + 2000) : content;
  // Match lines like:  Payouts            -3162.01
  const m = scope.match(/^\s*Payouts\s+(-?[\d,]+\.\d{2})/m);
  if (!m) return null;
  const raw = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(raw)) return null;
  return Math.abs(raw); // payouts * -1
}
