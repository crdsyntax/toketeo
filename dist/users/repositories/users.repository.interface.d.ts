import { UserEntity } from '../entities/user.entity';
export interface UsersRepository {
    create(user: Partial<UserEntity>): Promise<UserEntity>;
    findById(id: string): Promise<UserEntity | null>;
    findByUsername(username: string): Promise<UserEntity | null>;
    findAll(): Promise<UserEntity[]>;
}
