import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './auth/auth.guard';
import { ReadingsController } from './readings/readings.controller';
import { HealthController } from './health/health.controller';
import { WaitingRoomController } from './waitingroom/waiting-room.controller';
import { WaitingRoomService } from './waitingroom/waiting-room.service';
import { WaitingRoomGuard } from './waitingroom/waiting-room.guard';
import { RateLimitGuard } from './ratelimit/rate-limit.guard';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { AdminController } from './admin/admin.controller';
import { AdminGuard } from './admin/admin.guard';
import { UserUsageInterceptor, USAGE_REDIS } from './usage/user-usage.interceptor';
import { redis } from './common/redis';

@Module({
  controllers: [AuthController, ReadingsController, HealthController, WaitingRoomController, AdminController],
  providers: [
    AuthService,
    AuthGuard,
    AdminGuard,
    WaitingRoomService,
    WaitingRoomGuard,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: USAGE_REDIS, useValue: redis },
    { provide: APP_INTERCEPTOR, useClass: UserUsageInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
