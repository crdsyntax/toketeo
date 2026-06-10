"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MariaDbQueryHistoryRepository = void 0;
const common_1 = require("@nestjs/common");
const mysql = __importStar(require("mysql2/promise"));
let MariaDbQueryHistoryRepository = class MariaDbQueryHistoryRepository {
    pool;
    constructor() {
        this.pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'toketeo',
        });
    }
    async save(history) {
        const sql = `
      INSERT INTO query_history (id, connectionId, userId, \`sql\`, executionTime, status, errorMessage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
        const id = crypto.randomUUID();
        await this.pool.execute(sql, [
            id,
            history.connectionId ?? null,
            history.userId ?? null,
            history.sql ?? null,
            history.executionTime ?? 0,
            history.status ?? 'SUCCESS',
            history.errorMessage || null,
        ]);
    }
    async findByConnection(connectionId, limit, offset) {
        const sql = 'SELECT * FROM query_history WHERE connectionId = ? ORDER BY executedAt DESC LIMIT ? OFFSET ?';
        const [rows] = await this.pool.execute(sql, [connectionId, limit, offset]);
        return rows.map((row) => this.mapRowToEntity(row));
    }
    async findByUser(userId, limit, offset) {
        const sql = 'SELECT * FROM query_history WHERE userId = ? ORDER BY executedAt DESC LIMIT ? OFFSET ?';
        const [rows] = await this.pool.execute(sql, [userId, limit, offset]);
        return rows.map((row) => this.mapRowToEntity(row));
    }
    mapRowToEntity(row) {
        return {
            id: row.id,
            connectionId: row.connectionId,
            userId: row.userId,
            sql: row.sql,
            executionTime: row.executionTime,
            status: row.status,
            errorMessage: row.errorMessage || undefined,
            executedAt: row.executedAt,
        };
    }
};
exports.MariaDbQueryHistoryRepository = MariaDbQueryHistoryRepository;
exports.MariaDbQueryHistoryRepository = MariaDbQueryHistoryRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MariaDbQueryHistoryRepository);
//# sourceMappingURL=mariadb-query-history.repository.js.map