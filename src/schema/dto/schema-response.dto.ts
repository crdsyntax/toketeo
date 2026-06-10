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
