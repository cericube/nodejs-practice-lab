import { setTimeout } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { SessionHashService } from '../../src/services/session-hash.service.js';
import '../setup.js';

describe('SessionHashService', () => {
  const sessionHashService = new SessionHashService();

  it('로그인 세션을 Redis Hash에 저장하고 TTL을 설정한다', async () => {
    const session = await sessionHashService.createSession(
      {
        sessionId: 'session-create',
        userId: 1,
        email: 'session-create@example.com',
        role: 'USER',
      },
      60,
    );
    const key = RedisKey.hash.userSession(session.sessionId);

    const hash = await redis.hGetAll(key);

    expect(session).toMatchObject({
      sessionId: 'session-create',
      userId: 1,
      email: 'session-create@example.com',
      role: 'USER',
      userAgent: '',
      ip: '',
    });
    expect(hash).toMatchObject({
      sessionId: 'session-create',
      userId: '1',
      email: 'session-create@example.com',
      role: 'USER',
    });

    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('Redis Hash에 저장된 세션을 조회한다', async () => {
    const created = await sessionHashService.createSession({
      sessionId: 'session-get',
      userId: 2,
      email: 'session-get@example.com',
      role: 'ADMIN',
      userAgent: 'vitest',
      ip: '127.0.0.1',
    });

    const found = await sessionHashService.getSession(created.sessionId);

    expect(found).toEqual(created);
  });

  it('세션이 없으면 null을 반환한다', async () => {
    await expect(sessionHashService.getSession('missing-session')).resolves.toBeNull();
  });

  it('세션의 userId 필드만 숫자로 조회한다', async () => {
    await sessionHashService.createSession({
      sessionId: 'session-user-id',
      userId: 3,
      email: 'session-user-id@example.com',
      role: 'USER',
    });

    await expect(sessionHashService.getSessionUserId('session-user-id')).resolves.toBe(3);
    await expect(sessionHashService.getSessionUserId('missing-session')).resolves.toBeNull();
  });

  it('마지막 접근 시간을 갱신한다', async () => {
    const created = await sessionHashService.createSession({
      sessionId: 'session-touch',
      userId: 4,
      email: 'session-touch@example.com',
      role: 'USER',
    });

    await setTimeout(5);
    await sessionHashService.touchSession(created.sessionId);

    const touched = await sessionHashService.getSession(created.sessionId);
    expect(touched?.lastAccessedAt).toEqual(expect.any(String));
    expect(touched?.lastAccessedAt).not.toBe(created.lastAccessedAt);
  });

  it('세션을 삭제한다', async () => {
    const created = await sessionHashService.createSession({
      sessionId: 'session-delete',
      userId: 5,
      email: 'session-delete@example.com',
      role: 'USER',
    });

    await sessionHashService.deleteSession(created.sessionId);

    await expect(sessionHashService.getSession(created.sessionId)).resolves.toBeNull();
  });
});
