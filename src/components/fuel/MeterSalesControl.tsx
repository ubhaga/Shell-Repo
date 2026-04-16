import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parsePumpVariance, type PumpVarianceRow } from '@/lib/fuelReportParser';
import { format, subDays, parseISO } from 'date-fns';
import { useMasterDataStore, getTankColor } from '@/store/masterDataStore';

interface Props {
  selectedDate: string;
}

interface DayPumpData {
  date: string;
  rows: PumpVarianceRow[];
}

type Readings = Record<string, number>;

const MANUAL_CUTOFF = '2026-04-01';

export function MeterSalesControl({ selectedDate }: Props) {
  const [dayData, setDayData] = useState<DayPumpData[]>([]);
  const [readingsByDate, setReadingsByDate] = useState<Record<string, Readings>>({});
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tanks = useMasterDataStore(s => s.tanks);
  const month = selectedDate.slice(0, 7);
  const prevMonth = format(subDays(parseISO(month + '-01'), 1), 'yyyy-MM');

  const load = useCallback(async () => {
    setLoading(true);
    const [uploadsRes, readingsRes] = await Promise.all([
      supabase.from('day_end_uploads').select('content, date').eq('month', month).order('date'),
      supabase.from('manual_pump_readings').select('date, readings').or(`month.eq.${month},month.eq.${prevMonth}`),
    ]);

    if (uploadsRes.data) {
      const parsed: DayPumpData[] = uploadsRes.data.map(d => ({
        date: d.date,
        rows: parsePumpVariance(d.content),
      })).filter(d => d.rows.length > 0);
      setDayData(parsed);
    } else {
      setDayData([]);
    }

    const map: Record<string, Readings> = {};
    (readingsRes.data ?? []).forEach(r => {
      map[r.date] = (r.readings as Readings) ?? {};
    });
    setReadingsByDate(map);

    setLoading(false);
  }, [month, prevMonth]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>;
  if (dayData.length === 0) return <div className="py-8 text-center text-muted-foreground text-sm">No pump variance data found. Upload Day End Reports first.</div>;

  const fmtV = (n: number) => n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getManualVol = (date: string, pumpNo: string): number | null => {
    if (date < MANUAL_CUTOFF) return null;
    const today = readingsByDate[date];
    if (!today) return null;
    const prevDate = format(subDays(parseISO(date), 1), 'yyyy-MM-dd');
    const prev = readingsByDate[prevDate];
    if (!prev) return null;
    // pumpNo from report e.g. "1", "01", "P1" → key "p1"
    const num = String(pumpNo).replace(/\D/g, '').replace(/^0+/, '') || pumpNo;
    const key = `p${num}`;
    const t = today[key];
    const p = prev[key];
    if (t == null || p == null || t === 0 || p === 0) return null;
    return t - p;
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-lg">
        <div className="px-4 py-2 bg-muted/50 border-b">
          <h3 className="text-sm font-semibold">EOD Pump Variance — {format(new Date(month + '-01'), 'MMMM yyyy')}</h3>
          <p className="text-xs text-muted-foreground">Meter readings per pump per day. Click a day to expand.</p>
        </div>
        <div className="divide-y">
          {dayData.map(day => {
            const totalVariance = day.rows.reduce((s, r) => s + r.volumeVariance, 0);
            const isExpanded = expandedDate === day.date;
            const showManual = day.date >= MANUAL_CUTOFF;
            return (
              <div key={day.date}>
                <button
                  onClick={() => setExpandedDate(isExpanded ? null : day.date)}
                  className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/30"
                >
                  <span className="font-medium">{format(new Date(day.date), 'EEE dd MMM')}</span>
                  <span className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{day.rows.length} pumps</span>
                    <span className={`text-xs font-semibold ${totalVariance < 0 ? 'text-red-600' : totalVariance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      Var: {fmtV(totalVariance)}L
                    </span>
                  </span>
                </button>
                {isExpanded && (
                  <div className="overflow-x-auto border-t bg-muted/10">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40">
                          <th className="px-2 py-1 text-left font-medium">Pump</th>
                          <th className="px-2 py-1 text-left font-medium">Grade</th>
                          <th className="px-2 py-1 text-right font-medium">Start</th>
                          <th className="px-2 py-1 text-right font-medium">End</th>
                          <th className="px-2 py-1 text-right font-medium">Calc Vol</th>
                          <th className="px-2 py-1 text-right font-medium">Actual Vol</th>
                          <th className="px-2 py-1 text-right font-medium">Variance</th>
                          {showManual && <th className="px-2 py-1 text-right font-medium">Calc Vol (Manual)</th>}
                          {showManual && <th className="px-2 py-1 text-right font-medium">Variance (Manual)</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {day.rows.map((r, i) => {
                          const manualVol = showManual ? getManualVol(day.date, r.pumpNo) : null;
                          const manualVar = manualVol != null ? r.actualVolume - manualVol : null;
                          return (
                            <tr key={i} className="hover:bg-muted/20">
                              <td className="px-2 py-1">{r.pumpNo}</td>
                              <td className="px-2 py-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: getTankColor(tanks, r.gradeId) || getTankColor(tanks, r.gradeDescription) || '#94a3b8' }} />
                                  {r.gradeDescription}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-right">{fmtV(r.startReading)}</td>
                              <td className="px-2 py-1 text-right">{fmtV(r.endReading)}</td>
                              <td className={`px-2 py-1 text-right ${r.calculatedVolume < 0 ? 'text-red-600 font-semibold bg-red-50' : ''}`}>
                                {r.calculatedVolume < 0 && <span className="mr-1">⚠</span>}
                                {fmtV(r.calculatedVolume)}
                              </td>
                              <td className="px-2 py-1 text-right">{fmtV(r.actualVolume)}</td>
                              <td className={`px-2 py-1 text-right font-medium ${r.volumeVariance < 0 ? 'text-red-600' : r.volumeVariance > 0 ? 'text-amber-600' : ''}`}>
                                {fmtV(r.volumeVariance)}
                              </td>
                              {showManual && (
                                <td className="px-2 py-1 text-right">{manualVol != null ? fmtV(manualVol) : '—'}</td>
                              )}
                              {showManual && (
                                <td className={`px-2 py-1 text-right font-medium ${manualVar != null && manualVar < 0 ? 'text-red-600' : manualVar != null && manualVar > 0 ? 'text-amber-600' : ''}`}>
                                  {manualVar != null ? fmtV(manualVar) : '—'}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/40 font-semibold">
                          <td colSpan={4} className="px-2 py-1">Total</td>
                          <td className="px-2 py-1 text-right">{fmtV(day.rows.reduce((s, r) => s + r.calculatedVolume, 0))}</td>
                          <td className="px-2 py-1 text-right">{fmtV(day.rows.reduce((s, r) => s + r.actualVolume, 0))}</td>
                          <td className={`px-2 py-1 text-right ${totalVariance < 0 ? 'text-red-600' : 'text-amber-600'}`}>{fmtV(totalVariance)}</td>
                          {showManual && (() => {
                            const totals = day.rows.reduce((acc, r) => {
                              const mv = getManualVol(day.date, r.pumpNo);
                              if (mv != null) {
                                acc.manual += mv;
                                acc.var += r.actualVolume - mv;
                                acc.has = true;
                              }
                              return acc;
                            }, { manual: 0, var: 0, has: false });
                            return (
                              <>
                                <td className="px-2 py-1 text-right">{totals.has ? fmtV(totals.manual) : '—'}</td>
                                <td className={`px-2 py-1 text-right ${totals.var < 0 ? 'text-red-600' : totals.var > 0 ? 'text-amber-600' : ''}`}>
                                  {totals.has ? fmtV(totals.var) : '—'}
                                </td>
                              </>
                            );
                          })()}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
