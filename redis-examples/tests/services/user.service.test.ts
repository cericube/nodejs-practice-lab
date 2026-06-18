import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { UserService } from '../../src/services/user.service.js';
import '../setup.js';

describe('UserService', () => {
  const userService = new UserService();

  it('사용자를 생성하고 UserOutput 형태로 반환한다', async () => {
    const user = await userService.createUser({
      email: 'user-create@example.com',
      name: 'Create User',
    });

    expect(user).toMatchObject({
      email: 'user-create@example.com',
      name: 'Create User',
      point: 0,
      status: 'ACTIVE',
    });
    expect(user.id).toEqual(expect.any(Number));
    expect(user.createdAt).toEqual(expect.any(String));
    expect(user.updatedAt).toEqual(expect.any(String));
  });

  it('DB에서 사용자 단건을 조회한다', async () => {
    const created = await userService.createUser({
      email: 'user-find@example.com',
      name: 'Find User',
    });

    const found = await userService.getUserById(created.id);

    expect(found).toEqual(created);
  });

  it('없는 사용자를 조회하면 예외를 던진다', async () => {
    await expect(userService.getUserById(999999)).rejects.toThrow();
  });

  it('캐시에 사용자가 없으면 DB에서 조회한 뒤 Redis에 60초 TTL로 저장한다', async () => {
    const created = await userService.createUser({
      email: 'user-cache-miss@example.com',
      name: 'Cache Miss User',
    });
    const cacheKey = RedisKey.cache.user(created.id);

    await expect(redis.get(cacheKey)).resolves.toBeNull();

    const result = await userService.getUserByIdWithCache(created.id);

    expect(result).toEqual(created);

    const cached = await redis.get(cacheKey);
    expect(cached).not.toBeNull();
    expect(JSON.parse(cached as string)).toEqual(created);

    const ttl = await redis.ttl(cacheKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('캐시에 사용자가 있으면 DB 대신 Redis 값을 반환한다', async () => {
    const created = await userService.createUser({
      email: 'user-cache-hit@example.com',
      name: 'Cache Hit User',
    });
    const cacheKey = RedisKey.cache.user(created.id);
    const cachedUser = {
      ...created,
      name: 'Cached User',
    };

    await redis.set(cacheKey, JSON.stringify(cachedUser), {
      EX: 60,
    });

    const result = await userService.getUserByIdWithCache(created.id);

    expect(result).toEqual(cachedUser);
  });

  it('사용자를 수정하고 기존 Redis 캐시를 삭제한다', async () => {
    const created = await userService.createUser({
      email: 'user-update@example.com',
      name: 'Before Update',
    });
    const cacheKey = RedisKey.cache.user(created.id);

    await userService.getUserByIdWithCache(created.id);
    await expect(redis.get(cacheKey)).resolves.not.toBeNull();

    const updated = await userService.updateUser(created.id, {
      name: 'After Update',
      status: 'INACTIVE',
    });

    expect(updated).toMatchObject({
      id: created.id,
      email: 'user-update@example.com',
      name: 'After Update',
      status: 'INACTIVE',
      point: 0,
    });
    await expect(redis.get(cacheKey)).resolves.toBeNull();
  });

  it('undefined인 수정 필드는 기존 값을 유지한다', async () => {
    const created = await userService.createUser({
      email: 'user-partial-update@example.com',
      name: 'Partial User',
    });

    const updated = await userService.updateUser(created.id, {
      name: 'Name Only Updated',
    });

    expect(updated).toMatchObject({
      id: created.id,
      name: 'Name Only Updated',
      status: 'ACTIVE',
    });
  });

  it('없는 사용자를 수정하면 예외를 던진다', async () => {
    await expect(
      userService.updateUser(999999, {
        name: 'Missing User',
      }),
    ).rejects.toThrow();
  });
});
