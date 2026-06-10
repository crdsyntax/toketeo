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
exports.CreateConnectionDto = exports.SshConfigDto = exports.DatabaseType = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
var DatabaseType;
(function (DatabaseType) {
    DatabaseType["MARIADB"] = "mariadb";
    DatabaseType["POSTGRES"] = "postgres";
    DatabaseType["MONGODB"] = "mongodb";
})(DatabaseType || (exports.DatabaseType = DatabaseType = {}));
class SshConfigDto {
    host;
    port;
    user;
    password;
    privateKey;
}
exports.SshConfigDto = SshConfigDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SshConfigDto.prototype, "host", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], SshConfigDto.prototype, "port", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SshConfigDto.prototype, "user", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SshConfigDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], SshConfigDto.prototype, "privateKey", void 0);
class CreateConnectionDto {
    name;
    type;
    host;
    port;
    user;
    password;
    database;
    ssh;
}
exports.CreateConnectionDto = CreateConnectionDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateConnectionDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: DatabaseType }),
    (0, class_validator_1.IsEnum)(DatabaseType),
    __metadata("design:type", String)
], CreateConnectionDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateConnectionDto.prototype, "host", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateConnectionDto.prototype, "port", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateConnectionDto.prototype, "user", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateConnectionDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateConnectionDto.prototype, "database", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: SshConfigDto, required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => SshConfigDto),
    __metadata("design:type", SshConfigDto)
], CreateConnectionDto.prototype, "ssh", void 0);
//# sourceMappingURL=create-connection.dto.js.map