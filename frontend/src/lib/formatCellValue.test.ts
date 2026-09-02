import { describe, expect, it } from 'vitest';
import type { DbValue } from '@/types/database';
import {
  coerceEditedDateValue,
  formatCellValue,
  formatEditValue,
  isDateLikeValue,
  isNumericColumnType,
  isDateTimeColumnType,
  isBooleanColumnType,
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

  it('keeps large integer numbers untouched when columnType is numeric', () => {
    expect(formatCellValue(1374796800000, 'BIGINT')).toBe('1374796800000');
    expect(formatCellValue(170000000000, 'INT')).toBe('170000000000');
    expect(formatCellValue(12.34, 'DECIMAL(10,2)')).toBe('12.34');
    expect(formatCellValue('12.34', 'DECIMAL')).toBe('12.34');
  });

  it('formats boolean values correctly and never as dates', () => {
    expect(formatCellValue(true, 'BOOLEAN')).toBe('true');
    expect(formatCellValue(false, 'BOOLEAN')).toBe('false');
    expect(formatCellValue(1, 'TINYINT(1)')).toBe('true');
    expect(formatCellValue(0, 'TINYINT(1)')).toBe('false');
    expect(formatCellValue('1', 'TINYINT(1)')).toBe('true');
    expect(formatCellValue('0', 'TINYINT(1)')).toBe('false');
    expect(formatCellValue(true)).toBe('true');
    expect(formatCellValue(false)).toBe('false');
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

  it('preserves numeric column values for editing', () => {
    expect(formatEditValue(1374796800000, 'BIGINT')).toBe('1374796800000');
    expect(formatEditValue(12.5, 'DECIMAL')).toBe('12.5');
  });

  it('formats boolean values for editing', () => {
    expect(formatEditValue(1, 'TINYINT(1)')).toBe('true');
    expect(formatEditValue(0, 'TINYINT(1)')).toBe('false');
    expect(formatEditValue(true, 'BOOLEAN')).toBe('true');
    expect(formatEditValue(false, 'BOOLEAN')).toBe('false');
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

  it('always returns false for numeric column types', () => {
    expect(isDateLikeValue(1374796800000, 'BIGINT')).toBe(false);
    expect(isDateLikeValue(170000000000, 'INT')).toBe(false);
    expect(isDateLikeValue('1374796800000', 'INTEGER')).toBe(false);
    expect(isDateLikeValue(12.34, 'DECIMAL(10,2)')).toBe(false);
  });

  it('always returns false for boolean column types and boolean values', () => {
    expect(isDateLikeValue(true, 'BOOLEAN')).toBe(false);
    expect(isDateLikeValue(false, 'BOOLEAN')).toBe(false);
    expect(isDateLikeValue(1, 'TINYINT(1)')).toBe(false);
    expect(isDateLikeValue(0, 'TINYINT(1)')).toBe(false);
    expect(isDateLikeValue(true)).toBe(false);
    expect(isDateLikeValue(false)).toBe(false);
  });

  it('returns true for datetime column types', () => {
    expect(isDateLikeValue('2023-01-01', 'DATETIME')).toBe(true);
    expect(isDateLikeValue('2023-01-01 10:00:00', 'TIMESTAMP')).toBe(true);
  });
});

describe('isNumericColumnType & isDateTimeColumnType & isBooleanColumnType', () => {
  it('identifies boolean types correctly', () => {
    expect(isBooleanColumnType('BOOLEAN')).toBe(true);
    expect(isBooleanColumnType('BOOL')).toBe(true);
    expect(isBooleanColumnType('TINYINT(1)')).toBe(true);
    expect(isBooleanColumnType('BIT')).toBe(true);
    expect(isBooleanColumnType('BIT(1)')).toBe(true);
    expect(isBooleanColumnType('INT')).toBe(false);
  });

  it('identifies numeric types correctly', () => {
    expect(isNumericColumnType('INT')).toBe(true);
    expect(isNumericColumnType('BIGINT')).toBe(true);
    expect(isNumericColumnType('DECIMAL(10,2)')).toBe(true);
    expect(isNumericColumnType('NEWDECIMAL')).toBe(true);
    expect(isNumericColumnType('FLOAT')).toBe(true);
    expect(isNumericColumnType('DOUBLE')).toBe(true);
    expect(isNumericColumnType('BOOLEAN')).toBe(false);
    expect(isNumericColumnType('TINYINT(1)')).toBe(false);
    expect(isNumericColumnType('VARCHAR(255)')).toBe(false);
    expect(isNumericColumnType(undefined)).toBe(false);
  });

  it('identifies datetime types correctly', () => {
    expect(isDateTimeColumnType('DATETIME')).toBe(true);
    expect(isDateTimeColumnType('TIMESTAMP')).toBe(true);
    expect(isDateTimeColumnType('DATE')).toBe(true);
    expect(isDateTimeColumnType('TIME')).toBe(true);
    expect(isDateTimeColumnType('VARCHAR')).toBe(false);
    expect(isDateTimeColumnType(undefined)).toBe(false);
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

  it('handles boolean columns cleanly without date coercion', () => {
    expect(coerceEditedDateValue('true', false, 'BOOLEAN')).toBe(true);
    expect(coerceEditedDateValue('false', true, 'BOOLEAN')).toBe(false);
    expect(coerceEditedDateValue('1', 0, 'TINYINT(1)')).toBe(true);
    expect(coerceEditedDateValue('0', 1, 'TINYINT(1)')).toBe(false);
  });

  it('parses numeric columns properly as numbers instead of dates', () => {
    expect(coerceEditedDateValue('2024', 2020, 'INT')).toBe(2024);
    expect(coerceEditedDateValue('15.75', 10.5, 'DECIMAL(10,2)')).toBe(15.75);
    expect(coerceEditedDateValue('15,75', '10.50', 'DECIMAL')).toBe(15.75);
    expect(coerceEditedDateValue('100000000000', 50, 'BIGINT')).toBe(100000000000);
    expect(coerceEditedDateValue('100.50', 50.25, undefined)).toBe(100.5);
    expect(coerceEditedDateValue('123.4567', 0, undefined)).toBe(123.4567);
    expect(coerceEditedDateValue('2024', 2000, undefined)).toBe(2024);
  });

  it('never parses decimal strings as dates even without columnType', () => {
    expect(coerceEditedDateValue('100.50', '50.25')).toBe(100.5);
    expect(coerceEditedDateValue('123.4567', '0.0000')).toBe(123.4567);
    expect(coerceEditedDateValue('2024', '1999')).toBe(2024);
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

  it('returns the parsed value when it is not a parseable date', () => {
    expect(coerceEditedDateValue('not a date', 1374796800000)).toBe('not a date');
  });

  it('keeps the typed string for plain string originals', () => {
    expect(coerceEditedDateValue('2013-07-26 09:00:00', 'some string')).toBe('2013-07-26 09:00:00');
  });
});