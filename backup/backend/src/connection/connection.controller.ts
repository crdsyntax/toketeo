import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  Patch,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConnectionService } from './connection.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { ConnectionResponseDto } from './dto/connection-response.dto';

@ApiTags('connections')
@Controller('connections')
export class ConnectionController {
  constructor(private readonly connectionService: ConnectionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new database connection' })
  @ApiResponse({ status: 201, type: ConnectionResponseDto })
  async create(
    @Body() dto: CreateConnectionDto,
  ): Promise<ConnectionResponseDto> {
    return this.connectionService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all database connections' })
  @ApiResponse({ status: 200, type: [ConnectionResponseDto] })
  async findAll(): Promise<ConnectionResponseDto[]> {
    return this.connectionService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a connection by ID' })
  @ApiResponse({ status: 200, type: ConnectionResponseDto })
  async findOne(@Param('id') id: string): Promise<ConnectionResponseDto> {
    return this.connectionService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a database connection' })
  @ApiResponse({ status: 200, type: ConnectionResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateConnectionDto>,
  ): Promise<ConnectionResponseDto> {
    return this.connectionService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a connection' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    return this.connectionService.remove(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test an existing database connection' })
  async testExistingConnection(@Param('id') id: string) {
    const isConnected = await this.connectionService.testConnectionById(id);
    if (!isConnected) {
      throw new BadRequestException('Could not connect to the database');
    }
    return { message: 'Connection successful' };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test a database connection before saving' })
  async testConnection(@Body() dto: CreateConnectionDto) {
    const isConnected = await this.connectionService.testConnection(dto);
    if (!isConnected) {
      throw new BadRequestException('Could not connect to the database');
    }
    return { message: 'Connection successful' };
  }
}
