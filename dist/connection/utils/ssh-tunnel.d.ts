import { SshConfigDto } from '../dto/create-connection.dto';
export declare class SshTunnel {
    private sshClient;
    private server;
    create(sshConfig: SshConfigDto, targetHost: string, targetPort: number): Promise<{
        host: string;
        port: number;
    }>;
    close(): void;
}
