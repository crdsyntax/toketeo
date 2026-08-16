import { describe, expect, it } from 'vitest';
import { generateMongoCommand, extractMongoCollection } from './mongoGenerator';
import type { DbRow } from '@/types/database';

const rows = (data: Record<string, unknown>[]) => data as unknown as DbRow[];

describe('generateMongoCommand', () => {
  it('genera find por _id para una fila', () => {
    expect(generateMongoCommand('orders', 'find', rows([{ _id: { $oid: '66040fc957a2b56d697390ef' } }]))).toBe(
      'db.orders.find({ _id: ObjectId("66040fc957a2b56d697390ef") })',
    );
  });

  it('genera find con $in para varias filas', () => {
    expect(generateMongoCommand('orders', 'find', rows([
      { _id: { $oid: 'aaa' } },
      { _id: { $oid: 'bbb' } },
    ]))).toBe(
      'db.orders.find({ _id: { $in: [ObjectId("aaa"), ObjectId("bbb")] } })',
    );
  });

  it('genera deleteMany con $in para varias filas', () => {
    expect(generateMongoCommand('orders', 'delete', rows([
      { _id: { $oid: 'aaa' } },
      { _id: { $oid: 'bbb' } },
    ]))).toBe(
      'db.orders.deleteMany({ _id: { $in: [ObjectId("aaa"), ObjectId("bbb")] } })',
    );
  });

  it('genera updateMany con $set para varias filas', () => {
    expect(generateMongoCommand('orders', 'update', rows([
      { _id: { $oid: 'aaa' }, status: 'active' },
      { _id: { $oid: 'bbb' }, status: 'active' },
    ]))).toBe(
      'db.orders.updateMany({ _id: { $in: [ObjectId("aaa"), ObjectId("bbb")] } }, { $set: { "status": "active" } })',
    );
  });

  it('genera insertMany con documentos para varias filas', () => {
    expect(generateMongoCommand('users', 'insert', rows([
      { name: 'Ana' },
      { name: 'Luis' },
    ]))).toBe(
      'db.users.insertMany([{ "name": "Ana" }, { "name": "Luis" }])',
    );
  });

  it('serializa fechas como ISODate', () => {
    expect(generateMongoCommand('logs', 'find', rows([
      { _id: { $oid: 'aaa' }, created: { $date: '2024-01-01T00:00:00Z' } },
    ]))).toBe(
      'db.logs.find({ _id: ObjectId("aaa") })',
    );
    expect(generateMongoCommand('logs', 'update', rows([
      { _id: { $oid: 'aaa' }, created: { $date: '2024-01-01T00:00:00Z' } },
    ]))).toContain(
      '"created": ISODate("2024-01-01T00:00:00Z")',
    );
  });
});

describe('extractMongoCollection', () => {
  it('extrae la colección de sintaxis shell', () => {
    expect(extractMongoCollection('db.orders.find({})')).toBe('orders');
    expect(extractMongoCollection('  db.stats.aggregate([{$group:{_id:null}}])')).toBe('stats');
  });

  it('extrae la colección de JSON protocol', () => {
    expect(extractMongoCollection('{ "collection": "orders", "find": {} }')).toBe('orders');
  });

  it('devuelve null si no encuentra colección', () => {
    expect(extractMongoCollection('SELECT * FROM users')).toBeNull();
    expect(extractMongoCollection('')).toBeNull();
  });
});