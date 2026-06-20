import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { invoke } from '@tauri-apps/api/core'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function downloadCSV(data: Record<string, unknown>[], columns: string[], fileName: string) {
  if (!data.length) return;

  const csvRows: string[] = [];
  // Header
  csvRows.push(columns.join(','));

  // Body
  for (const row of data) {
    const values = columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const stringVal = String(val).replace(/"/g, '""');
      return `"${stringVal}"`;
    });
    csvRows.push(values.join(','));
  }

  const csvContent = csvRows.join('\n');

  try {
    await invoke('save_file_dialog', {
      content: csvContent,
      defaultFileName: fileName,
      filterName: 'CSV Files',
      filterExt: 'csv',
    });
  } catch (e) {
    console.error('Failed to export CSV:', e);
  }
}
