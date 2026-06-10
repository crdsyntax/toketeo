import { Injectable, Inject } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { UsersRepository } from './repositories/users.repository.interface';
import { UserEntity, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @Inject('UsersRepository')
    private readonly repository: UsersRepository,
  ) {}

  async create(
    username: string,
    email: string,
    password: string,
    role: UserRole,
  ): Promise<UserEntity> {
    const passwordHash = await bcrypt.hash(password, 10);
    return this.repository.create({
      username,
      email,
      passwordHash,
      role,
      isActive: true,
    });
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.repository.findByUsername(username);
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.repository.findById(id);
  }
}
