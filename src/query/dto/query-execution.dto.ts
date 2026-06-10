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
  params?: any[];

  @ApiProperty({ description: 'Target schema/database', required: false })
  @IsString()
  @IsOptional()
  schema?: string;
}

export class QueryResponseDto {
  @ApiProperty({ description: 'Columns returned by the query' })
  columns: string[];

  @ApiProperty({ description: 'Data rows' })
  rows: any[];

  @ApiProperty({ description: 'Execution time in milliseconds' })
  executionTime: number;
}
