import { UsersRepository } from './users.repository.interface';
import { UserEntity } from '../entities/user.entity';
export declare class MariaDbUsersRepository implements UsersRepository {
    private readonly logger;
    private pool;
    constructor();
    create(user: Partial<UserEntity>): Promise<UserEntity>;
    findById(id: string): Promise<UserEntity | null>;
    findByUsername(username: string): Promise<UserEntity | null>;
    findAll(): Promise<UserEntity[]>;
}
