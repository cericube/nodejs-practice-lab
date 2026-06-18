import { setTimeout } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { UserSettingHashService } from '../../src/services/user-setting-hash.service.js';
import '../setup.js';

describe('UserSettingHashService', () => {
  const userSettingHashService = new UserSettingHashService();

  it('설정이 없으면 기본 설정을 생성해 Redis Hash에 저장한다', async () => {
    const setting = await userSettingHashService.getUserSetting(1);
    const key = RedisKey.hash.userSetting(1);

    expect(setting).toMatchObject({
      userId: 1,
      theme: 'light',
      language: 'ko',
      emailNotification: true,
      smsNotification: false,
      marketingAgreed: false,
    });
    expect(setting.updatedAt).toEqual(expect.any(String));

    const hash = await redis.hGetAll(key);
    expect(hash).toMatchObject({
      theme: 'light',
      language: 'ko',
      emailNotification: 'true',
      smsNotification: 'false',
      marketingAgreed: 'false',
      updatedAt: setting.updatedAt,
    });
  });

  it('기존 설정이 없어도 기본 설정을 보장한 뒤 일부 필드만 수정한다', async () => {
    const updated = await userSettingHashService.updateUserSetting(2, {
      theme: 'dark',
      smsNotification: true,
    });

    expect(updated).toMatchObject({
      userId: 2,
      theme: 'dark',
      language: 'ko',
      emailNotification: true,
      smsNotification: true,
      marketingAgreed: false,
    });

    const hash = await redis.hGetAll(RedisKey.hash.userSetting(2));
    expect(hash).toMatchObject({
      theme: 'dark',
      language: 'ko',
      emailNotification: 'true',
      smsNotification: 'true',
      marketingAgreed: 'false',
    });
  });

  it('기존 설정에서 전달된 필드만 수정한다', async () => {
    const before = await userSettingHashService.getUserSetting(3);

    await setTimeout(5);
    const updated = await userSettingHashService.updateUserSetting(3, {
      language: 'en',
      marketingAgreed: true,
    });

    expect(updated).toMatchObject({
      userId: 3,
      theme: before.theme,
      language: 'en',
      emailNotification: before.emailNotification,
      smsNotification: before.smsNotification,
      marketingAgreed: true,
    });
    expect(updated.updatedAt).not.toBe(before.updatedAt);
  });

  it('특정 설정 필드만 Redis 원시 문자열로 조회한다', async () => {
    await userSettingHashService.updateUserSetting(4, {
      emailNotification: false,
    });

    await expect(userSettingHashService.getSettingField(4, 'emailNotification')).resolves.toBe(
      'false',
    );
    await expect(userSettingHashService.getSettingField(4, 'theme')).resolves.toBe('light');
  });

  it('사용자 설정을 삭제한다', async () => {
    await userSettingHashService.getUserSetting(5);
    const key = RedisKey.hash.userSetting(5);

    await userSettingHashService.deleteUserSetting(5);

    await expect(redis.exists(key)).resolves.toBe(0);
  });
});
