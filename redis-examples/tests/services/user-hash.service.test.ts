import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { UserHashService } from '../../src/services/user-hash.service.js';
import '../setup.js';

async function createUser() {
  return prisma.user.create({
    data: {
      email: `user-hash-${Date.now()}-${Math.random()}@example.com`,
      name: 'Hash User',
    },
  });
}

describe('UserHashService', () => {
  const userHashService = new UserHashService();

  it('DB에서 사용자 프로필을 조회하고 출력 형태로 변환한다', async () => {
    const user = await createUser();

    const profile = await userHashService.getUserProfileFromDatabase(user.id);

    expect(profile).toMatchObject({
      id: user.id,
      email: user.email,
      name: 'Hash User',
      point: 0,
      status: 'ACTIVE',
    });
    expect(profile.createdAt).toEqual(expect.any(String));
    expect(profile.updatedAt).toEqual(expect.any(String));
  });

  it('사용자 프로필을 Redis Hash에 저장하고 TTL을 설정한다', async () => {
    const user = await createUser();
    const profile = await userHashService.getUserProfileFromDatabase(user.id);
    const key = RedisKey.hash.userProfile(user.id);

    await userHashService.saveUserProfileToHash(profile, 60);

    const hash = await redis.hGetAll(key);
    expect(hash).toMatchObject({
      id: String(user.id),
      email: user.email,
      name: 'Hash User',
      point: '0',
      status: 'ACTIVE',
    });

    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('캐시가 없으면 DB에서 조회한 뒤 Redis Hash에 저장한다', async () => {
    const user = await createUser();
    const key = RedisKey.hash.userProfile(user.id);

    await expect(redis.exists(key)).resolves.toBe(0);

    const profile = await userHashService.getUserProfile(user.id);

    expect(profile.id).toBe(user.id);
    await expect(redis.exists(key)).resolves.toBe(1);
  });

  it('Redis Hash에 캐시가 있으면 캐시 값을 반환한다', async () => {
    const user = await createUser();
    const dbProfile = await userHashService.getUserProfileFromDatabase(user.id);

    await userHashService.saveUserProfileToHash({
      ...dbProfile,
      name: 'Cached Hash User',
    });

    const profile = await userHashService.getUserProfile(user.id);

    expect(profile.name).toBe('Cached Hash User');
  });

  it('사용자 프로필을 수정하고 Redis Hash를 최신 값으로 갱신한다', async () => {
    const user = await createUser();

    const updated = await userHashService.updateUserProfile(user.id, {
      name: 'Updated Hash User',
      status: 'INACTIVE',
    });
    const hash = await redis.hGetAll(RedisKey.hash.userProfile(user.id));

    expect(updated).toMatchObject({
      id: user.id,
      name: 'Updated Hash User',
      status: 'INACTIVE',
    });
    expect(hash).toMatchObject({
      name: 'Updated Hash User',
      status: 'INACTIVE',
    });
  });

  it('사용자 포인트를 증가시키고 Redis Hash를 갱신한다', async () => {
    const user = await createUser();

    const updated = await userHashService.increaseUserPoint(user.id, 10);
    const hash = await redis.hGetAll(RedisKey.hash.userProfile(user.id));

    expect(updated.point).toBe(10);
    expect(hash.point).toBe('10');
  });

  it('사용자 프로필 Hash를 삭제한다', async () => {
    const user = await createUser();
    await userHashService.getUserProfile(user.id);
    const key = RedisKey.hash.userProfile(user.id);

    await userHashService.deleteUserProfileHash(user.id);

    await expect(redis.exists(key)).resolves.toBe(0);
  });
});
