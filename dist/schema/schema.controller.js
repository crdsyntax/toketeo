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
exports.SchemaController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const schema_service_1 = require("./schema.service");
const schema_response_dto_1 = require("./dto/schema-response.dto");
let SchemaController = class SchemaController {
    schemaService;
    constructor(schemaService) {
        this.schemaService = schemaService;
    }
    async getTables(connectionId) {
        return this.schemaService.getTables(connectionId);
    }
    async getColumns(connectionId, tableName) {
        return this.schemaService.getColumns(connectionId, tableName);
    }
};
exports.SchemaController = SchemaController;
__decorate([
    (0, common_1.Get)('tables'),
    (0, swagger_1.ApiOperation)({ summary: 'List all tables in the connection' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [schema_response_dto_1.TableResponseDto] }),
    __param(0, (0, common_1.Param)('connectionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SchemaController.prototype, "getTables", null);
__decorate([
    (0, common_1.Get)('tables/:tableName/columns'),
    (0, swagger_1.ApiOperation)({ summary: 'List all columns in a table' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [schema_response_dto_1.ColumnResponseDto] }),
    __param(0, (0, common_1.Param)('connectionId')),
    __param(1, (0, common_1.Param)('tableName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SchemaController.prototype, "getColumns", null);
exports.SchemaController = SchemaController = __decorate([
    (0, swagger_1.ApiTags)('schema'),
    (0, common_1.Controller)('connections/:connectionId/schema'),
    __metadata("design:paramtypes", [schema_service_1.SchemaService])
], SchemaController);
//# sourceMappingURL=schema.controller.js.map