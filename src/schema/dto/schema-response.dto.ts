import { ApiProperty } from '@nestjs/swagger';

export class TableResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  type?: string;

  @ApiProperty({ required: false })
  engine?: string;
}

export class ColumnResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  isNullable: boolean;

  @ApiProperty({ required: false })
  defaultValue?: string;
}

export class IndexResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  column: string;

  @ApiProperty()
  isUnique: boolean;
}

export class ForeignKeyResponseDto {
  @ApiProperty()
  constraintName: string;

  @ApiProperty()
  columnName: string;

  @ApiProperty()
  referencedTable: string;

  @ApiProperty()
  referencedColumn: string;
}

export class ConstraintResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;
}

export class ParameterResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;

  @ApiProperty({ enum: ['IN', 'OUT', 'INOUT'] })
  mode: 'IN' | 'OUT' | 'INOUT';
}
