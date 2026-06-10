import { DatabaseType, SshConfigDto } from './create-connection.dto';
export declare class ConnectionResponseDto {
    id: string;
    name: string;
    type: DatabaseType;
    host: string;
    port: number;
    user: string;
    database: string;
    ssh?: SshConfigDto;
    createdAt: Date;
    updatedAt: Date;
}
