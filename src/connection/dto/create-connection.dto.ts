import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum DatabaseType {
  MARIADB = 'mariadb',
  POSTGRES = 'postgres',
  MONGODB = 'mongodb',
}

export enum Environment {
  PRODUCTION = 'production',
  STAGING = 'staging',
  DEVELOPMENT = 'development',
  LOCAL = 'local',
}

export class SshConfigDto {
  @ApiProperty()
  @IsString()
  host: string;

  @ApiProperty()
  @IsNumber()
  port: number;

  @ApiProperty()
  @IsString()
  user: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  privateKey?: string;
}

export class CreateConnectionDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: DatabaseType })
  @IsEnum(DatabaseType)
  type: DatabaseType;

  @ApiProperty({ enum: Environment })
  @IsEnum(Environment)
  environment: Environment;

  @ApiProperty()
  @IsString()
  host: string;

  @ApiProperty()
  @IsNumber()
  port: number;

  @ApiProperty()
  @IsString()
  user: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiProperty()
  @IsString()
  database: string;

  @ApiProperty({ type: SshConfigDto, required: false })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SshConfigDto)
  ssh?: SshConfigDto;
}
