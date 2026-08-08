import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from './sqlScript';

describe('splitSqlStatements', () => {
  it('splits multiple statements', () => {
    const parts = splitSqlStatements('CREATE TABLE a (id INT); INSERT INTO a VALUES (1); SELECT * FROM a;');
    expect(parts).toHaveLength(3);
    expect(parts[0].trim()).toBe('CREATE TABLE a (id INT);');
    expect(parts[1].trim()).toBe('INSERT INTO a VALUES (1);');
    expect(parts[2].trim()).toBe('SELECT * FROM a;');
  });

  it('keeps the last statement without a semicolon', () => {
    const parts = splitSqlStatements('INSERT INTO a VALUES (1); SELECT 1');
    expect(parts).toHaveLength(2);
    expect(parts[1].trim()).toBe('SELECT 1');
  });

  it('ignores semicolons inside strings', () => {
    const parts = splitSqlStatements("INSERT INTO t (msg) VALUES ('a;b'); SELECT 'a;y';");
    expect(parts).toHaveLength(2);
    expect(parts[0].trim()).toBe("INSERT INTO t (msg) VALUES ('a;b');");
    expect(parts[1].trim()).toBe("SELECT 'a;y';");
  });

  it('keeps escaped quotes', () => {
    const parts = splitSqlStatements("INSERT INTO t (m) VALUES ('it''s; ok');");
    expect(parts).toHaveLength(1);
    expect(parts[0].trim()).toBe("INSERT INTO t (m) VALUES ('it''s; ok');");
  });

  it('protects semicolons inside backticks and double quotes', () => {
    const parts = splitSqlStatements('CREATE TABLE `a;b` (id INT); SELECT "x;y" FROM t;');
    expect(parts).toHaveLength(2);
    expect(parts[0].trim()).toBe('CREATE TABLE `a;b` (id INT);');
    expect(parts[1].trim()).toBe('SELECT "x;y" FROM t;');
  });

  it('keeps comments inside statements', () => {
    const parts = splitSqlStatements('-- header comment\nSELECT 1; /* block\n */ INSERT INTO a VALUES (2);');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('-- header comment');
    expect(parts[1]).toContain('/* block\n */');
    expect(parts[1].trim().endsWith(';')).toBe(true);
  });

  it('produces nothing for only comments', () => {
    expect(splitSqlStatements('-- nothing here\n/* still nothing */\n')).toHaveLength(0);
  });

  it('produces nothing for empty or padding input', () => {
    expect(splitSqlStatements('')).toHaveLength(0);
    expect(splitSqlStatements('   \n\t  ')).toHaveLength(0);
    expect(splitSqlStatements(';;\n-- x')).toHaveLength(0);
  });

  it('detects multi-statement scripts for routing', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;')).toHaveLength(2);
    expect(splitSqlStatements('SELECT 1')).toHaveLength(1);
    expect(splitSqlStatements('SELECT 1;')).toHaveLength(1);
  });

  it('supports DELIMITER directives (creates one statement per block)', () => {
    const sql = 'DELIMITER $$\nCREATE PROCEDURE p()\nBEGIN\n  SELECT 1;\nEND$$\nDELIMITER ;\nSELECT 2;';
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('CREATE PROCEDURE p()');
    expect(parts[0]).toContain('SELECT 1;');
    expect(parts[0].trim().endsWith('END')).toBe(true);
    expect(parts[0]).not.toContain('DELIMITER');
    expect(parts[1].trim()).toBe('SELECT 2;');
  });

  it('supports trigger with // delimiter and restores ;', () => {
    const sql = 'DELIMITER //\nCREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW BEGIN SET NEW.x = 1; END//\nDELIMITER ;\nDROP TRIGGER t;';
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[0].trim().startsWith('CREATE TRIGGER')).toBe(true);
    expect(parts[0].trim().endsWith('END')).toBe(true);
    expect(parts[1].trim()).toBe('DROP TRIGGER t;');
  });

  it('supports several blocks with the same custom delimiter', () => {
    const sql = 'DELIMITER $$\nCREATE FUNCTION f1() RETURNS INT BEGIN RETURN 1; END$$\nCREATE PROCEDURE p2() BEGIN SELECT 2; END$$\nDELIMITER ;\nSELECT 3;';
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(3);
    expect(parts[0].trim().startsWith('CREATE FUNCTION')).toBe(true);
    expect(parts[1].trim().startsWith('CREATE PROCEDURE')).toBe(true);
    expect(parts[2].trim()).toBe('SELECT 3;');
  });

  it('does not close on the delimiter token inside strings', () => {
    const sql = "DELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT '$$'; END$$\nDELIMITER ;";
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(1);
    expect(parts[0].trim().startsWith('CREATE PROCEDURE')).toBe(true);
    expect(parts[0].trim().endsWith('END')).toBe(true);
    expect(parts[0]).toContain("'$$'");
  });
});