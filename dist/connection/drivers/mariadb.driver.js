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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MariaDbDriver = void 0;
const mysql = __importStar(require("mysql2/promise"));
const ssh_tunnel_1 = require("../utils/ssh-tunnel");
class MariaDbDriver {
    config;
    sshConfig;
    connection = null;
    tunnel = null;
    constructor(config, sshConfig) {
        this.config = config;
        this.sshConfig = sshConfig;
    }
    async connect() {
        let connectionConfig = { ...this.config };
        if (this.sshConfig) {
            this.tunnel = new ssh_tunnel_1.SshTunnel();
            const { host, port } = await this.tunnel.create(this.sshConfig, this.config.host || 'localhost', this.config.port || 3306);
            connectionConfig = {
                ...connectionConfig,
                host,
                port,
            };
        }
        this.connection = await mysql.createConnection(connectionConfig);
    }
    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
        }
        if (this.tunnel) {
            this.tunnel.close();
            this.tunnel = null;
        }
    }
    async executeQuery(sql, params) {
        if (!this.connection) {
            throw new Error('Driver not connected');
        }
        const [rows] = await this.connection.execute(sql, params);
        return rows;
    }
    async getTables() {
        const rows = await this.executeQuery('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [this.config.database]);
        return rows.map((row) => row.TABLE_NAME);
    }
    async getColumns(table) {
        return this.executeQuery('SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [this.config.database, table]);
    }
}
exports.MariaDbDriver = MariaDbDriver;
//# sourceMappingURL=mariadb.driver.js.map