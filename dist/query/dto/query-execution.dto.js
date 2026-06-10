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
exports.QueryResponseDto = exports.ExecuteQueryDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class ExecuteQueryDto {
    sql;
}
exports.ExecuteQueryDto = ExecuteQueryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'The raw SQL query to execute' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ExecuteQueryDto.prototype, "sql", void 0);
class QueryResponseDto {
    columns;
    rows;
    executionTime;
}
exports.QueryResponseDto = QueryResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Columns returned by the query' }),
    __metadata("design:type", Array)
], QueryResponseDto.prototype, "columns", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Data rows' }),
    __metadata("design:type", Array)
], QueryResponseDto.prototype, "rows", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Execution time in milliseconds' }),
    __metadata("design:type", Number)
], QueryResponseDto.prototype, "executionTime", void 0);
//# sourceMappingURL=query-execution.dto.js.map