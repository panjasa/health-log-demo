import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { redis } from '../common/redis';
import { config } from '../common/config';
import { setQueueLength, waitingAdmitted, waitingJoined } from '../common/metrics';

// Virtual waiting room, first come first served.
//   wr:tail     = last ticket number handed out
//   wr:released = highest ticket allowed in
//   wr:last     = time (ms) the release pointer last moved
// The release pointer moves forward at ADMIT_PER_SEC. The Lua script runs
// atomically inside Redis, so every Cloud Run instance sees one shared queue.
const ADVANCE = `
local tail = tonumber(redis.call('GET', KEYS[1]) or '0')
local released = tonumber(redis.call('GET', KEYS[2]) or '0')
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local last = tonumber(redis.call('GET', KEYS[3]) or ARGV[1])
local add = math.floor((now - last) * rate / 1000)
if add > 0 then
  released = released + add
  last = last + math.floor(add * 1000 / rate)
end
if released >= tail then
  released = tail
  last = now
end
redis.call('SET', KEYS[2], released)
redis.call('SET', KEYS[3], last)
return {tail, released}
`;

// Joining an empty queue restarts the release clock. Without this, idle time
// would build up "credit" and the next rush would be let in all at once.
const JOIN = `
local tail = redis.call('INCR', KEYS[1])
local released = tonumber(redis.call('GET', KEYS[2]) or '0')
if released >= tail - 1 then
  redis.call('SET', KEYS[3], ARGV[1])
end
return tail
`;

export interface QueueStatus {
  admitted: boolean;
  position: number;
  etaSec: number;
  admissionToken?: string;
  ticket: number;
}

@Injectable()
export class WaitingRoomService {
  private async advance(): Promise<[number, number]> {
    const r = (await redis.eval(ADVANCE, 3, 'wr:tail', 'wr:released', 'wr:last', Date.now(), config.waitingRoom.admitPerSecond)) as [number, number];
    setQueueLength(Math.max(0, r[0] - r[1]));
    return r;
  }

  async join(sub: string): Promise<{ ticketToken: string; ticket: number }> {
    const ticket = (await redis.eval(JOIN, 3, 'wr:tail', 'wr:released', 'wr:last', Date.now())) as number;
    waitingJoined.add(1);
    // Signed so the browser cannot claim a better place in the queue.
    const ticketToken = jwt.sign({ sub, ticket, typ: 'ticket' }, config.jwtSecret, { expiresIn: '2h' });
    return { ticketToken, ticket };
  }

  async status(sub: string, ticketToken: string): Promise<QueueStatus> {
    let p: any;
    try {
      p = jwt.verify(ticketToken, config.jwtSecret);
    } catch {
      throw new UnauthorizedException('Invalid ticket');
    }
    if (p.typ !== 'ticket' || p.sub !== sub) throw new UnauthorizedException('Invalid ticket');
    const [, released] = await this.advance();
    const position = Math.max(0, p.ticket - released);
    if (position === 0) {
      waitingAdmitted.add(1);
      const admissionToken = jwt.sign({ sub, typ: 'admit' }, config.jwtSecret, {
        expiresIn: config.waitingRoom.admissionTtlSec,
      });
      return { admitted: true, position: 0, etaSec: 0, admissionToken, ticket: p.ticket };
    }
    return {
      admitted: false,
      position,
      etaSec: Math.ceil(position / config.waitingRoom.admitPerSecond),
      ticket: p.ticket,
    };
  }

  isAdmitted(sub: string, admissionToken?: string): boolean {
    if (!admissionToken) return false;
    try {
      const p = jwt.verify(admissionToken, config.jwtSecret) as any;
      return p.typ === 'admit' && p.sub === sub;
    } catch {
      return false;
    }
  }

  async snapshot() {
    const [tail, released] = await this.advance();
    return {
      enabled: config.waitingRoom.enabled,
      admitPerSecond: config.waitingRoom.admitPerSecond,
      waiting: Math.max(0, tail - released),
      totalJoined: tail,
    };
  }
}
