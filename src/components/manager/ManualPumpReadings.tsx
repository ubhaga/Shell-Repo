import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Section, CurrencyDisplay } from '@/components/ui/CashupUI';
import { format, subDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { parsePumpVariance } from '@/lib/fuelReportParser';

// The 14 pumps as defined in the spreadsheet
export const PUMP_DEFINITIONS = [
  { key: 'p1', label: 'Diesel P1' },
  { key: 'p2', label: 'Diesel P2' },
  { key: 'p3', label: 'ULP 95 P3' },
  { key: 'p4', label: 'ULP 95 P4' },
  { key: 'p5', label: 'Diesel P5' },
  { key: 'p6', label: 'Diesel P6' },
  { key: 'p7', label: 'ULP 95 P7' },
  { key: 'p8', label: 'ULP 95 P8' },
  { key: 'p9', label: 'VPD P9' },
  { key: 'p10', label: 'VPD P10' },
  { key: 'p11', label: 'ULP 95 P11' },
  { key: 'p12', label: 'ULP 95 P12' },
  { key: 'p13', label: 'ULP 93 P13' },
  { key: 'p14', label: 'ULP 93 P14' },
] as const;

type PumpKey = typeof PUMP_DEFINITIONS[number]['key'];
type Readings = Partial<Record<PumpKey, number>>;

interface ReadingRow {
  id: string;
  date: string;
  month: string;
  readings: Readings;
}

interface Props {
  selectedDate: string;
}

export function ManualPumpReadings({ selectedDate }: Props) {
  const [allReadings, setAllReadings] = useState<ReadingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eodPumpData, setEodPumpData] = useState<Record<string, Record<number, number>>>({});
  const month = selectedDate.slice(0, 7);
  // We also need the previous month's last day for opening readings
  const prevMonthLastDay = format(subDays(parseISO(month + '-01'), 1), 'yyyy-MM-dd');
  const prevMonth = prevMonthLastDay.slice(0, 7);

  const load = useCallback(async () => {
    setLoading(true);
    // Load current + previous month readings (for opening balance)
    const { data } = await supabase
      .from('manual_pump_readings')
      .select('*')
      .or(`month.eq.${month},month.eq.${prevMonth}`)
      .order('date');

    // Load EOD pump data for comparison
    const { data: eodData } = await supabase
      .from('day_end_uploads')
      .select('content, date')
      .eq('month', month)
      .order('date');

    if (data) {
      setAllReadings(data.map(r => ({
        id: r.id,
        date: r.date,
        month: r.month,
        readings: (r.readings as Readings) ?? {},
      })));
    }

    // Parse EOD data to get pump readings keyed by date and pump number
    if (eodData) {
      const parsed: Record<string, Record<number, number>> = {};
      for (const d of eodData) {
        const rows = parsePumpVariance(d.content);
        if (rows.length > 0) {
          parsed[d.date] = {};
          for (const r of rows) {
            // endReading is the cumulative meter reading
            parsed[d.date][r.pumpNo] = r.endReading;
          }
        }
      }
      setEodPumpData(parsed);
    }

    setLoading(false);
  }, [month, prevMonth]);

  useEffect(() => { load(); }, [load]);

  const currentDayReading = allReadings.find(r => r.date === selectedDate);
  const currentReadings: Readings = currentDayReading?.readings ?? {};

  // Get previous day reading for volume calculation
  const prevDate = format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd');
  const prevDayReading = allReadings.find(r => r.date === prevDate);
  const prevReadings: Readings = prevDayReading?.readings ?? {};

  const handleChange = async (pumpKey: PumpKey, value: number) => {
    const newReadings = { ...currentReadings, [pumpKey]: value };
    setSaving(true);

    if (currentDayReading) {
      await supabase
        .from('manual_pump_readings')
        .update({ readings: newReadings as unknown as Record<string, unknown>, updated_at: new Date().toISOString() } as never)
        .eq('id', currentDayReading.id);
      setAllReadings(prev => prev.map(r => r.id === currentDayReading.id ? { ...r, readings: newReadings } : r));
    } else {
      const { data } = await supabase
        .from('manual_pump_readings')
        .insert({ date: selectedDate, month, readings: newReadings as unknown as Record<string, unknown> } as never)
        .select()
        .single();
      if (data) {
        setAllReadings(prev => [...prev, { id: (data as any).id, date: selectedDate, month, readings: newReadings }]);
      }
    }
    setSaving(false);
  };

  const fmtV = (n: number) => n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // Get the pump index (1-based) from pumpKey
  const pumpIndex = (key: PumpKey) => parseInt(key.replace('p', ''));

  if (loading) return <div className="py-4 text-center text-muted-foreground text-sm">Loading pump readings...</div>;

  return (
    <Section title="4. Manual Pump Readings" color="default">
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground mb-2">
          Capture daily cumulative meter readings per pump. Volume = Today's reading − Yesterday's reading.
          {saving && <span className="ml-2 text-primary font-medium">Saving...</span>}
        </p>
        <Tabs defaultValue="p1">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
            {PUMP_DEFINITIONS.map(p => (
              <TabsTrigger key={p.key} value={p.key} className="text-xs px-2 py-1 h-7 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {p.label.replace(/\s+P/, ' P')}
              </TabsTrigger>
            ))}
          </TabsList>
          {PUMP_DEFINITIONS.map(pump => {
            const reading = currentReadings[pump.key] ?? 0;
            const prevReading = prevReadings[pump.key] ?? 0;
            const volume = reading > 0 && prevReading > 0 ? reading - prevReading : 0;
            const pIdx = pumpIndex(pump.key);
            const eodReading = eodPumpData[selectedDate]?.[pIdx];
            const hasEod = eodReading !== undefined;
            const eodMatch = hasEod && Math.abs((eodReading ?? 0) - reading) < 1;

            // Monthly summary for this pump
            const monthDays = allReadings
              .filter(r => r.month === month)
              .sort((a, b) => a.date.localeCompare(b.date));

            return (
              <TabsContent key={pump.key} value={pump.key} className="mt-2">
                <div className="space-y-3">
                  {/* Current day input */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/20 rounded-lg p-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Today's Reading</label>
                      <input
                        type="number"
                        value={reading || ''}
                        onChange={e => handleChange(pump.key, parseInt(e.target.value) || 0)}
                        className="input-cell w-full mt-0.5 text-right"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Yesterday's Reading</label>
                      <div className="input-cell w-full mt-0.5 text-right bg-muted/30 py-1 px-2 rounded text-sm">
                        {prevReading > 0 ? fmtV(prevReading) : '—'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Volume (Litres)</label>
                      <div className={`input-cell w-full mt-0.5 text-right font-semibold py-1 px-2 rounded text-sm ${volume < 0 ? 'text-red-600' : ''}`}>
                        {volume !== 0 ? fmtV(volume) : '—'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">EOD Reading</label>
                      <div className={`input-cell w-full mt-0.5 text-right py-1 px-2 rounded text-sm ${hasEod ? (eodMatch ? 'text-green-600' : 'text-red-600 font-semibold') : 'text-muted-foreground'}`}>
                        {hasEod ? fmtV(eodReading!) : 'No data'}
                      </div>
                    </div>
                  </div>

                  {/* Monthly table for this pump */}
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b">
                          <th className="px-2 py-1 text-left font-medium">Date</th>
                          <th className="px-2 py-1 text-right font-medium">Manual Reading</th>
                          <th className="px-2 py-1 text-right font-medium">Volume</th>
                          <th className="px-2 py-1 text-right font-medium">EOD Reading</th>
                          <th className="px-2 py-1 text-right font-medium">Diff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {monthDays.map((day, idx) => {
                          const r = day.readings[pump.key] ?? 0;
                          // Find previous day
                          const pDate = format(subDays(parseISO(day.date), 1), 'yyyy-MM-dd');
                          const pDay = allReadings.find(x => x.date === pDate);
                          const pr = pDay?.readings[pump.key] ?? 0;
                          const vol = r > 0 && pr > 0 ? r - pr : 0;
                          const eod = eodPumpData[day.date]?.[pIdx];
                          const diff = eod !== undefined && r > 0 ? r - eod : null;
                          const isToday = day.date === selectedDate;

                          return (
                            <tr key={day.date} className={`hover:bg-muted/20 ${isToday ? 'bg-primary/5 font-medium' : ''}`}>
                              <td className="px-2 py-1">{format(parseISO(day.date), 'EEE dd MMM')}</td>
                              <td className="px-2 py-1 text-right">{r > 0 ? fmtV(r) : '—'}</td>
                              <td className={`px-2 py-1 text-right ${vol < 0 ? 'text-red-600' : ''}`}>{vol !== 0 ? fmtV(vol) : '—'}</td>
                              <td className="px-2 py-1 text-right">{eod !== undefined ? fmtV(eod) : '—'}</td>
                              <td className={`px-2 py-1 text-right ${diff !== null && Math.abs(diff) >= 1 ? 'text-red-600 font-semibold' : diff !== null ? 'text-green-600' : ''}`}>
                                {diff !== null ? fmtV(diff) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </Section>
  );
}
