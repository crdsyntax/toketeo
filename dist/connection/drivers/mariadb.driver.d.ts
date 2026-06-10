import * as mysql from 'mysql2/promise';
import { DatabaseDriver } from '../interfaces/database-driver.interface';
import { SshConfigDto } from '../dto/create-connection.dto';
export interface InfoSchemaTable {
    TABLE_NAME: string;
}
export interface InfoSchemaColumn {
    COLUMN_NAME: string;
    DATA_TYPE: string;
    IS_NULLABLE: string;
}
export declare class MariaDbDriver implements DatabaseDriver {
    private readonly config;
    private readonly sshConfig?;
    private connection;
    private tunnel;
    constructor(config: mysql.ConnectionOptions, sshConfig?: SshConfigDto | undefined);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    executeQuery<T>(sql: string, params?: any[]): Promise<T>;
    getTables(): Promise<string[]>;
    getColumns(table: string): Promise<InfoSchemaColumn[]>;
}
