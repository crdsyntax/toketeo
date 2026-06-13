import { Injectable, Logger } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { UsersRepository } from './users.repository.interface';
import { UserEntity, UserRole } from '../entities/user.entity';
import { withRetry } from '../../common/utils/retry';

@Injectable()
export class MariaDbUsersRepository implements UsersRepository {
  private readonly logger = new Logger(MariaDbUsersRepository.name);
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: 'mysql',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  async create(user: Partial<UserEntity>): Promise<UserEntity> {
    const username = user.username;
    if (!username) throw new Error('Username is required');

    // Using MariaDB/MySQL CREATE USER syntax
    // We store the role as a DB role and use the passwordHash as the password
    const sql = `CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?`;
    await withRetry(
      () => this.pool.execute(sql, [username, user.passwordHash || '']),
      3,
      1000,
      'Create DB user',
    );

    // If role is provided, we could try to GRANT it, but for now we just return the entity
    const result = await this.findByUsername(username);
    if (!result) throw new Error('Failed to create user');
    return result;
  }

  async findById(id: string): Promise<UserEntity | null> {
    // In mysql.user, there is no UUID 'id', so we use 'User' as the identifier
    return this.findByUsername(id);
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    const sql = 'SELECT User, Host FROM mysql.user WHERE User = ?';
    const [rows] = await withRetry(
      () => this.pool.execute(sql, [username]),
      3,
      1000,
      'Find DB user',
    );
    const dbUsers = rows as { User: string; Host: string }[];
    if (dbUsers.length === 0) return null;

    return {
      id: dbUsers[0].User,
      username: dbUsers[0].User,
      email: `${dbUsers[0].User}@local`, // Email is not native to mysql.user
      passwordHash: '', // We don't retrieve passwords from mysql.user
      role: UserRole.VIEWER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async findAll(): Promise<UserEntity[]> {
    const sql = 'SELECT User, Host FROM mysql.user';
    const [rows] = await withRetry(
      () => this.pool.execute(sql),
      3,
      1000,
      'Find all DB users',
    );
    const dbUsers = rows as { User: string; Host: string }[];
    return dbUsers.map((u) => ({
      id: u.User,
      username: u.User,
      email: `${u.User}@local`,
      passwordHash: '',
      role: UserRole.VIEWER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }
}
