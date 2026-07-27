import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { UserZSetServicve } from '../../src/services/user-zset.service.js';
import '../setup.js';

async function createUser(name: string, point = 0) {
  return prisma.user.create({
    data: {
      email: `user-zset-${Date.now()}-${Math.random()}@example.com`,
      name,
      point,
    },
  });
}

describe('UserZSetServicve', () => {
  const service = new UserZSetServicve();

  it('사용자 점수를 설정하고 현재 점수와 순위를 조회한다', async () => {
    const first = await createUser('First');
    const second = await createUser('Second');
    await service.setUserPointRankingScore(first.id, 10);
    await service.setUserPointRankingScore(second.id, 30);

    await expect(service.getUserPointRankingScore(first.id)).resolves.toBe(10);
    await expect(service.getUserPointRank(first.id)).resolves.toBe(2);
    await expect(service.getUserPointRank(999999)).resolves.toBeNull();
  });

  it('DB 포인트와 Redis 랭킹 점수를 함께 증가시킨다', async () => {
    const user = await createUser('Increase', 5);

    const updated = await service.increaseUserPoint(user.id, 7);

    expect(updated.point).toBe(12);
    await expect(service.getUserPointRankingScore(user.id)).resolves.toBe(12);
  });

  it('상위 사용자 정보를 랭킹 순서로 DB 데이터와 결합한다', async () => {
    const low = await createUser('Low', 10);
    const high = await createUser('High', 30);
    await service.setUserPointRankingScore(low.id, 10);
    await service.setUserPointRankingScore(high.id, 30);

    const ranking = await service.getTopUserPointRanking(2);

    expect(ranking.map((user) => user.id)).toEqual([high.id, low.id]);
    expect(ranking[0]).toMatchObject({
      name: 'High',
      point: 30,
      rankingScore: 30,
      rank: 1,
    });
    expect(ranking[0].createdAt).toEqual(expect.any(String));
  });

  it('DB 사용자 포인트를 Redis 랭킹에 동기화한다', async () => {
    const first = await createUser('Sync First', 15);
    const second = await createUser('Sync Second', 25);

    await service.syncUserPointRankingFromDatabase();

    await expect(service.getUserPointRankingScore(first.id)).resolves.toBe(15);
    await expect(service.getUserPointRankingScore(second.id)).resolves.toBe(25);
  });

  it('사용자를 제거하고 랭킹 전체를 초기화한다', async () => {
    const user = await createUser('Remove', 10);
    await service.setUserPointRankingScore(user.id, 10);

    await service.removeUserFromPointRanking(user.id);
    await expect(service.getUserPointRank(user.id)).resolves.toBeNull();

    await service.setUserPointRankingScore(user.id, 10);
    await service.clearUserPointRanking();
    await expect(redis.exists(RedisKey.zset.userPointRanking())).resolves.toBe(0);
  });
});
