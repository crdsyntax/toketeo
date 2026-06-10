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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const connection_service_1 = require("./connection.service");
const create_connection_dto_1 = require("./dto/create-connection.dto");
const connection_response_dto_1 = require("./dto/connection-response.dto");
let ConnectionController = class ConnectionController {
    connectionService;
    constructor(connectionService) {
        this.connectionService = connectionService;
    }
    async create(dto) {
        return this.connectionService.create(dto);
    }
    async findAll() {
        return this.connectionService.findAll();
    }
    async findOne(id) {
        return this.connectionService.findOne(id);
    }
    async remove(id) {
        return this.connectionService.remove(id);
    }
    async testConnection(dto) {
        const isConnected = await this.connectionService.testConnection(dto);
        if (!isConnected) {
            throw new common_1.BadRequestException('Could not connect to the database');
        }
        return { message: 'Connection successful' };
    }
};
exports.ConnectionController = ConnectionController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new database connection' }),
    (0, swagger_1.ApiResponse)({ status: 201, type: connection_response_dto_1.ConnectionResponseDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_connection_dto_1.CreateConnectionDto]),
    __metadata("design:returntype", Promise)
], ConnectionController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all database connections' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [connection_response_dto_1.ConnectionResponseDto] }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConnectionController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a connection by ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: connection_response_dto_1.ConnectionResponseDto }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ConnectionController.prototype, "findOne", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a connection' }),
    (0, swagger_1.ApiResponse)({ status: 204 }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ConnectionController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Test a database connection before saving' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_connection_dto_1.CreateConnectionDto]),
    __metadata("design:returntype", Promise)
], ConnectionController.prototype, "testConnection", null);
exports.ConnectionController = ConnectionController = __decorate([
    (0, swagger_1.ApiTags)('connections'),
    (0, common_1.Controller)('connections'),
    __metadata("design:paramtypes", [connection_service_1.ConnectionService])
], ConnectionController);
//# sourceMappingURL=connection.controller.js.map