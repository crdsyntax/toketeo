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
var MariaDbAuditRepository_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MariaDbAuditRepository = void 0;
const common_1 = require("@nestjs/common");
const mysql = __importStar(require("mysql2/promise"));
let MariaDbAuditRepository = MariaDbAuditRepository_1 = class MariaDbAuditRepository {
    logger = new common_1.Logger(MariaDbAuditRepository_1.name);
    pool;
    constructor() {
        this.pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'toketeo',
            waitForConnections: true,
            connectionLimit: 10,
        });
    }
    async create(audit) {
        const sql = `
      INSERT INTO audit_logs (id, userId, action, resource, resourceId, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
        const id = crypto.randomUUID();
        await this.pool.execute(sql, [
            id,
            audit.userId ?? null,
            audit.action ?? null,
            audit.resource ?? null,
            audit.resourceId ?? null,
            audit.metadata ? JSON.stringify(audit.metadata) : null,
        ]);
    }
    async findAll(limit, offset) {
        const sql = 'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        const [rows] = await this.pool.execute(sql, [limit, offset]);
        return rows;
    }
    async findByUser(userId) {
        const sql = 'SELECT * FROM audit_logs WHERE userId = ? ORDER BY timestamp DESC';
        const [rows] = await this.pool.execute(sql, [userId]);
        return rows;
    }
};
exports.MariaDbAuditRepository = MariaDbAuditRepository;
exports.MariaDbAuditRepository = MariaDbAuditRepository = MariaDbAuditRepository_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MariaDbAuditRepository);
//# sourceMappingURL=mariadb-audit.repository.js.map