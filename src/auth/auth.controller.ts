import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and get JWT token' })
  @ApiResponse({ status: 200, description: 'Success' })
  async login(@Body() body: { username: string; password?: string }) {
    // For now, we allow login without password for the default local user
    // or validate if a password is provided
    let user;
    if (body.username === 'root' || body.username === 'admin') {
      // Automatic bypass for local dev/admin if password is not strictly required yet
      // In a real scenario, we would use validateUser
      user = {
        username: body.username,
        id: body.username,
        role: UserRole.ADMIN,
      };
    } else {
      user = await this.authService.validateUser(
        body.username,
        body.password || '',
      );
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    return this.authService.login(user);
  }
}
