import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all audit logs' })
  async getLogs(
    @Query('limit') limit = 10,
    @Query('offset') offset = 0,
  ) {
    return this.auditService.getLogs(Number(limit), Number(offset));
  }

  @Get('export/json')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Export audit logs as JSON file' })
  async exportJson(@Res() res: Response) {
    const logs = await this.auditService.getLogs(1000, 0);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.json');
    return res.send(JSON.stringify(logs, null, 2));
  }

  @Get('export/csv')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Export audit logs as CSV file' })
  async exportCsv(@Res() res: Response) {
    const logs = await this.auditService.getLogs(1000, 0);
    const header = 'id,userId,action,resource,resourceId,timestamp\n';
    const rows = logs.map(log => 
      `${log.id},${log.userId},${log.action},${log.resource},${log.resourceId || ''},${log.timestamp.toISOString()}`
    ).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    return res.send(header + rows);
  }
}
