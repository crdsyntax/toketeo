import dayjs from 'dayjs';
import type { DbValue } from '@/types/database';

const DATE_DISPLAY_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const DATE_ONLY_FORMAT = 'YYYY-MM-DD';

export function formatCellValue(value: DbValue): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    if (obj.$oid) return `ObjectId("${String(obj.$oid)}")`;

    const dateVal = obj.$date;
    if (dateVal) {
      let parsed: dayjs.Dayjs | null = null;
      if (typeof dateVal === 'string') {
        parsed = dayjs(dateVal);
      } else if (typeof dateVal === 'number') {
        parsed = dayjs(dateVal);
      } else if (typeof dateVal === 'object' && dateVal !== null) {
        const numLong = (dateVal as Record<string, unknown>).$numberLong;
        if (numLong) parsed = dayjs(Number(numLong));
      }
      if (parsed && parsed.isValid()) return parsed.format(DATE_DISPLAY_FORMAT);
    }

    return JSON.stringify(value);
  }

  const strVal = String(value);

  const dateRegex = /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}:\d{2}(\.\d+)?(Z|([+-]\d{2}:\d{2}))?$/;
  if (dateRegex.test(strVal)) {
    const safeStr = strVal.replace(' ', 'T');
    const d = dayjs(safeStr);
    if (d.isValid()) return d.format(DATE_DISPLAY_FORMAT);
  }

  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyRegex.test(strVal)) {
    const d = dayjs(strVal);
    if (d.isValid()) return d.format(DATE_ONLY_FORMAT);
  }

  return strVal;
}
