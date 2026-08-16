import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { DbValue } from '@/types/database';

dayjs.extend(utc);

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
        parsed = dayjs.utc(dateVal);
      } else if (typeof dateVal === 'number') {
        parsed = dayjs.utc(dateVal);
      } else if (typeof dateVal === 'object' && dateVal !== null) {
        const numLong = (dateVal as Record<string, unknown>).$numberLong;
        if (numLong) parsed = dayjs.utc(Number(numLong));
      }
      if (parsed && parsed.isValid()) return parsed.format(DATE_DISPLAY_FORMAT);
    }

    return JSON.stringify(value);
  }

  const strVal = String(value);

  const dateRegex = /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}:\d{2}(\.\d+)?(Z|([+-]\d{2}:\d{2}))?$/;
  if (dateRegex.test(strVal)) {
    const safeStr = strVal.replace(' ', 'T');
    const d = dayjs.utc(safeStr);
    if (d.isValid()) return d.format(DATE_DISPLAY_FORMAT);
  }

  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyRegex.test(strVal)) {
    const d = dayjs.utc(strVal);
    if (d.isValid()) return d.format(DATE_ONLY_FORMAT);
  }

  return strVal;
}

/** String representation used as the editable value of an inline cell editor.
 *  ObjectId (`{ $oid }`) and Mongo date (`{ $date }`) values are flattened to
 *  their scalar payload so the user edits the raw string instead of seeing
 *  `[object Object]`. Any other object is JSON stringified. */
export function formatEditValue(value: DbValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.$oid) return String(obj.$oid);
    if (obj.$date !== undefined) {
      const d = obj.$date;
      if (typeof d === 'string' || typeof d === 'number') return String(d);
      if (d && typeof d === 'object') {
        const numLong = (d as Record<string, unknown>).$numberLong;
        if (numLong !== undefined) return String(numLong);
      }
      return JSON.stringify(d);
    }
    return JSON.stringify(value);
  }
  return String(value);
}
