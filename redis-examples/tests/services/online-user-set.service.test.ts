import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { OnlineUserSetService } from '../../src/services/online-user-set.service.js';
import '../setup.js';

async function createUser(name = 'Online User Tester') {
  return prisma.user.create({
    data: {
      email: `online-user-${Date.now()}-${Math.random()}@example.com`,
      name,
    },
  });
}

describe('OnlineUserSetService', () => {
  const onlineUserSetService = new OnlineUserSetService();

  it('사용자를 온라인 상태로 표시하고 중복 온라인 이벤트는 한 번만 집계한다', async () => {
    const user = await createUser();

    const first = await onlineUserSetService.markUserOnline(user.id);
    const duplicated = await onlineUserSetService.markUserOnline(user.id);

    expect(first).toEqual({
      userId: user.id,
      online: true,
      onlineUserCount: 1,
    });
    expect(duplicated.onlineUserCount).toBe(1);
    await expect(onlineUserSetService.isUserOnline(user.id)).resolves.toBe(true);
  });

  it('온라인 사용자 수와 요약 목록을 조회한다', async () => {
    const firstUser = await createUser('First Online User');
    const secondUser = await createUser('Second Online User');

    await onlineUserSetService.markUserOnline(firstUser.id);
    await onlineUserSetService.markUserOnline(secondUser.id);

    await expect(onlineUserSetService.getOnlineUserCount()).resolves.toBe(2);

    const summary = await onlineUserSetService.getOnlineUserSummary();

    expect(summary.onlineUserCount).toBe(2);
    expect(summary.onlineUserIds.sort((a, b) => a - b)).toEqual(
      [firstUser.id, secondUser.id].sort((a, b) => a - b),
    );
  });

  it('사용자를 오프라인 상태로 표시하고 온라인 사용자 Set을 초기화한다', async () => {
    const user = await createUser();
    const key = RedisKey.set.onlineUsers();

    await onlineUserSetService.markUserOnline(user.id);

    const offline = await onlineUserSetService.markUserOffline(user.id);

    expect(offline).toEqual({
      userId: user.id,
      online: false,
      onlineUserCount: 0,
    });
    await expect(onlineUserSetService.isUserOnline(user.id)).resolves.toBe(false);

    await onlineUserSetService.markUserOnline(user.id);
    await onlineUserSetService.clearOnlineUsers();

    await expect(redis.exists(key)).resolves.toBe(0);
  });

  it('존재하지 않는 사용자를 온라인으로 표시하면 예외를 던진다', async () => {
    await expect(onlineUserSetService.markUserOnline(999999)).rejects.toThrow();
  });
});