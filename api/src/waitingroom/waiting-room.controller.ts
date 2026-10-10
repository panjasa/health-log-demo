import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { WaitingRoomService } from './waiting-room.service';

@Controller('queue')
export class WaitingRoomController {
  constructor(private wr: WaitingRoomService) {}

  @Post('join')
  @UseGuards(AuthGuard)
  join(@Req() req: any) {
    return this.wr.join(req.user.sub);
  }

  @Post('status')
  @UseGuards(AuthGuard)
  status(@Req() req: any, @Body() body: { ticketToken?: string }) {
    if (!body?.ticketToken) throw new BadRequestException('ticketToken required');
    return this.wr.status(req.user.sub, body.ticketToken);
  }

  @Get('stats')
  stats() {
    return this.wr.snapshot();
  }
}
