import { CreateConnectionDto } from './dto/create-connection.dto';
import { DatabaseDriver } from './interfaces/database-driver.interface';
import type { ConnectionRepository } from './repositories/connection.repository.interface';
import { ConnectionResponseDto } from './dto/connection-response.dto';
import { ConnectionEntity } from './entities/connection.entity';
export declare class ConnectionService {
    private readonly repository;
    private readonly logger;
    constructor(repository: ConnectionRepository);
    create(dto: CreateConnectionDto): Promise<ConnectionResponseDto>;
    findAll(): Promise<ConnectionResponseDto[]>;
    findOne(id: string): Promise<ConnectionResponseDto>;
    remove(id: string): Promise<void>;
    testConnection(dto: CreateConnectionDto): Promise<boolean>;
    getDriver(dto: CreateConnectionDto | ConnectionResponseDto | ConnectionEntity): DatabaseDriver;
    private mapToResponseDto;
}
