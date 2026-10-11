import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { config } from '../common/config';
import { getDb } from '../common/mongo';

export interface AppUser {
  sub: string;
  email: string;
  name?: string;
  /** users._id as a hex string. Missing on tokens issued before it was added. */
  uid?: string;
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
    const doc = await db
      .collection('users')
      .findOneAndUpdate(
        { email: user.email },
        { $set: { sub: user.sub, name: user.name, lastLoginAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, returnDocument: 'after' },
      );
    const uid = doc?._id?.toString();
    const token = jwt.sign({ sub: user.sub, uid, email: user.email, name: user.name, typ: 'access' }, config.jwtSecret, {
      expiresIn: '8h',
    });
    return { token, user: { ...user, uid } };
  }

  verify(token: string): AppUser {
    try {
      const p = jwt.verify(token, config.jwtSecret) as any;
      if (p.typ !== 'access') throw new Error('wrong type');
      return { sub: p.sub, email: p.email, name: p.name, uid: typeof p.uid === 'string' ? p.uid : undefined };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
