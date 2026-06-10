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
var MariaDbUsersRepository_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MariaDbUsersRepository = void 0;
const common_1 = require("@nestjs/common");
const mysql = __importStar(require("mysql2/promise"));
let MariaDbUsersRepository = MariaDbUsersRepository_1 = class MariaDbUsersRepository {
    logger = new common_1.Logger(MariaDbUsersRepository_1.name);
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
    async create(user) {
        const id = crypto.randomUUID();
        const sql = `
      INSERT INTO users (id, username, email, passwordHash, role, isActive)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
        await this.pool.execute(sql, [
            id,
            user.username ?? null,
            user.email ?? null,
            user.passwordHash ?? null,
            user.role ?? null,
            user.isActive ? 1 : 0,
        ]);
        const result = await this.findById(id);
        if (!result)
            throw new Error('Failed to create user');
        return result;
    }
    async findById(id) {
        const sql = 'SELECT * FROM users WHERE id = ?';
        const [rows] = await this.pool.execute(sql, [id]);
        const users = rows;
        return users.length > 0 ? users[0] : null;
    }
    async findByUsername(username) {
        const sql = 'SELECT * FROM users WHERE username = ?';
        const [rows] = await this.pool.execute(sql, [username]);
        const users = rows;
        return users.length > 0 ? users[0] : null;
    }
    async findAll() {
        const sql = 'SELECT * FROM users';
        const [rows] = await this.pool.execute(sql);
        return rows;
    }
};
exports.MariaDbUsersRepository = MariaDbUsersRepository;
exports.MariaDbUsersRepository = MariaDbUsersRepository = MariaDbUsersRepository_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], MariaDbUsersRepository);
//# sourceMappingURL=mariadb-users.repository.js.map