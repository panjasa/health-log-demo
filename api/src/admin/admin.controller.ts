import { BadRequestException, Controller, Get, NotFoundException, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from './admin.guard';
import { getDb } from '../common/mongo';
import { redis } from '../common/redis';
import { bangkokDate, usageKey, USAGE_TTL_SEC } from '../usage/user-usage.interceptor';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = USAGE_TTL_SEC / 86400; // older keys have expired anyway

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function parseDate(v: string | undefined, name: string): string | undefined {
  if (v === undefined || v === '') return undefined;
  if (!DATE.test(v) || isNaN(new Date(`${v}T00:00:00Z`).getTime())) throw new BadRequestException(`${name} must be YYYY-MM-DD`);
  return v;
}

@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  // GET /admin/usage?email=...|userId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
  // Dates are Asia/Bangkok calendar days. Default: the last 30 days including today.
  @Get('usage')
  async usage(
    @Query('email') email?: string,
    @Query('userId') userId?: string,
    @Query('from') fromQ?: string,
    @Query('to') toQ?: string,
  ) {
    if (!email && !userId) throw new BadRequestException('email or userId required');
    const to = parseDate(toQ, 'to') ?? bangkokDate();
    const from = parseDate(fromQ, 'from') ?? addDays(to, -29);
    if (from > to) throw new BadRequestException('from must be <= to');
    const dates: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      dates.push(d);
      if (dates.length > MAX_DAYS) throw new BadRequestException(`range must be at most ${MAX_DAYS} days`);
    }

    const users = (await getDb()).collection('users');
    let user: { _id: ObjectId; email?: string } | null;
    if (email) {
      user = (await users.findOne({ email: email.trim().toLowerCase() }, { projection: { email: 1 } })) as any;
      if (!user) throw new NotFoundException('user not found');
    } else {
      if (!/^[a-f0-9]{24}$/i.test(userId!)) throw new BadRequestException('userId must be a 24-char hex ObjectId');
      user = (await users.findOne({ _id: new ObjectId(userId) }, { projection: { email: 1 } })) as any;
    }
    const id = user?._id.toString() ?? userId!.toLowerCase();

    let values: (string | null)[];
    try {
      values = await redis.mget(dates.map((d) => usageKey(id, d)));
    } catch {
      throw new ServiceUnavailableException('usage store unavailable');
    }
    const daily = dates.map((date, i) => ({ date, count: Number(values[i] ?? 0) }));
    return { userId: id, email: user?.email ?? null, total: daily.reduce((s, x) => s + x.count, 0), daily };
  }
}
