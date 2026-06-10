import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { QueryService } from './query.service';
import { ExecuteQueryDto, QueryResponseDto } from './dto/query-execution.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
