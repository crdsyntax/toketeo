import * as mysql from 'mysql2/promise';
import { DatabaseDriver } from '../interfaces/database-driver.interface';
interface InfoSchemaColumn {
    COLUMN_NAME: string;
    DATA_TYPE: string;
    IS_NULLABLE: string;
}
export declare class MariaDbDriver implements DatabaseDriver {
    private readonly config;
    private connection;
    constructor(config: mysql.ConnectionOptions);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    executeQuery<T>(sql: string, params?: any[]): Promise<T>;
    getTables(): Promise<string[]>;
    getColumns(table: string): Promise<InfoSchemaColumn[]>;
}
export {};
