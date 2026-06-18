import { setTimeout } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { AuthService } from '../../src/services/auth.service.js';
import '../setup.js';

describe('AuthService', () => {
  const authService = new AuthService();

  it('6자리 숫자 인증 코드를 생성한다', () => {
    const authCode = authService.generateAuthCode();
    expect(authCode).toMatch(/^\d{6}$/);
  });

  it('이메일 인증 코드를 Redis에 180초 TTL로 저장한다', async () => {
    const email = 'auth-save@example.com';

    const authCode = await authService.saveEmailAuthCode(email);
    const key = RedisKey.string.authCode(email);

    await expect(redis.get(key)).resolves.toBe(authCode);

    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(180);
  });

  it('저장된 인증 코드와 입력 코드가 같으면 true를 반환하고 Redis key를 삭제한다', async () => {
    const email = 'auth-verify@example.com';
    const authCode = await authService.saveEmailAuthCode(email);
    const key = RedisKey.string.authCode(email);

    const result = await authService.verifyEmailAuthCode(email, authCode);

    expect(result).toBe(true);
    //인증 성공 후 Redis key가 삭제되어 같은 코드를 다시 사용할 수 없습니다.
    await expect(redis.get(key)).resolves.toBeNull();
  });

  it('인증 코드가 다르면 false를 반환하고 Redis key를 유지한다', async () => {
    const email = 'auth-wrong@example.com';
    const authCode = await authService.saveEmailAuthCode(email);
    const key = RedisKey.string.authCode(email);

    const result = await authService.verifyEmailAuthCode(email, '000000');

    expect(result).toBe(false);
    //인증 실패 후에도 Redis key는 유지되어
    //사용자는 TTL이 만료되기 전까지 계속해서 올바른 코드를 입력할 수 있습니다.
    await expect(redis.get(key)).resolves.toBe(authCode);
  });

  it('인증 코드가 없으면 false를 반환한다', async () => {
    const result = await authService.verifyEmailAuthCode('auth-missing@example.com', '123456');
    expect(result).toBe(false);
  });

  it('인증 코드가 만료되면 Redis에서 삭제되고 검증에 실패한다', async () => {
    const email = 'auth-expired@example.com';
    const authCode = await authService.saveEmailAuthCode(email);
    const key = RedisKey.string.authCode(email);

    await expect(redis.get(key)).resolves.toBe(authCode);

    // 실제 서비스 코드는 180초 TTL을 설정합니다.
    // 테스트에서 180초를 그대로 기다리면 너무 느리므로,
    // Redis 만료 동작만 빠르게 확인하기 위해 TTL을 1초로 줄여 만료 상황을 재현합니다.
    await redis.expire(key, 1);
    await setTimeout(1100);

    await expect(redis.get(key)).resolves.toBeNull();
    await expect(authService.verifyEmailAuthCode(email, authCode)).resolves.toBe(false);
  });
});
