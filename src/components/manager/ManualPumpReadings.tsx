import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Section } from '@/components/ui/CashupUI';
import { format, subDays, parseISO } from 'date-fns';

export const PUMP_DEFINITIONS = [
  { key: 'p1', label: 'Diesel P1', tank: 'Tank 1 – Diesel' },
  { key: 'p2', label: 'Diesel P2', tank: 'Tank 1 – Diesel' },
  { key: 'p3', label: 'ULP 95 P3', tank: 'Tank 3 – ULP 95' },
  { key: 'p4', label: 'ULP 95 P4', tank: 'Tank 3 – ULP 95' },
  { key: 'p5', label: 'Diesel P5', tank: 'Tank 1 – Diesel' },
  { key: 'p6', label: 'Diesel P6', tank: 'Tank 1 – Diesel' },
  { key: 'p7', label: 'ULP 95 P7', tank: 'Tank 3 – ULP 95' },
  { key: 'p8', label: 'ULP 95 P8', tank: 'Tank 3 – ULP 95' },
  { key: 'p9', label: 'VPD P9', tank: 'Tank 4 – VPD' },
  { key: 'p10', label: 'VPD P10', tank: 'Tank 4 – VPD' },
  { key: 'p11', label: 'ULP 95 P11', tank: 'Tank 3 – ULP 95' },
  { key: 'p12', label: 'ULP 95 P12', tank: 'Tank 3 – ULP 95' },
  { key: 'p13', label: 'ULP 93 P13', tank: 'Tank 2 – ULP 93' },
  { key: 'p14', label: 'ULP 93 P14', tank: 'Tank 2 – ULP 93' },
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

const TANK_ORDER = ['Tank 1 – Diesel', 'Tank 2 – ULP 93', 'Tank 3 – ULP 95', 'Tank 4 – VPD'];

export function ManualPumpReadings({ selectedDate }: Props) {
  const [allReadings, setAllReadings] = useState<ReadingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const month = selectedDate.slice(0, 7);
  const prevMonthLastDay = format(subDays(parseISO(month + '-01'), 1), 'yyyy-MM-dd');
  const prevMonth = prevMonthLastDay.slice(0, 7);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('manual_pump_readings')
      .select('*')
      .or(`month.eq.${month},month.eq.${prevMonth}`)
      .order('date');
    if (data) {
      setAllReadings(data.map(r => ({
        id: r.id, date: r.date, month: r.month,
        readings: (r.readings as Readings) ?? {},
      })));
    }
    setLoading(false);
  }, [month, prevMonth]);

  useEffect(() => { load(); }, [load]);

  const currentDayReading = allReadings.find(r => r.date === selectedDate);
  const currentReadings: Readings = currentDayReading?.readings ?? {};
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

  // Calculate volumes per pump
  const getVolume = (key: PumpKey) => {
    const today = currentReadings[key] ?? 0;
    const prev = prevReadings[key] ?? 0;
    return today > 0 && prev > 0 ? today - prev : 0;
  };

  // Tank summary
  const tankSummary = TANK_ORDER.map(tank => {
    const pumps = PUMP_DEFINITIONS.filter(p => p.tank === tank);
    const totalVolume = pumps.reduce((sum, p) => sum + getVolume(p.key), 0);
    return { tank, pumps, totalVolume };
  });

  if (loading) return <div className="py-4 text-center text-muted-foreground text-sm">Loading pump readings...</div>;

  return (
    <Section title="4. Manual Pump Readings" color="default">
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground mb-2">
          Capture daily cumulative meter readings per pump. Volume = Today − Yesterday.
          {saving && <span className="ml-2 text-primary font-medium">Saving...</span>}
        </p>

        {/* Tabular readings */}
        <div className="overflow-x-auto border rounded-lg mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="px-2 py-1.5 text-left font-medium w-24">Pump</th>
                <th className="px-2 py-1.5 text-right font-medium">Yesterday</th>
                <th className="px-2 py-1.5 text-right font-medium">Today's Reading</th>
                <th className="px-2 py-1.5 text-right font-medium">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {PUMP_DEFINITIONS.map(pump => {
                const reading = currentReadings[pump.key] ?? 0;
                const prev = prevReadings[pump.key] ?? 0;
                const volume = getVolume(pump.key);
                return (
                  <tr key={pump.key} className="hover:bg-muted/20">
                    <td className="px-2 py-1 font-medium">{pump.label}</td>
                    <td className="px-2 py-1 text-right text-muted-foreground">{prev > 0 ? fmtV(prev) : '—'}</td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        value={reading || ''}
                        onChange={e => handleChange(pump.key, parseInt(e.target.value) || 0)}
                        className="input-cell w-28 text-right ml-auto"
                        placeholder="0"
                      />
                    </td>
                    <td className={`px-2 py-1 text-right font-semibold ${volume < 0 ? 'text-destructive' : ''}`}>
                      {volume !== 0 ? fmtV(volume) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Tank Summary */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="px-2 py-1.5 text-left font-medium">Tank</th>
                <th className="px-2 py-1.5 text-left font-medium">Pumps</th>
                <th className="px-2 py-1.5 text-right font-medium">Total Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tankSummary.map(t => (
                <tr key={t.tank} className="hover:bg-muted/20">
                  <td className="px-2 py-1.5 font-medium">{t.tank}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{t.pumps.map(p => p.label.split(' ').pop()).join(', ')}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{t.totalVolume !== 0 ? fmtV(t.totalVolume) : '—'}</td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-semibold">
                <td className="px-2 py-1.5" colSpan={2}>Total All Tanks</td>
                <td className="px-2 py-1.5 text-right">{fmtV(tankSummary.reduce((s, t) => s + t.totalVolume, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}
