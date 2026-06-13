import { Controller, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QueryService } from './query.service';
import { ExecuteQueryDto, QueryResponseDto } from './dto/query-execution.dto';

@ApiTags('query')
@Controller('connections/:connectionId/query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('execute')
  @ApiOperation({ summary: 'Execute a raw SQL query' })
  @ApiResponse({ status: 200, type: QueryResponseDto })
  async execute(
    @Param('connectionId') connectionId: string,
    @Body() dto: ExecuteQueryDto,
  ): Promise<QueryResponseDto> {
    return this.queryService.execute(connectionId, dto);
  }
}
