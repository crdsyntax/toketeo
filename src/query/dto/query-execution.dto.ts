import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExecuteQueryDto {
  @ApiProperty({ description: 'The raw SQL query to execute' })
  @IsString()
  @IsNotEmpty()
  sql: string;

  @ApiProperty({ description: 'Query parameters', required: false })
  @IsOptional()
  @IsArray()
  params?: unknown[];

  @ApiProperty({ description: 'Target schema/database', required: false })
  @IsString()
  @IsOptional()
  schema?: string;

  @ApiProperty({
    description: 'Page number (starts at 1)',
    required: false,
    default: 1,
  })
  @IsOptional()
  page?: number;

  @ApiProperty({ description: 'Page size', required: false, default: 1000 })
  @IsOptional()
  pageSize?: number;
}

export class QueryResponseDto {
  @ApiProperty({ description: 'Columns returned by the query' })
  columns: string[];

  @ApiProperty({ description: 'Data rows' })
  rows: Record<string, unknown>[];

  @ApiProperty({ description: 'Execution time in milliseconds' })
  executionTime: number;

  @ApiProperty({
    description: 'Number of rows affected by the query',
    required: false,
  })
  affectedRows?: number;

  @ApiProperty({
    description: 'Informational message from the server',
    required: false,
  })
  message?: string;

  @ApiProperty({ description: 'Current page', required: false })
  page?: number;

  @ApiProperty({ description: 'Page size', required: false })
  pageSize?: number;

  @ApiProperty({
    description: 'Whether more results might be available',
    required: false,
  })
  hasMore?: boolean;
}
