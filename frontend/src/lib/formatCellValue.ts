import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { DbValue } from '@/types/database';

dayjs.extend(utc);

const DATE_DISPLAY_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const DATE_ONLY_FORMAT = 'YYYY-MM-DD';

// Números que caen en el rango de epoch-millis plausibles (≈1973 a ≈2100).
// Se interpretan como marcas de tiempo UTC para MongoDB, donde una fecha
// puede llegar como Int64 plano en lugar de Extended JSON `{ $date }`.
const EPOCH_MS_MIN = 100_000_000_000;
const EPOCH_MS_MAX = 4_100_000_000_000;

function formatEpochMillis(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < EPOCH_MS_MIN || ms > EPOCH_MS_MAX) return null;
  const d = dayjs.utc(ms);
  return d.isValid() ? d.format(DATE_DISPLAY_FORMAT) : null;
}

function parseDatePayload(d: unknown): dayjs.Dayjs | null {
  if (typeof d === 'number') {
    const parsed = dayjs.utc(d);
    return parsed.isValid() ? parsed : null;
  }
  if (typeof d === 'string') {
    const s = d.trim();
    if (/^\d{13}$/.test(s)) {
      const parsed = dayjs.utc(Number(s));
      return parsed.isValid() ? parsed : null;
    }
    const parsed = dayjs.utc(s);
    return parsed.isValid() ? parsed : null;
  }
  if (d && typeof d === 'object') {
    const numLong = (d as Record<string, unknown>).$numberLong;
    if (numLong !== undefined) {
      const parsed = dayjs.utc(Number(numLong));
      return parsed.isValid() ? parsed : null;
    }
  }
  return null;
}

/** true si el valor parece una fecha (epoch-millis, `{ $date }` o ISO). */
export function isDateLikeValue(value: DbValue): boolean {
  if (typeof value === 'number') return formatEpochMillis(value) !== null;
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (obj.$date !== undefined) return parseDatePayload(obj.$date) !== null;
    return false;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{13}$/.test(s)) return formatEpochMillis(Number(s)) !== null;
    return (
      /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/.test(s) ||
      /^\d{4}-\d{2}-\d{2}$/.test(s)
    );
  }
  return false;
}

/** Convierte el valor de un datepicker (`YYYY-MM-DDTHH:mm`) a la forma
 *  original del dato (number epoch, string o `{ $date }`) antes de guardar. */
export function coerceEditedDateValue(edited: string, original: DbValue): DbValue {
  const trimmed = edited.trim();
  if (trimmed === '') return null;

  const parsed = parseDatePayload(trimmed);
  if (!parsed) return edited;

  const ms = parsed.valueOf();
  if (typeof original === 'number') return ms;
  if (typeof original === 'string') {
    return /^\d{13}$/.test(original) ? String(ms) : trimmed;
  }
  if (typeof original === 'object' && original !== null) {
    const obj = original as Record<string, unknown>;
    if (obj.$date !== undefined) {
      const d = obj.$date;
      if (d && typeof d === 'object') {
        const nl = (d as Record<string, unknown>).$numberLong;
        if (nl !== undefined) {
          return { $date: { $numberLong: String(ms) } } as unknown as DbValue;
        }
      }
      if (typeof d === 'number') return { $date: ms } as unknown as DbValue;
      if (typeof d === 'string') {
        return { $date: parsed.toISOString() } as unknown as DbValue;
      }
    }
  }
  return edited;
}

/** Valor `YYYY-MM-DDTHH:mm` (UTC) para alimentar un `<input type="datetime-local">`. */
export function toDateTimeLocalInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  const parsed = parseDatePayload(trimmed);
  return parsed ? parsed.format('YYYY-MM-DDTHH:mm') : value;
}

export function formatCellValue(value: DbValue): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'number') {
    const formatted = formatEpochMillis(value);
    if (formatted) return formatted;
  }

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

  const epochMsStr = /^\d{13}$/.test(strVal);
  if (epochMsStr) {
    const formatted = formatEpochMillis(Number(strVal));
    if (formatted) return formatted;
  }

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
 *  a readable scalar so the user edits the date instead of the raw epoch millis.
 *  Any other object is JSON stringified. */
export function formatEditValue(value: DbValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.$oid) return String(obj.$oid);
    if (obj.$date !== undefined) {
      const parsed = parseDatePayload(obj.$date);
      if (parsed) return parsed.format(DATE_DISPLAY_FORMAT);
      return JSON.stringify(obj.$date);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    const formatted = formatEpochMillis(value);
    if (formatted) return formatted;
    return String(value);
  }
  if (typeof value === 'string' && /^\d{13}$/.test(value.trim())) {
    const formatted = formatEpochMillis(Number(value.trim()));
    if (formatted) return formatted;
  }
  return String(value);
}
