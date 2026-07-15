export function parseBankStatementDate(dateStr: string): string | null {
  const normalized = dateStr.trim();

  if (!normalized) return null;

  const isoLikeMatch = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoLikeMatch) {
    const [, year, month, day] = isoLikeMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const slashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    const n1 = parseInt(a, 10);
    const n2 = parseInt(b, 10);
    // Disambiguate: if second > 12 it must be day → m/d/yyyy;
    // if first > 12 it must be day → d/m/yyyy; otherwise default to d/m/yyyy.
    let day: string;
    let month: string;
    if (n2 > 12 && n1 <= 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

export function parseBankStatementDateToDate(dateStr: string): Date | null {
  const isoDate = parseBankStatementDate(dateStr);
  if (!isoDate) return null;

  const parsed = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
