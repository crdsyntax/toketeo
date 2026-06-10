"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ConnectionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionService = void 0;
const common_1 = require("@nestjs/common");
const create_connection_dto_1 = require("./dto/create-connection.dto");
const mariadb_driver_1 = require("./drivers/mariadb.driver");
const connection_response_dto_1 = require("./dto/connection-response.dto");
let ConnectionService = ConnectionService_1 = class ConnectionService {
    repository;
    logger = new common_1.Logger(ConnectionService_1.name);
    constructor(repository) {
        this.repository = repository;
    }
    async create(dto) {
        const connection = await this.repository.save(dto);
        return this.mapToResponseDto(connection);
    }
    async findAll() {
        const connections = await this.repository.findAll();
        return connections.map((c) => this.mapToResponseDto(c));
    }
    async findOne(id) {
        const connection = await this.repository.findById(id);
        if (!connection) {
            throw new common_1.NotFoundException(`Connection with ID ${id} not found`);
        }
        return this.mapToResponseDto(connection);
    }
    async remove(id) {
        await this.findOne(id);
        await this.repository.delete(id);
    }
    async testConnection(dto) {
        const driver = this.getDriver(dto);
        try {
            await driver.connect();
            await driver.disconnect();
            return true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Connection failed: ${message}`);
            return false;
        }
    }
    getDriver(dto) {
        switch (dto.type) {
            case create_connection_dto_1.DatabaseType.MARIADB:
                return new mariadb_driver_1.MariaDbDriver({
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
    mapToResponseDto(entity) {
        const dto = new connection_response_dto_1.ConnectionResponseDto();
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
};
exports.ConnectionService = ConnectionService;
exports.ConnectionService = ConnectionService = ConnectionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('ConnectionRepository')),
    __metadata("design:paramtypes", [Object])
], ConnectionService);
//# sourceMappingURL=connection.service.js.map