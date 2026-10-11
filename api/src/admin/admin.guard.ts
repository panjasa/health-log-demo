import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { config } from '../common/config';

// Use after AuthGuard. No role system yet: admins are the emails in ADMIN_EMAILS.
// Empty list = nobody is admin (safe default).
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const email: string | undefined = ctx.switchToHttp().getRequest().user?.email;
    if (!email || !config.adminEmails.includes(email.toLowerCase())) throw new ForbiddenException('Admin only');
    return true;
  }
}
