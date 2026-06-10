import { ClientConfig } from 'pg';
import { DatabaseDriver } from '../interfaces/database-driver.interface';
import { SshConfigDto } from '../dto/create-connection.dto';
export declare class PostgresDriver implements DatabaseDriver {
    private readonly config;
    private readonly sshConfig?;
    private client;
    private tunnel;
    constructor(config: ClientConfig, sshConfig?: SshConfigDto | undefined);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    executeQuery<T>(sql: string, params?: any[]): Promise<T>;
    getTables(): Promise<string[]>;
    getColumns(table: string): Promise<any[]>;
}
