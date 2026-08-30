import { describe, expect, it } from 'vitest';
import type { DbValue } from '@/types/database';
import {
  coerceEditedDateValue,
  formatCellValue,
  formatEditValue,
  isDateLikeValue,
  toDateTimeLocalInput,
} from '@/lib/formatCellValue';

describe('formatCellValue', () => {
  it('formats a Mongo epoch-millis number as a UTC date', () => {
    expect(formatCellValue(1374796800000)).toBe('2013-07-26 00:00:00');
  });

  it('formats a Mongo epoch-millis string as a UTC date', () => {
    expect(formatCellValue('1374796800000')).toBe('2013-07-26 00:00:00');
  });

  it('keeps small numbers untouched (not epoch millis)', () => {
    expect(formatCellValue(42)).toBe('42');
    expect(formatCellValue(1000)).toBe('1000');
  });

  it('formats a wrapped $date number in UTC', () => {
    expect(formatCellValue({ $date: 1374796800000 } as unknown as DbValue)).toBe('2013-07-26 00:00:00');
  });

  it('formats a wrapped $date $numberLong in UTC', () => {
    expect(
      formatCellValue({ $date: { $numberLong: '1374796800000' } } as unknown as DbValue),
    ).toBe('2013-07-26 00:00:00');
  });

  it('formats an ISO string date in UTC', () => {
    expect(formatCellValue('2013-07-26T00:00:00.000Z')).toBe('2013-07-26 00:00:00');
  });

  it('renders ObjectId and other objects', () => {
    expect(formatCellValue({ $oid: '507f1f77bcf86cd799439011' } as unknown as DbValue)).toBe(
      'ObjectId("507f1f77bcf86cd799439011")',
    );
    expect(formatCellValue({ foo: 1 } as unknown as DbValue)).toBe('{"foo":1}');
  });

  it('handles null/undefined', () => {
    expect(formatCellValue(null)).toBe('');
    expect(formatCellValue(undefined)).toBe('');
  });
});

describe('formatEditValue', () => {
  it('flattens epoch-millis numbers to the UTC display date', () => {
    expect(formatEditValue(1374796800000)).toBe('2013-07-26 00:00:00');
  });

  it('flattens epoch-millis strings to the UTC display date', () => {
    expect(formatEditValue('1374796800000')).toBe('2013-07-26 00:00:00');
  });

  it('flattens $date $numberLong to the UTC display date', () => {
    expect(formatEditValue({ $date: { $numberLong: '1374796800000' } } as unknown as DbValue)).toBe(
      '2013-07-26 00:00:00',
    );
  });

  it('flattens ObjectId and leaves other objects as JSON', () => {
    expect(formatEditValue({ $oid: '507f1f77bcf86cd799439011' } as unknown as DbValue)).toBe(
      '507f1f77bcf86cd799439011',
    );
    expect(formatEditValue({ foo: 1 } as unknown as DbValue)).toBe('{"foo":1}');
  });

  it('keeps plain numbers untouched', () => {
    expect(formatEditValue(42)).toBe('42');
  });
});

describe('isDateLikeValue', () => {
  it('detects epoch millis, ISO strings and $date objects', () => {
    expect(isDateLikeValue(1374796800000)).toBe(true);
    expect(isDateLikeValue('1374796800000')).toBe(true);
    expect(isDateLikeValue('2013-07-26T00:00:00.000Z')).toBe(true);
    expect(isDateLikeValue({ $date: 1374796800000 } as unknown as DbValue)).toBe(true);
    expect(isDateLikeValue(42)).toBe(false);
    expect(isDateLikeValue('hello')).toBe(false);
    expect(isDateLikeValue({ foo: 1 } as unknown as DbValue)).toBe(false);
  });
});

describe('toDateTimeLocalInput', () => {
  it('converts the display date to datetime-local format (UTC)', () => {
    expect(toDateTimeLocalInput('2013-07-26 00:00:00')).toBe('2013-07-26T00:00');
    expect(toDateTimeLocalInput('1374796800000')).toBe('2013-07-26T00:00');
  });
});

describe('coerceEditedDateValue', () => {
  it('converts an edited date back to a number when the original was epoch millis', () => {
    expect(coerceEditedDateValue('2013-07-26 00:00:00', 1374796800000)).toBe(1374796800000);
    expect(coerceEditedDateValue('2013-07-26T00:00', 1374796800000)).toBe(1374796800000);
  });

  it('preserves string epoch millis', () => {
    expect(coerceEditedDateValue('2013-07-26 00:00:00', '1374796800000')).toBe('1374796800000');
  });

  it('rebuilds a $date numberLong when the original was a $date object', () => {
    expect(
      coerceEditedDateValue('2013-07-26 00:00:00', { $date: { $numberLong: '1374796800000' } } as unknown as DbValue),
    ).toEqual({ $date: { $numberLong: '1374796800000' } });
  });

  it('returns null when emptied', () => {
    expect(coerceEditedDateValue('', 1374796800000)).toBeNull();
  });

  it('returns the raw string when it is not a parseable date', () => {
    expect(coerceEditedDateValue('not a date', 1374796800000)).toBe('not a date');
  });

  it('keeps the typed string for plain string originals', () => {
    expect(coerceEditedDateValue('2013-07-26 09:00:00', 'some string')).toBe('2013-07-26 09:00:00');
  });
});