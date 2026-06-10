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
var QueryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryService = void 0;
const common_1 = require("@nestjs/common");
const connection_service_1 = require("../connection/connection.service");
const mariadb_driver_1 = require("../connection/drivers/mariadb.driver");
let QueryService = QueryService_1 = class QueryService {
    connectionService;
    logger = new common_1.Logger(QueryService_1.name);
    constructor(connectionService) {
        this.connectionService = connectionService;
    }
    async execute(connectionId, dto) {
        const driver = await this.getDriver(connectionId);
        const start = Date.now();
        try {
            await driver.connect();
            const rows = await driver.executeQuery(dto.sql);
            const executionTime = Date.now() - start;
            let columns = [];
            if (Array.isArray(rows) && rows.length > 0) {
                columns = Object.keys(rows[0]);
            }
            return {
                columns,
                rows: Array.isArray(rows) ? rows : [rows],
                executionTime,
            };
        }
        finally {
            await driver.disconnect();
        }
    }
    async getDriver(connectionId) {
        const connection = await this.connectionService.findOne(connectionId);
        return new mariadb_driver_1.MariaDbDriver({
            host: connection.host,
            port: connection.port,
            user: connection.user,
            database: connection.database,
        });
    }
};
exports.QueryService = QueryService;
exports.QueryService = QueryService = QueryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [connection_service_1.ConnectionService])
], QueryService);
//# sourceMappingURL=query.service.js.map