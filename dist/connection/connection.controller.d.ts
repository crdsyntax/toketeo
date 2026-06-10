import { ConnectionService } from './connection.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { ConnectionResponseDto } from './dto/connection-response.dto';
export declare class ConnectionController {
    private readonly connectionService;
    constructor(connectionService: ConnectionService);
    create(dto: CreateConnectionDto): Promise<ConnectionResponseDto>;
    findAll(): Promise<ConnectionResponseDto[]>;
    findOne(id: string): Promise<ConnectionResponseDto>;
    remove(id: string): Promise<void>;
    testConnection(dto: CreateConnectionDto): Promise<{
        message: string;
    }>;
}
