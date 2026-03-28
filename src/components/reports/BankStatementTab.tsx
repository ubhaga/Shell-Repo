import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const TERMINAL_PATTERNS: { pattern: string; terminal: string }[] = [
  { pattern: '247608', terminal: 'Term 247608' },
  { pattern: '929661', terminal: 'Forecourt 929661' },
  { pattern: '200660', terminal: 'Retail 200660' },
];

interface BankLine {
  id: string;
  month: string;
  transaction_date: string;
  description: string;
  amount: number;
  matched_terminal: string;
  raw_line: string;
  created_at: string;
}

interface Props {
  filterMonth: string;
  monthLabel: string;
}

export function BankStatementTab({ filterMonth, monthLabel }: Props) {
  const [lines, setLines] = useState<BankLine[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLines = useCallback(async () => {
    const { data } = await supabase
      .from('bank_statement_lines')
      .select('*')
      .eq('month', filterMonth)
      .order('transaction_date');
    setLines((data ?? []) as unknown as BankLine[]);
  }, [filterMonth]);

  useEffect(() => { loadLines(); }, [loadLines]);

  const matchTerminal = (desc: string): string => {
    for (const { pattern, terminal } of TERMINAL_PATTERNS) {
      if (desc.includes(pattern)) return terminal;
    }
    return '';
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    try {
      const text = await file.text();
      const csvLines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (csvLines.length < 2) { toast.error('CSV file appears empty'); setLoading(false); return; }

      const headers = csvLines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const dateIdx = headers.findIndex(h => h.includes('date'));
      const descIdx = headers.findIndex(h => h.includes('description') || h.includes('narrative') || h.includes('detail'));
      const amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('debit') || h.includes('credit'));

      if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
        toast.error('Could not find Date, Description, and Amount columns in CSV');
        setLoading(false);
        return;
      }

      // Parse CSV rows (handle quoted fields)
      const parseCSVRow = (row: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of row) {
          if (char === '"') { inQuotes = !inQuotes; }
          else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
          else { current += char; }
        }
        result.push(current.trim());
        return result;
      };

      // Get existing raw_lines to detect duplicates
      const existingRaw = new Set(lines.map(l => l.raw_line));

      const newRows: Omit<BankLine, 'id' | 'created_at'>[] = [];
      let duplicates = 0;

      for (let i = 1; i < csvLines.length; i++) {
        const fields = parseCSVRow(csvLines[i]);
        if (fields.length <= Math.max(dateIdx, descIdx, amountIdx)) continue;

        const rawLine = csvLines[i];
        if (existingRaw.has(rawLine)) { duplicates++; continue; }

        const desc = fields[descIdx];
        const amt = parseFloat(fields[amountIdx].replace(/[^0-9.\-]/g, ''));
        if (isNaN(amt)) continue;

        newRows.push({
          month: filterMonth,
          transaction_date: fields[dateIdx],
          description: desc,
          amount: amt,
          matched_terminal: matchTerminal(desc),
          raw_line: rawLine,
        });
      }

      if (newRows.length > 0) {
        const { error } = await supabase.from('bank_statement_lines').insert(newRows as never[]);
        if (error) { toast.error('Upload failed: ' + error.message); }
        else {
          toast.success(`Uploaded ${newRows.length} lines${duplicates > 0 ? `, ${duplicates} duplicates skipped` : ''}`);
          await loadLines();
        }
      } else {
        toast.info(duplicates > 0 ? `All ${duplicates} lines already exist` : 'No valid lines found in CSV');
      }
    } catch (err) {
      toast.error('Failed to parse CSV file');
    }

    setLoading(false);
    e.target.value = '';
  };

  const handleClearMonth = async () => {
    if (!confirm(`Delete all bank statement lines for ${monthLabel}?`)) return;
    await supabase.from('bank_statement_lines').delete().eq('month', filterMonth);
    setLines([]);
    toast.success('Bank statement lines cleared');
  };

  const terminalSummary = TERMINAL_PATTERNS.map(({ terminal }) => {
    const matched = lines.filter(l => l.matched_terminal === terminal);
    return { terminal, total: matched.reduce((s, l) => s + l.amount, 0), count: matched.length };
  });
  const unmatchedLines = lines.filter(l => !l.matched_terminal);
  const unmatchedTotal = unmatchedLines.reduce((s, l) => s + l.amount, 0);
  const grandTotal = lines.reduce((s, l) => s + l.amount, 0);

  const exportCSV = () => {
    const headers = ['Date', 'Description', 'Amount', 'Matched Terminal'];
    const rows = lines.map(l => [l.transaction_date, `"${l.description}"`, l.amount, l.matched_terminal].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `bank-statement-${filterMonth}.csv`; a.click();
  };

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <h3 className="font-semibold text-sm">Bank Statement — {monthLabel}</h3>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" onChange={handleUpload} className="hidden" disabled={loading} />
            <Button size="sm" variant="outline" asChild disabled={loading}>
              <span><Upload className="h-3.5 w-3.5 mr-1" />{loading ? 'Uploading...' : 'Upload CSV'}</span>
            </Button>
          </label>
          {lines.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={exportCSV}>
                <Download className="h-3.5 w-3.5 mr-1" />Export
              </Button>
              <Button size="sm" variant="destructive" onClick={handleClearMonth}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />Clear
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Terminal matching summary */}
      {lines.length > 0 && (
        <div className="border-b p-4">
          <h4 className="text-sm font-semibold mb-2">Terminal Matching Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {terminalSummary.map(t => (
              <div key={t.terminal} className="flex justify-between text-sm bg-muted/30 rounded px-2 py-1">
                <span className="text-muted-foreground truncate mr-2">{t.terminal} ({t.count})</span>
                <CurrencyDisplay value={t.total} />
              </div>
            ))}
            <div className="flex justify-between text-sm bg-muted/30 rounded px-2 py-1">
              <span className="text-muted-foreground truncate mr-2">Unmatched ({unmatchedLines.length})</span>
              <CurrencyDisplay value={unmatchedTotal} />
            </div>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Matched Terminal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No bank statement uploaded for this month. Upload a CSV to get started.</TableCell></TableRow>
          ) : (
            <>
              {lines.map(l => (
                <TableRow key={l.id} className={l.matched_terminal ? 'hover:bg-muted/30' : 'bg-muted/10 hover:bg-muted/30'}>
                  <TableCell className="text-sm font-mono">{l.transaction_date}</TableCell>
                  <TableCell className="text-sm max-w-[300px] truncate">{l.description}</TableCell>
                  <TableCell className="text-right"><CurrencyDisplay value={l.amount} /></TableCell>
                  <TableCell className="text-sm">
                    {l.matched_terminal ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">{l.matched_terminal}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-secondary font-semibold">
                <TableCell colSpan={2}>TOTAL ({lines.length} lines)</TableCell>
                <TableCell className="text-right"><CurrencyDisplay value={grandTotal} highlight /></TableCell>
                <TableCell></TableCell>
              </TableRow>
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
