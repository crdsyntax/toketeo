import { describe, expect, it } from 'vitest';
import { normalizeFilterQuotes, generateInsertRows, generateSelectByIds, generateDeleteByIds, generateUpdateByIds } from './sqlGenerator';
import { DatabaseType } from '@/types/database';
import type { DbRow } from '@/types/database';

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

describe('generateInsertRows', () => {
  it('genera un INSERT multi-fila con la unión de columnas', () => {
    const rows: DbRow[] = [
      { id: 1, name: 'Ana' },
      { id: 2, name: 'Luis', active: true },
    ];
    expect(generateInsertRows('users', rows, DatabaseType.POSTGRES)).toBe(
      'INSERT INTO "users" ("id", "name", "active") VALUES (1, \'Ana\', NULL), (2, \'Luis\', TRUE);',
    );
  });

  it('devuelve string vacío sin filas o sin columnas', () => {
    expect(generateInsertRows('users', [], DatabaseType.POSTGRES)).toBe('');
    expect(generateInsertRows('users', [{}], DatabaseType.POSTGRES)).toBe('');
  });
});

describe('generateSelectByIds / generateDeleteByIds / generateUpdateByIds', () => {
  it('SELECT por un solo id', () => {
    const rows: DbRow[] = [{ id: 1, name: 'Ana' }];
    expect(generateSelectByIds('users', rows, ['id'], DatabaseType.POSTGRES)).toBe(
      'SELECT * FROM "users" WHERE "id" = 1;',
    );
  });

  it('SELECT con IN para varios ids', () => {
    const rows: DbRow[] = [{ id: 1 }, { id: 2 }];
    expect(generateSelectByIds('users', rows, ['id'], DatabaseType.POSTGRES)).toBe(
      'SELECT * FROM "users" WHERE "id" IN (1, 2);',
    );
  });

  it('DELETE multi-fila', () => {
    const rows: DbRow[] = [{ id: 1 }, { id: 2 }];
    expect(generateDeleteByIds('users', rows, ['id'], DatabaseType.POSTGRES)).toBe(
      'DELETE FROM "users" WHERE "id" IN (1, 2);',
    );
  });

  it('UPDATE multi-fila con assignments', () => {
    const rows: DbRow[] = [{ id: 1 }, { id: 2 }];
    expect(generateUpdateByIds('users', rows, ['id'], [{ column: 'status', value: 'active' }], DatabaseType.POSTGRES)).toBe(
      'UPDATE "users" SET "status" = \'active\' WHERE "id" IN (1, 2);',
    );
  });
});
