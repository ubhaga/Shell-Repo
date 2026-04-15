import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parsePumpVariance, parseBatchDate, type PumpVarianceRow } from '@/lib/fuelReportParser';
import { format, getDaysInMonth } from 'date-fns';
import { useMasterDataStore, getTankColor } from '@/store/masterDataStore';

interface Props {
  selectedDate: string;
}

interface DayPumpData {
  date: string;
  rows: PumpVarianceRow[];
}

export function MeterSalesControl({ selectedDate }: Props) {
  const [dayData, setDayData] = useState<DayPumpData[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tanks = useMasterDataStore(s => s.tanks);
  const month = selectedDate.slice(0, 7);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('day_end_uploads')
      .select('content, date')
      .eq('month', month)
      .order('date');

    if (data) {
      const parsed: DayPumpData[] = data.map(d => ({
        date: d.date,
        rows: parsePumpVariance(d.content),
      })).filter(d => d.rows.length > 0);
      setDayData(parsed);
    } else {
      setDayData([]);
    }
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>;
  if (dayData.length === 0) return <div className="py-8 text-center text-muted-foreground text-sm">No pump variance data found. Upload Day End Reports first.</div>;

  const fmtV = (n: number) => n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {day.rows.map((r, i) => (
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
                            <td className="px-2 py-1 text-right">{fmtV(r.calculatedVolume)}</td>
                            <td className="px-2 py-1 text-right">{fmtV(r.actualVolume)}</td>
                            <td className={`px-2 py-1 text-right font-medium ${r.volumeVariance < 0 ? 'text-red-600' : r.volumeVariance > 0 ? 'text-amber-600' : ''}`}>
                              {fmtV(r.volumeVariance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/40 font-semibold">
                          <td colSpan={4} className="px-2 py-1">Total</td>
                          <td className="px-2 py-1 text-right">{fmtV(day.rows.reduce((s, r) => s + r.calculatedVolume, 0))}</td>
                          <td className="px-2 py-1 text-right">{fmtV(day.rows.reduce((s, r) => s + r.actualVolume, 0))}</td>
                          <td className={`px-2 py-1 text-right ${totalVariance < 0 ? 'text-red-600' : 'text-amber-600'}`}>{fmtV(totalVariance)}</td>
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
