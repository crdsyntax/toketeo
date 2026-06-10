import { Injectable, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { UsersRepository } from './users.repository.interface';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class MariaDbUsersRepository implements UsersRepository {
  private readonly logger = new Logger(MariaDbUsersRepository.name);
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'toketeo',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  async create(user: Partial<UserEntity>): Promise<UserEntity> {
    const id = crypto.randomUUID();
    const sql = `
      INSERT INTO users (id, username, email, passwordHash, role, isActive)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await this.pool.execute(sql, [
      id,
      user.username ?? null,
      user.email ?? null,
      user.passwordHash ?? null,
      user.role ?? null,
      user.isActive ? 1 : 0,
    ]);
    const result = await this.findById(id);
    if (!result) throw new Error('Failed to create user');
    return result;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const sql = 'SELECT * FROM users WHERE id = ?';
    const [rows] = await this.pool.execute(sql, [id]);
    const users = rows as UserEntity[];
    return users.length > 0 ? users[0] : null;
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    const sql = 'SELECT * FROM users WHERE username = ?';
    const [rows] = await this.pool.execute(sql, [username]);
    const users = rows as UserEntity[];
    return users.length > 0 ? users[0] : null;
  }

  async findAll(): Promise<UserEntity[]> {
    const sql = 'SELECT * FROM users';
    const [rows] = await this.pool.execute(sql);
    return rows as UserEntity[];
  }
}
