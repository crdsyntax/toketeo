export declare enum DatabaseType {
    MARIADB = "mariadb",
    POSTGRES = "postgres",
    MONGODB = "mongodb"
}
export declare class SshConfigDto {
    host: string;
    port: number;
    user: string;
    password?: string;
    privateKey?: string;
}
export declare class CreateConnectionDto {
    name: string;
    type: DatabaseType;
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
    ssh?: SshConfigDto;
}
