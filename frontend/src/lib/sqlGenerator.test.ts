import { describe, expect, it } from 'vitest';
import { normalizeFilterQuotes } from './sqlGenerator';
import { DatabaseType } from '@/types/database';

describe('normalizeFilterQuotes', () => {
  const cols = ['order_number', 'id', 'status'];

  it('convierte tokens no-columna entre comillas dobles a literales (Postgres)', () => {
    expect(normalizeFilterQuotes('order_number = "OU12-PX7RLT"', cols, DatabaseType.POSTGRES)).toBe(
      "order_number = 'OU12-PX7RLT'",
    );
  });

  it('conserva identificadores de columnas reales entre comillas dobles', () => {
    expect(normalizeFilterQuotes('"order_number" = \'X\'', cols, DatabaseType.POSTGRES)).toBe(
      '"order_number" = \'X\'',
    );
    expect(normalizeFilterQuotes('"id" > 5', cols, DatabaseType.POSTGRES)).toBe('"id" > 5');
  });

  it('deja intactos MySQL/MariaDB (comillas dobles = string) y MongoDB (JSON)', () => {
    expect(normalizeFilterQuotes('order_number = "OU12-PX7RLT"', cols, DatabaseType.MYSQL)).toBe(
      'order_number = "OU12-PX7RLT"',
    );
    expect(normalizeFilterQuotes('{"order_number":"OU12-PX7RLT"}', cols, DatabaseType.MONGODB)).toBe(
      '{"order_number":"OU12-PX7RLT"}',
    );
  });

  it('escapa comillas simples dentro del literal convertido', () => {
    expect(normalizeFilterQuotes('name = "O\'Brien"', ['name'], DatabaseType.POSTGRES)).toBe(
      "name = 'O''Brien'",
    );
  });
});
