import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { config } from '../common/config';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('google')
  google(@Body() body: { idToken?: string }) {
    if (!body?.idToken) throw new BadRequestException('idToken required');
    return this.auth.loginWithGoogle(body.idToken);
  }

  @Post('dev')
  dev(@Body() body: { email?: string }) {
    const email = body?.email || 'demo@example.com';
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new BadRequestException('invalid email');
    return this.auth.devLogin(email);
  }

  @Get('config')
  cfg() {
    return { googleEnabled: !!config.googleClientId, devLogin: config.devLogin, waitingRoom: config.waitingRoom.enabled };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: any) {
    return req.user;
  }
}
