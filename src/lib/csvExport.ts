import * as XLSX from 'xlsx';

export function downloadXlsx(headers: string[], rows: (string | number)[][], filename: string) {
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const outName = filename.replace(/\.csv$/i, '').replace(/\.xlsx$/i, '') + '.xlsx';
  XLSX.writeFile(wb, outName);
}

// Backward-compatible alias — now emits .xlsx
export const downloadCsv = downloadXlsx;

export function downloadXlsxFromObjects(data: Record<string, any>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const outName = filename.replace(/\.csv$/i, '').replace(/\.xlsx$/i, '') + '.xlsx';
  XLSX.writeFile(wb, outName);
}
