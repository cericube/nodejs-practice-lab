// src/services/auth.service.ts

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

export class AuthService {
  /**
   * 인증 코드 생성
   *
   * 100000 ~ 999999 사이의 6자리 숫자 문자열을 만듭니다.
   * 실습에서는 Math.random()을 사용하지만,
   * 보안이 중요한 실제 서비스에서는 crypto 기반 난수 생성을 권장합니다.
   */
  generateAuthCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * 이메일 인증 코드 저장
   *
   * 1. 6자리 인증 코드를 생성합니다.
   * 2. 이메일을 포함한 Redis key를 만듭니다.
   * 3. Redis String에 인증 코드를 저장하고 TTL 180초를 설정합니다.
   *
   * 반환한 authCode는 실제 서비스에서는 이메일/SMS로 발송하고,
   * API 응답으로 직접 노출하지 않는 것이 일반적입니다.
   */
  async saveEmailAuthCode(email: string): Promise<string> {
    const authCode = this.generateAuthCode();

    // 이메일별로 인증 코드를 따로 저장하기 위한 key입니다.
    // 예: string:auth-code:test@example.com
    const key = RedisKey.string.authCode(email);

    // 이메일 인증 코드를 제한 시간 동안 저장합니다.
    // EX 옵션으로 180초 뒤 만료되게 저장하며, 성공하면 OK를 반환합니다.
    await redis.set(key, authCode, {
      EX: 180,
    });

    return authCode;
  }

  /**
   * 이메일 인증 코드 검증
   *
   * 1. 이메일에 해당하는 인증 코드를 Redis에서 조회합니다.
   * 2. Redis에 값이 없으면 만료되었거나 발급되지 않은 코드이므로 false를 반환합니다.
   * 3. 저장된 코드와 사용자가 입력한 코드를 비교합니다.
   * 4. 인증에 성공하면 Redis key를 삭제해 같은 코드를 다시 쓸 수 없게 합니다.
   */
  async verifyEmailAuthCode(email: string, inputCode: string): Promise<boolean> {
    const key = RedisKey.string.authCode(email);

    // 저장된 이메일 인증 코드 값을 조회합니다.
    // 저장된 값이 없으면 null을 반환합니다.
    const savedCode = await redis.get(key);

    if (!savedCode) {
      return false;
    }

    const isValid = savedCode === inputCode;

    if (isValid) {
      // 이메일 인증 코드 데이터를 초기화합니다.
      // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
      await redis.del(key);
    }

    return isValid;
  }

  /**
   * 인증 코드 남은 시간 확인
   *
   * Redis TTL 명령으로 key의 남은 만료 시간을 초 단위로 확인합니다.
   * - 양수: 남은 시간(초)
   * - -2: key가 없음
   * - -1: key는 있지만 만료 시간이 없음
   */
  async getAuthCodeTtl(email: string): Promise<number> {
    const key = RedisKey.string.authCode(email);
    // 이메일 인증 코드의 남은 유효 시간을 조회합니다.
    // TTL을 초 단위로 반환하며, 만료 설정이 없으면 -1을, 데이터가 없으면 -2를 반환합니다.
    return redis.ttl(key);
  }
}
