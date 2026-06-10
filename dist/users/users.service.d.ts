import type { UsersRepository } from './repositories/users.repository.interface';
import { UserEntity, UserRole } from './entities/user.entity';
export declare class UsersService {
    private readonly repository;
    constructor(repository: UsersRepository);
    create(username: string, email: string, password: string, role: UserRole): Promise<UserEntity>;
    findByUsername(username: string): Promise<UserEntity | null>;
    findById(id: string): Promise<UserEntity | null>;
}
