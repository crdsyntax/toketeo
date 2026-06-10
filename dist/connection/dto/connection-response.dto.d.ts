import { DatabaseType } from './create-connection.dto';
export declare class ConnectionResponseDto {
    id: string;
    name: string;
    type: DatabaseType;
    host: string;
    port: number;
    user: string;
    database: string;
    createdAt: Date;
    updatedAt: Date;
}
