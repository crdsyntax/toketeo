import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import type { DbValue } from '@/types/database';
import { parseInputValue } from '@/lib/sqlGenerator';

dayjs.extend(utc);

const DATE_DISPLAY_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const DATE_ONLY_FORMAT = 'YYYY-MM-DD';

const EPOCH_MS_MIN = 100_000_000_000;
const EPOCH_MS_MAX = 4_100_000_000_000;

export function isBooleanColumnType(columnType?: string): boolean {
  if (!columnType) return false;
  const t = columnType.toLowerCase().trim();
  return (
    t === 'boolean' ||
    t === 'bool' ||
    t.startsWith('tinyint(1)') ||
    t === 'bit' ||
    t === 'bit(1)'
  );
}

export function isNumericColumnType(columnType?: string): boolean {
  if (!columnType) return false;
  if (isBooleanColumnType(columnType)) return false;
  const t = columnType.toLowerCase().trim();
  return (
    t.includes('int') ||
    t.includes('decimal') ||
    t.includes('numeric') ||
    t.includes('float') ||
    t.includes('double') ||
    t.includes('real') ||
    t.includes('number') ||
    t.includes('serial') ||
    t.includes('dec') ||
    t.includes('fixed') ||
    t.includes('year') ||
    t.includes('bit')
  );
}

export function isDateTimeColumnType(columnType?: string): boolean {
  if (!columnType) return false;
  const t = columnType.toLowerCase().trim();
  return (
    t.includes('date') ||
    t.includes('time') ||
    t.includes('timestamp')
  );
}

function formatEpochMillis(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < EPOCH_MS_MIN || ms > EPOCH_MS_MAX) return null;
  const d = dayjs.utc(ms);
  return d.isValid() ? d.format(DATE_DISPLAY_FORMAT) : null;
}

function parseDatePayload(d: unknown): dayjs.Dayjs | null {
  if (typeof d === 'number') {
    if (d >= EPOCH_MS_MIN && d <= EPOCH_MS_MAX) {
      const parsed = dayjs.utc(d);
      return parsed.isValid() ? parsed : null;
    }
    return null;
  }
  if (typeof d === 'string') {
    const s = d.trim();
    if (/^\d{13}$/.test(s)) {
      const parsed = dayjs.utc(Number(s));
      return parsed.isValid() ? parsed : null;
    }
    const isIsoOrSqlDate =
      /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(s);
    if (isIsoOrSqlDate) {
      const parsed = dayjs.utc(s.replace(' ', 'T'));
      return parsed.isValid() ? parsed : null;
    }
    return null;
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

export function isDateLikeValue(value: DbValue, columnType?: string): boolean {
  if (isBooleanColumnType(columnType)) return false;
  if (isNumericColumnType(columnType)) return false;
  if (isDateTimeColumnType(columnType)) return true;
  if (typeof value === 'boolean') return false;

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

export function coerceEditedDateValue(edited: string, original: DbValue, columnType?: string): DbValue {
  if (isBooleanColumnType(columnType)) {
    const lower = edited.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
    return parseInputValue(edited);
  }

  if (isNumericColumnType(columnType)) {
    return parseInputValue(edited);
  }

  const trimmed = edited.trim();
  if (trimmed === '') return null;

  const parsedInput = parseInputValue(trimmed);
  if (typeof original === 'number' && typeof parsedInput === 'number') {
    return parsedInput;
  }

  const parsed = parseDatePayload(trimmed);
  if (!parsed) return parsedInput;

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

export function toDateTimeLocalInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  const parsed = parseDatePayload(trimmed);
  return parsed ? parsed.format('YYYY-MM-DDTHH:mm') : value;
}

export function formatCellValue(value: DbValue, columnType?: string): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (isBooleanColumnType(columnType)) {
    if (typeof value === 'number') {
      if (value === 1) return 'true';
      if (value === 0) return 'false';
      return String(value);
    }
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (lower === 'true' || lower === '1') return 'true';
      if (lower === 'false' || lower === '0') return 'false';
      return value;
    }
  }

  if (isNumericColumnType(columnType)) {
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

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

export function formatEditValue(value: DbValue, columnType?: string): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (isBooleanColumnType(columnType)) {
    if (value === 1 || value === '1' || value === 'true') return 'true';
    if (value === 0 || value === '0' || value === 'false') return 'false';
    return String(value);
  }

  if (isNumericColumnType(columnType)) {
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

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
