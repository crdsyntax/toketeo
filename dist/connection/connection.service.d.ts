import { CreateConnectionDto } from './dto/create-connection.dto';
import type { ConnectionRepository } from './repositories/connection.repository.interface';
import { ConnectionResponseDto } from './dto/connection-response.dto';
export declare class ConnectionService {
    private readonly repository;
    private readonly logger;
    constructor(repository: ConnectionRepository);
    create(dto: CreateConnectionDto): Promise<ConnectionResponseDto>;
    findAll(): Promise<ConnectionResponseDto[]>;
    findOne(id: string): Promise<ConnectionResponseDto>;
    remove(id: string): Promise<void>;
    testConnection(dto: CreateConnectionDto): Promise<boolean>;
    private getDriver;
    private mapToResponseDto;
}
