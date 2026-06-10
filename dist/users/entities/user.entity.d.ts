export declare enum UserRole {
    ADMIN = "ADMIN",
    DEVELOPER = "DEVELOPER",
    VIEWER = "VIEWER"
}
export declare class UserEntity {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
