import { setTimeout } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { RateLimitService } from '../../src/services/rate-limit.service.js';
import '../setup.js';

describe('RateLimitService', () => {
  const rateLimitService = new RateLimitService();

  it('limit 이하 요청은 허용하고 count와 ttl을 반환한다', async () => {
    const first = await rateLimitService.checkLimit('test:basic', 2, 60);
    const second = await rateLimitService.checkLimit('test:basic', 2, 60);

    //first { allowed: true, count: 1, limit: 2, ttl: 60 }
    //second { allowed: true, count: 2, limit: 2, ttl: 60 }

    expect(first).toMatchObject({
      allowed: true,
      count: 1,
      limit: 2,
    });
    expect(first.ttl).toBeGreaterThan(0);
    expect(first.ttl).toBeLessThanOrEqual(60);

    expect(second).toMatchObject({
      allowed: true,
      count: 2,
      limit: 2,
    });
  });

  it('limit을 초과하면 allowed false를 반환한다', async () => {
    await rateLimitService.checkLimit('test:blocked', 2, 60);
    await rateLimitService.checkLimit('test:blocked', 2, 60);

    const third = await rateLimitService.checkLimit('test:blocked', 2, 60);

    expect(third).toMatchObject({
      allowed: false,
      count: 3,
      limit: 2,
    });
  });

  it('TTL이 없는 rate limit key를 발견하면 TTL을 복구(설정)한다', async () => {
    const key = 'test:no-ttl';
    const redisKey = RedisKey.string.rateLimit(key);

    await redis.set(redisKey, '3');
    //redis.ttl()    → 남은 만료 시간을 조회한다
    await expect(redis.ttl(redisKey)).resolves.toBe(-1);

    const result = await rateLimitService.checkLimit(key, 10, 30);

    expect(result.count).toBe(4);
    expect(result.ttl).toBeGreaterThan(0);
    expect(result.ttl).toBeLessThanOrEqual(30);
    await expect(redis.ttl(redisKey)).resolves.toBeGreaterThan(0);
  });

  it('로그인 IP 기준으로 60초 동안 5회까지만 허용한다', async () => {
    const ip = '127.0.0.1';

    for (let i = 0; i < 5; i += 1) {
      const result = await rateLimitService.checkLoginLimitByIp(ip);
      expect(result.allowed).toBe(true);
    }

    const blocked = await rateLimitService.checkLoginLimitByIp(ip);

    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(6);
    expect(blocked.limit).toBe(5);
  });

  it('로그인 IP 제한 시간이 지나면 요청 횟수가 초기화되어 다시 허용한다', async () => {
    const ip = '127.0.0.2';
    const redisKey = RedisKey.string.rateLimit(`login:ip:${ip}`);

    for (let i = 0; i < 5; i += 1) {
      const result = await rateLimitService.checkLoginLimitByIp(ip);
      expect(result.allowed).toBe(true);
    }

    await expect(rateLimitService.checkLoginLimitByIp(ip)).resolves.toMatchObject({
      allowed: false,
      count: 6,
      limit: 5,
    });

    // 실제 로그인 제한 시간은 60초입니다.
    // 테스트에서 60초를 기다리면 느리므로 TTL을 1초로 줄여 제한 시간이 지난 상황을 재현합니다.
    await redis.expire(redisKey, 1);
    await setTimeout(1100);

    await expect(redis.get(redisKey)).resolves.toBeNull();

    const afterWindow = await rateLimitService.checkLoginLimitByIp(ip);

    expect(afterWindow).toMatchObject({
      allowed: true,
      count: 1,
      limit: 5,
    });
    expect(afterWindow.ttl).toBeGreaterThan(0);
    expect(afterWindow.ttl).toBeLessThanOrEqual(60);
  });

  it('사용자 ID 기준으로 10초 동안 20회까지만 API 요청을 허용한다', async () => {
    const userId = 1;

    for (let i = 0; i < 20; i += 1) {
      const result = await rateLimitService.checkApiLimitByUser(userId);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(20);
      expect(result.ttl).toBeGreaterThan(0);
      expect(result.ttl).toBeLessThanOrEqual(10);
    }

    const blocked = await rateLimitService.checkApiLimitByUser(userId);

    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(21);
    expect(blocked.limit).toBe(20);
  });

  it('현재 요청 횟수를 조회하고 제한 상태를 초기화한다', async () => {
    const key = 'test:reset';

    await rateLimitService.checkLimit(key, 10, 60);
    await rateLimitService.checkLimit(key, 10, 60);

    await expect(rateLimitService.getCurrentCount(key)).resolves.toBe(2);

    await rateLimitService.resetLimit(key);

    await expect(rateLimitService.getCurrentCount(key)).resolves.toBe(0);
  });
});
