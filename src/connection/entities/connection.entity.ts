import {
  DatabaseType,
  SshConfigDto,
  Environment,
} from '../dto/create-connection.dto';

export class ConnectionEntity {
  id: string;
  name: string;
  type: DatabaseType;
  environment: Environment;
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;
  ssh?: SshConfigDto;
  createdAt: Date;
  updatedAt: Date;
}
