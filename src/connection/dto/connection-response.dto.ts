import { ApiProperty } from '@nestjs/swagger';
import { DatabaseType, SshConfigDto, Environment } from './create-connection.dto';

export class ConnectionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  type: DatabaseType;

  @ApiProperty({ enum: Environment })
  environment: Environment;

  @ApiProperty()
  host: string;

  @ApiProperty()
  port: number;

  @ApiProperty()
  user: string;

  @ApiProperty()
  database: string;

  @ApiProperty({ type: SshConfigDto, required: false })
  ssh?: SshConfigDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
