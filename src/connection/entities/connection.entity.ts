import { DatabaseType } from '../dto/create-connection.dto';

export class ConnectionEntity {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  createdAt: Date;
  updatedAt: Date;
}
