import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
interface LoginPayload {
    username: string;
    id: string;
    role: string;
}
export declare class AuthService {
    private usersService;
    private jwtService;
    constructor(usersService: UsersService, jwtService: JwtService);
    validateUser(username: string, pass: string): Promise<Omit<UserEntity, 'passwordHash'> | null>;
    login(user: LoginPayload): {
        access_token: string;
    };
}
export {};
