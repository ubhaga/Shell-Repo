import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Upload, FileText, Trash2, CheckCircle } from 'lucide-react';
import { format, getDaysInMonth } from 'date-fns';

interface Props {
  filterMonth: string; // yyyy-MM
}

interface DayEndRow {
  id: string;
  date: string;
  filename: string;
  content: string;
  created_at: string;
}

export function DayEndUpload({ filterMonth }: Props) {
  const [uploads, setUploads] = useState<DayEndRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadUploads = useCallback(async () => {
    const { data } = await supabase
      .from('day_end_uploads')
      .select('*')
      .eq('month', filterMonth)
      .order('date');
    setUploads((data ?? []) as DayEndRow[]);
  }, [filterMonth]);

  useEffect(() => { loadUploads(); }, [loadUploads]);

  const handleFileUpload = async (date: string, file: File) => {
    setLoading(true);
    try {
      const text = await file.text();
      const existing = uploads.find(u => u.date === date);
      if (existing) {
        await supabase.from('day_end_uploads').update({
          filename: file.name,
          content: text,
          updated_at: new Date().toISOString(),
        } as never).eq('id', existing.id);
      } else {
        await supabase.from('day_end_uploads').insert({
          date,
          month: filterMonth,
          filename: file.name,
          content: text,
        } as never);
      }
      toast({ title: 'Day end uploaded', description: `${file.name} for ${format(new Date(date), 'dd MMM yyyy')}` });
      await loadUploads();
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleDelete = async (row: DayEndRow) => {
    await supabase.from('day_end_uploads').delete().eq('id', row.id);
    toast({ title: 'Deleted', description: row.filename });
    await loadUploads();
  };

  // Build list of dates in the month
  const year = parseInt(filterMonth.slice(0, 4));
  const month = parseInt(filterMonth.slice(5, 7));
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const today = format(new Date(), 'yyyy-MM-dd');

  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = `${filterMonth}-${String(i + 1).padStart(2, '0')}`;
    return d;
  }).filter(d => d <= today);

  const uploadMap = new Map(uploads.map(u => [u.date, u]));

  return (
    <div className="bg-card border rounded-lg">
      <div className="px-4 py-3 border-b bg-muted/50">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Day End Reports — {format(new Date(year, month - 1), 'MMMM yyyy')}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">Upload .rpt day end files for each day</p>
      </div>
      <div className="divide-y max-h-[500px] overflow-y-auto">
        {dates.map(date => {
          const row = uploadMap.get(date);
          const dayLabel = format(new Date(date), 'EEE dd MMM');
          return (
            <div key={date} className={`flex items-center justify-between px-4 py-2 text-sm ${row ? 'bg-green-50' : 'hover:bg-muted/30'}`}>
              <div className="flex items-center gap-3 min-w-[140px]">
                <span className="font-medium">{dayLabel}</span>
              </div>
              {row ? (
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-muted-foreground text-xs">{row.filename}</span>
                  <label className="cursor-pointer text-xs text-primary hover:underline">
                    Replace
                    <input type="file" accept=".rpt,.txt" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(date, f);
                      e.target.value = '';
                    }} />
                  </label>
                  <button onClick={() => handleDelete(row)} className="text-destructive hover:text-destructive/80">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className={`cursor-pointer flex items-center gap-1.5 text-xs text-primary hover:underline ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                  <input type="file" accept=".rpt,.txt" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(date, f);
                    e.target.value = '';
                  }} />
                </label>
              )}
            </div>
          );
        })}
        {dates.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">No dates available for this month yet.</div>
        )}
      </div>
      <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
        {uploads.length} / {dates.length} days uploaded
      </div>
    </div>
  );
}
