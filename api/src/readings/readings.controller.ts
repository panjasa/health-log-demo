import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { AuthGuard } from '../auth/auth.guard';
import { WaitingRoomGuard } from '../waitingroom/waiting-room.guard';
import { getDb } from '../common/mongo';

type ReadingType = 'bp' | 'glucose' | 'weight';
const TYPES: ReadingType[] = ['bp', 'glucose', 'weight'];

function num(v: unknown, min: number, max: number, name: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new BadRequestException(`${name} must be ${min}-${max}`);
  return n;
}

// Only the fields we expect are stored, with sane ranges.
function validate(type: ReadingType, v: any): Record<string, unknown> {
  switch (type) {
    case 'bp':
      return {
        systolic: num(v?.systolic, 50, 260, 'systolic'),
        diastolic: num(v?.diastolic, 30, 180, 'diastolic'),
        ...(v?.pulse !== undefined && v?.pulse !== '' ? { pulse: num(v.pulse, 20, 250, 'pulse') } : {}),
      };
    case 'glucose':
      return {
        mgdl: num(v?.mgdl, 20, 700, 'mgdl'),
        context: ['fasting', 'after_meal', 'random'].includes(v?.context) ? v.context : 'random',
      };
    case 'weight':
      return { kg: num(v?.kg, 2, 400, 'kg') };
  }
}

@Controller('readings')
@UseGuards(AuthGuard, WaitingRoomGuard)
export class ReadingsController {
  @Post()
  async create(@Req() req: any, @Body() body: { type?: ReadingType; values?: any; takenAt?: string; note?: string }) {
    if (!body?.type || !TYPES.includes(body.type)) throw new BadRequestException('type must be bp, glucose or weight');
    const takenAt = body.takenAt ? new Date(body.takenAt) : new Date();
    if (isNaN(takenAt.getTime())) throw new BadRequestException('invalid takenAt');
    const doc = {
      userId: req.user.sub,
      type: body.type,
      values: validate(body.type, body.values),
      note: typeof body.note === 'string' ? body.note.slice(0, 200) : undefined,
      takenAt,
      createdAt: new Date(),
    };
    const r = await (await getDb()).collection('readings').insertOne(doc);
    return { id: r.insertedId, ...doc };
  }

  @Get()
  async list(@Req() req: any, @Query('type') type?: ReadingType, @Query('limit') limit = '50') {
    const filter: any = { userId: req.user.sub };
    if (type) {
      if (!TYPES.includes(type)) throw new BadRequestException('bad type');
      filter.type = type;
    }
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const items = await (await getDb())
      .collection('readings')
      .find(filter, { projection: { userId: 0 } })
      .sort({ takenAt: -1 })
      .limit(n)
      .toArray();
    return items.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  }

  @Get('latest')
  async latest(@Req() req: any) {
    const db = await getDb();
    const out: Record<string, unknown> = {};
    await Promise.all(
      TYPES.map(async (t) => {
        out[t] = await db.collection('readings').findOne({ userId: req.user.sub, type: t }, { sort: { takenAt: -1 }, projection: { userId: 0 } });
      }),
    );
    return out;
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    if (!ObjectId.isValid(id)) throw new BadRequestException('bad id');
    const r = await (await getDb()).collection('readings').deleteOne({ _id: new ObjectId(id), userId: req.user.sub });
    if (r.deletedCount === 0) throw new NotFoundException();
    return { deleted: true };
  }
}
