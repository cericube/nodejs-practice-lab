import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { VisitorSetService } from '../../src/services/visitor-set.service.js';
import '../setup.js';

describe('VisitorSetService', () => {
  const visitorSetService = new VisitorSetService();

  it('일일 방문자를 기록하고 같은 사용자의 중복 방문은 한 번만 집계한다', async () => {
    const date = '2026-07-02';

    const first = await visitorSetService.addDailyVisitor(date, 1);
    const duplicated = await visitorSetService.addDailyVisitor(date, 1);

    expect(first).toEqual({
      date,
      userId: 1,
      isNewVisitor: true,
      visitorCount: 1,
    });
    expect(duplicated).toEqual({
      date,
      userId: 1,
      isNewVisitor: false,
      visitorCount: 1,
    });
  });

  it('방문자 수, 방문 여부, 정렬된 요약 목록을 조회한다', async () => {
    const date = '2026-07-03';

    await visitorSetService.addDailyVisitor(date, 3);
    await visitorSetService.addDailyVisitor(date, 1);
    await visitorSetService.addDailyVisitor(date, 2);

    await expect(visitorSetService.getDailyVisitorCount(date)).resolves.toBe(3);
    await expect(visitorSetService.hasVisitedToday(date, 2)).resolves.toBe(true);
    await expect(visitorSetService.hasVisitedToday(date, 9)).resolves.toBe(false);

    await expect(visitorSetService.getDailyVisitorSummary(date)).resolves.toEqual({
      date,
      visitorCount: 3,
      userIds: [1, 2, 3],
    });
  });

  it('방문자 Set에 TTL을 설정하고 삭제할 수 있다', async () => {
    const date = '2026-07-04';
    const key = RedisKey.set.dailyVisitors(date);

    await visitorSetService.addDailyVisitor(date, 1);

    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 24 * 2);

    await visitorSetService.deleteDailyVisitors(date);

    await expect(redis.exists(key)).resolves.toBe(0);
  });
});