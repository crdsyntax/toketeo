"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDriver = void 0;
const pg_1 = require("pg");
const ssh_tunnel_1 = require("../utils/ssh-tunnel");
class PostgresDriver {
    config;
    sshConfig;
    client = null;
    tunnel = null;
    constructor(config, sshConfig) {
        this.config = config;
        this.sshConfig = sshConfig;
    }
    async connect() {
        let connectionConfig = { ...this.config };
        if (this.sshConfig) {
            this.tunnel = new ssh_tunnel_1.SshTunnel();
            const { host, port } = await this.tunnel.create(this.sshConfig, this.config.host || 'localhost', this.config.port || 5432);
            connectionConfig = {
                ...connectionConfig,
                host,
                port,
            };
        }
        this.client = new pg_1.Client(connectionConfig);
        await this.client.connect();
    }
    async disconnect() {
        if (this.client) {
            await this.client.end();
            this.client = null;
        }
        if (this.tunnel) {
            this.tunnel.close();
            this.tunnel = null;
        }
    }
    async executeQuery(sql, params) {
        if (!this.client) {
            throw new Error('Driver not connected');
        }
        const result = await this.client.query(sql, params);
        return result.rows;
    }
    async getTables() {
        const rows = await this.executeQuery("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        return rows.map((row) => row.table_name);
    }
    async getColumns(table) {
        return this.executeQuery("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table]);
    }
}
exports.PostgresDriver = PostgresDriver;
//# sourceMappingURL=postgres.driver.js.map