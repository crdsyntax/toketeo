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
var MariaDbConnectionRepository_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MariaDbConnectionRepository = void 0;
const common_1 = require("@nestjs/common");
const mysql = __importStar(require("mysql2/promise"));
let MariaDbConnectionRepository = MariaDbConnectionRepository_1 = class MariaDbConnectionRepository {
    logger = new common_1.Logger(MariaDbConnectionRepository_1.name);
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
    async save(connection) {
        const id = connection.id || crypto.randomUUID();
        const sql = `
      INSERT INTO connections (id, name, type, host, port, user, password, database, ssh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        host = VALUES(host),
        port = VALUES(port),
        user = VALUES(user),
        password = VALUES(password),
        database = VALUES(database),
        ssh = VALUES(ssh),
        updatedAt = CURRENT_TIMESTAMP
    `;
        await this.pool.execute(sql, [
            id,
            connection.name ?? null,
            connection.type ?? null,
            connection.host ?? null,
            connection.port ?? null,
            connection.user ?? null,
            connection.password ?? null,
            connection.database ?? null,
            connection.ssh ? JSON.stringify(connection.ssh) : null,
        ]);
        const result = await this.findById(id);
        if (!result) {
            throw new Error('Failed to retrieve saved connection');
        }
        return result;
    }
    async findAll() {
        const sql = 'SELECT id, name, type, host, port, user, database, ssh, createdAt, updatedAt FROM connections';
        const [rows] = await this.pool.execute(sql);
        return rows.map((row) => this.mapRowToEntity(row));
    }
    async findById(id) {
        const sql = 'SELECT id, name, type, host, port, user, database, ssh, createdAt, updatedAt FROM connections WHERE id = ?';
        const [rows] = await this.pool.execute(sql, [id]);
        const connections = rows;
        if (connections.length === 0)
            return null;
        return this.mapRowToEntity(connections[0]);
    }
    async delete(id) {
        const sql = 'DELETE FROM connections WHERE id = ?';
        await this.pool.execute(sql, [id]);
    }
    mapRowToEntity(row) {
        return {
            id: row.id,
            name: row.name,
            type: row.type,
            host: row.host,
            port: row.port,
            user: row.user,
            database: row.database,
            ssh: row.ssh
                ? (typeof row.ssh === 'string'
                    ? JSON.parse(row.ssh)
                    : row.ssh)
                : undefined,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
};
exports.MariaDbConnectionRepository = MariaDbConnectionRepository;
exports.MariaDbConnectionRepository = MariaDbConnectionRepository = MariaDbConnectionRepository_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MariaDbConnectionRepository);
//# sourceMappingURL=mariadb-connection.repository.js.map