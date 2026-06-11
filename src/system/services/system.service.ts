import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';

interface MysqlStatus {
  available: boolean;
  checkedPorts: number[];
}

const MYSQL_PORTS = [3306, 3307, 33060];

function checkPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const done = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
    socket.connect(port, host);
  });
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  async getMysqlStatus(): Promise<MysqlStatus> {
    const results = await Promise.all(
      MYSQL_PORTS.map((port) => checkPort('127.0.0.1', port, 1000)),
    );

    const available = results.some(Boolean);
    this.logger.debug(`MySQL status check — available: ${available}`);

    return { available, checkedPorts: MYSQL_PORTS };
  }
}
