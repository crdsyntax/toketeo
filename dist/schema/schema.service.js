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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaService = void 0;
const common_1 = require("@nestjs/common");
const connection_service_1 = require("../connection/connection.service");
let SchemaService = class SchemaService {
    connectionService;
    constructor(connectionService) {
        this.connectionService = connectionService;
    }
    async getTables(connectionId) {
        const connection = await this.connectionService.findOne(connectionId);
        const driver = this.connectionService.getDriver(connection);
        try {
            await driver.connect();
            const tables = await driver.getTables();
            return tables.map((name) => ({ name }));
        }
        finally {
            await driver.disconnect();
        }
    }
    async getColumns(connectionId, tableName) {
        const connection = await this.connectionService.findOne(connectionId);
        const driver = this.connectionService.getDriver(connection);
        try {
            await driver.connect();
            const columns = (await driver.getColumns(tableName));
            return columns.map((col) => ({
                name: col.COLUMN_NAME,
                type: col.DATA_TYPE,
                isNullable: col.IS_NULLABLE === 'YES',
            }));
        }
        finally {
            await driver.disconnect();
        }
    }
};
exports.SchemaService = SchemaService;
exports.SchemaService = SchemaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [connection_service_1.ConnectionService])
], SchemaService);
//# sourceMappingURL=schema.service.js.map