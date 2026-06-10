import { Client as SshClient } from 'ssh2';
import * as net from 'net';
import { SshConfigDto } from '../dto/create-connection.dto';

export class SshTunnel {
  private sshClient: SshClient | null = null;
  private server: net.Server | null = null;

  async create(
    sshConfig: SshConfigDto,
    targetHost: string,
    targetPort: number,
  ): Promise<{ host: string; port: number }> {
    return new Promise((resolve, reject) => {
      this.sshClient = new SshClient();

      this.sshClient.on('ready', () => {
        this.server = net.createServer((sock) => {
          if (!this.sshClient) {
            sock.end();
            return;
          }
          this.sshClient.forwardOut(
            sock.remoteAddress || '127.0.0.1',
            sock.remotePort || 0,
            targetHost,
            targetPort,
            (err, stream) => {
              if (err) {
                sock.end();
                return;
              }
              sock.pipe(stream).pipe(sock);
            },
          );
        });

        this.server.listen(0, '127.0.0.1', () => {
          if (!this.server) return reject(new Error('Server failed to start'));
          const address = this.server.address() as net.AddressInfo;
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

  close(): void {
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
