import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';

export enum DatabaseType {
  MARIADB = 'mariadb',
  POSTGRES = 'postgres',
  MONGODB = 'mongodb',
}

export class CreateConnectionDto {
  @IsString()
  name: string;

  @IsEnum(DatabaseType)
  type: DatabaseType;

  @IsString()
  host: string;

  @IsNumber()
  port: number;

  @IsString()
  user: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  database: string;
}
