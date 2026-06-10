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
var QueryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryService = void 0;
const common_1 = require("@nestjs/common");
const connection_service_1 = require("../connection/connection.service");
const audit_service_1 = require("../audit/audit.service");
const audit_entity_1 = require("../audit/entities/audit.entity");
let QueryService = QueryService_1 = class QueryService {
    connectionService;
    auditService;
    historyRepository;
    logger = new common_1.Logger(QueryService_1.name);
    constructor(connectionService, auditService, historyRepository) {
        this.connectionService = connectionService;
        this.auditService = auditService;
        this.historyRepository = historyRepository;
    }
    async execute(connectionId, dto) {
        const connection = await this.connectionService.findOne(connectionId);
        const driver = this.connectionService.getDriver(connection);
        const start = Date.now();
        try {
            await driver.connect();
            const rows = await driver.executeQuery(dto.sql);
            const executionTime = Date.now() - start;
            let columns = [];
            if (Array.isArray(rows) && rows.length > 0) {
                columns = Object.keys(rows[0]);
            }
            void this.historyRepository.save({
                connectionId,
                userId: 'system',
                sql: dto.sql,
                executionTime,
                status: 'SUCCESS',
            });
            void this.auditService.log('system', audit_entity_1.AuditAction.EXECUTE_QUERY, 'database', connectionId, { sql: dto.sql, executionTime });
            return {
                columns,
                rows: Array.isArray(rows) ? rows : [rows],
                executionTime,
            };
        }
        catch (error) {
            const executionTime = Date.now() - start;
            const message = error instanceof Error ? error.message : 'Unknown error';
            void this.historyRepository.save({
                connectionId,
                userId: 'system',
                sql: dto.sql,
                executionTime,
                status: 'ERROR',
                errorMessage: message,
            });
            throw error;
        }
        finally {
            await driver.disconnect();
        }
    }
};
exports.QueryService = QueryService;
exports.QueryService = QueryService = QueryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)('QueryHistoryRepository')),
    __metadata("design:paramtypes", [connection_service_1.ConnectionService,
        audit_service_1.AuditService, Object])
], QueryService);
//# sourceMappingURL=query.service.js.map