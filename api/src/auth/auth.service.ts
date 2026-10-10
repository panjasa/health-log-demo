import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { config } from '../common/config';
import { getDb } from '../common/mongo';

export interface AppUser {
  sub: string;
  email: string;
  name?: string;
}

@Injectable()
export class AuthService {
  private google = new OAuth2Client();

  // Verify the Google ID token from the browser, upsert the user,
  // and issue our own short-lived JWT. Passwords are never stored.
  async loginWithGoogle(idToken: string): Promise<{ token: string; user: AppUser }> {
    if (!config.googleClientId) throw new ForbiddenException('Google login not configured');
    const ticket = await this.google
      .verifyIdToken({ idToken, audience: config.googleClientId })
      .catch(() => {
        throw new UnauthorizedException('Invalid Google token');
      });
    const p = ticket.getPayload();
    if (!p?.email || !p.email_verified) throw new UnauthorizedException('Email not verified');
    return this.issue({ sub: `google:${p.sub}`, email: p.email, name: p.name });
  }

  // Local development and load testing only. Disabled unless DEV_LOGIN=true.
  async devLogin(email: string): Promise<{ token: string; user: AppUser }> {
    if (!config.devLogin) throw new ForbiddenException('Dev login disabled');
    return this.issue({ sub: `dev:${email}`, email, name: email.split('@')[0] });
  }

  private async issue(user: AppUser) {
    const db = await getDb();
    await db
      .collection('users')
      .updateOne(
        { email: user.email },
        { $set: { sub: user.sub, name: user.name, lastLoginAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    const token = jwt.sign({ sub: user.sub, email: user.email, name: user.name, typ: 'access' }, config.jwtSecret, {
      expiresIn: '8h',
    });
    return { token, user };
  }

  verify(token: string): AppUser {
    try {
      const p = jwt.verify(token, config.jwtSecret) as any;
      if (p.typ !== 'access') throw new Error('wrong type');
      return { sub: p.sub, email: p.email, name: p.name };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
