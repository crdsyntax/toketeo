import { describe, expect, it } from 'vitest';
import { extractStatementAtCursor } from './sql-statement';

const QUERY = [
  'SELECT o.id, o.order_number, o.status AS order_status, o.total,',
  '       op.id AS payment_id, op.provider, op.amount AS payment_amount,',
  '       op.status AS payment_status, op.paid_at, o.created_at',
  'FROM orders o',
  "LEFT JOIN order_payments op ON op.order_id = o.id AND op.status = 'pending'",
  'WHERE o.deleted_at IS NULL',
  "  AND (op.id IS NOT NULL OR o.status = 'pending')",
  'ORDER BY o.created_at DESC;',
].join('\n');

describe('extractStatementAtCursor', () => {
  it('executes the full multi-line statement when the cursor is on the last line with the semicolon', () => {
    const pos = QUERY.indexOf('ORDER BY') + 'ORDER BY o.created_at DESC;'.length
    expect(extractStatementAtCursor(QUERY, pos)).toBe(QUERY)
    expect(extractStatementAtCursor(QUERY, pos)).toContain('SELECT o.id')
    expect(extractStatementAtCursor(QUERY, pos)).toContain("ON op.order_id = o.id")
  });

  it('executes the full statement when the cursor is on the first line', () => {
    expect(extractStatementAtCursor(QUERY, 0)).toBe(QUERY)
    expect(extractStatementAtCursor(QUERY, QUERY.indexOf('o.total'))).toBe(QUERY)
  });

  it('executes the full statement from any middle line', () => {
    const fromLine = QUERY.indexOf('FROM orders o')
    expect(extractStatementAtCursor(QUERY, fromLine + 3)).toBe(QUERY)
  });

  it('executes a single-line statement', () => {
    const sql = 'SELECT 1;'
    expect(extractStatementAtCursor(sql, 0)).toBe('SELECT 1;')
    expect(extractStatementAtCursor(sql, 7)).toBe('SELECT 1;')
  });

  it('picks only the statement under the cursor in a multi-statement document', () => {
    const sql = 'CREATE TABLE a (id INT);\nINSERT INTO a VALUES (1);\nSELECT * FROM a;'
    const insert = sql.indexOf('INSERT')
    const insertEnd = sql.indexOf(';', insert)
    expect(extractStatementAtCursor(sql, insert + 5)).toBe('INSERT INTO a VALUES (1);')
    // Cursor right after a ';' runs the statement that ENDS there (the preceding
    // one), not the next — so Ctrl+Enter at the end of a finished line is safe.
    expect(extractStatementAtCursor(sql, insertEnd)).toBe('INSERT INTO a VALUES (1);')
    const create = sql.indexOf('CREATE')
    expect(extractStatementAtCursor(sql, create + 2)).toBe('CREATE TABLE a (id INT);')
    const select = sql.indexOf('SELECT *')
    expect(extractStatementAtCursor(sql, select + 4)).toBe('SELECT * FROM a;')
  });

  it('runs the statement ending at the semicolon right after the cursor (not the next one)', () => {
    const sql =
      'select * from tb_wallet where clienteId = 12198;select * from tb_wallet_transactions where walletId = 238;'
    const afterFirstSemi = sql.indexOf(';') + 1
    expect(extractStatementAtCursor(sql, afterFirstSemi)).toBe(
      'select * from tb_wallet where clienteId = 12198;',
    )
  });

  it('falls back to the preceding statement when the cursor is right after a trailing semicolon', () => {
    const sql = 'SELECT 1;'
    expect(extractStatementAtCursor(sql, sql.length)).toBe('SELECT 1;')
    expect(extractStatementAtCursor(sql, sql.length + 5)).toBe('SELECT 1;')
    expect(extractStatementAtCursor(`${QUERY}\n\n`, QUERY.length + 2)).toBe(QUERY)
  });

  it('returns the whole document for a statement without a trailing semicolon', () => {
    expect(extractStatementAtCursor('SELECT 1', 3)).toBe('SELECT 1')
    expect(extractStatementAtCursor('SELECT 1\nFROM t', 9)).toBe('SELECT 1\nFROM t')
  });

  it('returns an empty string for empty or whitespace-only documents', () => {
    expect(extractStatementAtCursor('', 0)).toBe('')
    expect(extractStatementAtCursor('   \n\t  ', 4)).toBe('')
  });
});