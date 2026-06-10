import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { CreateConnectionDto, DatabaseType } from './dto/create-connection.dto';
import { MariaDbDriver } from './drivers/mariadb.driver';
import { DatabaseDriver } from './interfaces/database-driver.interface';
import type { ConnectionRepository } from './repositories/connection.repository.interface';
import { ConnectionResponseDto } from './dto/connection-response.dto';
import { ConnectionEntity } from './entities/connection.entity';

@Injectable()
export class ConnectionService {
  private readonly logger = new Logger(ConnectionService.name);

  constructor(
    @Inject('ConnectionRepository')
    private readonly repository: ConnectionRepository,
  ) {}

  async create(dto: CreateConnectionDto): Promise<ConnectionResponseDto> {
    const connection = await this.repository.save(dto);
    return this.mapToResponseDto(connection);
  }

  async findAll(): Promise<ConnectionResponseDto[]> {
    const connections = await this.repository.findAll();
    return connections.map((c) => this.mapToResponseDto(c));
  }

  async findOne(id: string): Promise<ConnectionResponseDto> {
    const connection = await this.repository.findById(id);
    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }
    return this.mapToResponseDto(connection);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repository.delete(id);
  }

  async testConnection(dto: CreateConnectionDto): Promise<boolean> {
    const driver = this.getDriver(dto);
    try {
      await driver.connect();
      await driver.disconnect();
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection failed: ${message}`);
      return false;
    }
  }

  private getDriver(dto: CreateConnectionDto): DatabaseDriver {
    switch (dto.type) {
      case DatabaseType.MARIADB:
        return new MariaDbDriver({
          host: dto.host,
          port: dto.port,
          user: dto.user,
          password: dto.password,
          database: dto.database,
        });
      default:
        throw new Error(`Unsupported database type: ${dto.type}`);
    }
  }

  private mapToResponseDto(entity: ConnectionEntity): ConnectionResponseDto {
    const dto = new ConnectionResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.type = entity.type;
    dto.host = entity.host;
    dto.port = entity.port;
    dto.user = entity.user;
    dto.database = entity.database;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
