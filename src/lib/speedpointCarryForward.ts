import { supabase } from '@/integrations/supabase/client';
import type { DailyCashup } from '@/types/cashup';

export type OutstandingSp = { date: string; terminal: string; batchNo: string; diff: number };

const START_MONTH = '2026-02'; // Feb leftovers form March's opening (March 2026 is the seed month)

function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo, 1));
  return d.toISOString().slice(0, 7);
}

async function loadAll<T>(table: string, cols: string, month: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from(table as never).select(cols).eq('month', month).range(from, from + 999);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/**
 * Speedpoint differences still outstanding at the END of `uptoMonth`,
 * rolled forward month by month so leftovers from older months keep carrying.
 */
export async function computeSpeedpointOutstanding(
  uptoMonth: string,
  cashups: DailyCashup[],
  terminals: string[],
): Promise<OutstandingSp[]> {
  if (uptoMonth < START_MONTH) return [];
  const { data: unm } = await supabase.from('speedpoint_auto_unmatches').select('bank_line_id').range(0, 9999);
  const unmatched = new Set(((unm ?? []) as { bank_line_id: string }[]).map(r => r.bank_line_id));
  const termNum: Record<string, string> = {};
  terminals.forEach(t => { const m = t.match(/(\d{6})/); if (m) termNum[t] = m[1]; });

  let carry: OutstandingSp[] = [];
  for (let m = START_MONTH; m <= uptoMonth; m = nextMonth(m)) {
    const [bank, manual, clear] = await Promise.all([
      loadAll<{ id: string; matched_terminal: string; amount: number; description: string }>('bank_statement_lines', 'id, matched_terminal, amount, description', m),
      loadAll<{ cashup_date: string; terminal: string; bank_amount: number }>('speedpoint_manual_matches', 'cashup_date, terminal, bank_amount', m),
      loadAll<{ terminal: string; date_1: string; date_2: string }>('speedpoint_diff_clearances', 'terminal, date_1, date_2', m),
    ]);
    const manualSum: Record<string, number> = {};
    manual.forEach(r => { const k = `${r.cashup_date}|${r.terminal}`; manualSum[k] = (manualSum[k] || 0) + Number(r.bank_amount); });
    const cleared = (date: string, t: string) => clear.some(c => c.terminal === t && (c.date_1 === date || c.date_2 === date));

    // Roll prior outstanding through this month's OB matches/clearances
    const next: OutstandingSp[] = [];
    carry.forEach(o => {
      const obDate = `OB-${o.date}`;
      if (cleared(obDate, o.terminal)) return;
      const rem = o.diff - (manualSum[`${obDate}|${o.terminal}`] || 0);
      if (Math.abs(rem) > 0.01) next.push({ ...o, diff: rem });
    });

    // This month's own days
    const lookup: Record<string, number> = {};
    bank.forEach(l => {
      if (!terminals.includes(l.matched_terminal) || unmatched.has(l.id)) return;
      const bm = l.description.match(new RegExp(`${termNum[l.matched_terminal] || ''}\\s+(\\d+)`));
      if (!bm) return;
      const k = `${l.matched_terminal}|${bm[1]}`;
      lookup[k] = (lookup[k] || 0) + Number(l.amount);
    });
    const consumed = new Set<string>();
    cashups.filter(c => c.month === m).sort((a, b) => a.date.localeCompare(b.date)).forEach(c => {
      const tm: Record<string, { batch: string; total: number }> = {};
      c.shop.speedpoints.forEach(sp => { const v = (tm[sp.terminal] ??= { batch: '', total: 0 }); v.batch = sp.batchNo || v.batch; v.total += sp.shopAmount || 0; });
      c.opt.speedpoints.forEach(sp => { const v = (tm[sp.terminal] ??= { batch: '', total: 0 }); v.batch = sp.batchNo || v.batch; v.total += sp.optAmount || 0; });
      terminals.forEach(t => {
        const td = tm[t];
        if (!td || td.total === 0) return;
        const key = `${t}|${td.batch}`;
        let bankAmt = 0;
        if (!consumed.has(key)) { bankAmt = lookup[key] ?? 0; if (bankAmt > 0) consumed.add(key); }
        bankAmt += manualSum[`${c.date}|${t}`] || 0;
        const diff = td.total - bankAmt;
        if (Math.abs(diff) <= 0.01 || cleared(c.date, t)) return;
        next.push({ date: c.date, terminal: t, batchNo: td.batch, diff });
      });
    });
    carry = next;
  }
  return carry;
}
