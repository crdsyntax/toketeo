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
exports.SshTunnel = void 0;
const ssh2_1 = require("ssh2");
const net = __importStar(require("net"));
class SshTunnel {
    sshClient = null;
    server = null;
    async create(sshConfig, targetHost, targetPort) {
        return new Promise((resolve, reject) => {
            this.sshClient = new ssh2_1.Client();
            this.sshClient.on('ready', () => {
                this.server = net.createServer((sock) => {
                    if (!this.sshClient) {
                        sock.end();
                        return;
                    }
                    this.sshClient.forwardOut(sock.remoteAddress || '127.0.0.1', sock.remotePort || 0, targetHost, targetPort, (err, stream) => {
                        if (err) {
                            sock.end();
                            return;
                        }
                        sock.pipe(stream).pipe(sock);
                    });
                });
                this.server.listen(0, '127.0.0.1', () => {
                    if (!this.server)
                        return reject(new Error('Server failed to start'));
                    const address = this.server.address();
                    resolve({ host: '127.0.0.1', port: address.port });
                });
                this.server.on('error', reject);
            });
            this.sshClient.on('error', reject);
            this.sshClient.connect({
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.user,
                password: sshConfig.password,
                privateKey: sshConfig.privateKey,
            });
        });
    }
    close() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        if (this.sshClient) {
            this.sshClient.end();
            this.sshClient = null;
        }
    }
}
exports.SshTunnel = SshTunnel;
//# sourceMappingURL=ssh-tunnel.js.map