import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { WaitingRoomService } from './waiting-room.service';
import { config } from '../common/config';

// Routes behind this guard need a valid admission token from the waiting room.
// Runs after AuthGuard, so req.user is set.
@Injectable()
export class WaitingRoomGuard implements CanActivate {
  constructor(private wr: WaitingRoomService) {}
  canActivate(ctx: ExecutionContext): boolean {
    if (!config.waitingRoom.enabled) return true;
    const req = ctx.switchToHttp().getRequest();
    if (this.wr.isAdmitted(req.user.sub, req.headers['x-admission-token'])) return true;
    throw new HttpException({ statusCode: 428, message: 'Join the waiting room first', waitingRoom: true }, 428);
  }
}
