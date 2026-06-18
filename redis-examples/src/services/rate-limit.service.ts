// src/services/rate-limit.service.ts

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  ttl: number;
};

export class RateLimitService {
  /**
   * 고정 윈도우 방식 Rate Limiting
   *
   * 1. 요청을 구분할 key를 Redis rate limit key로 변환합니다.
   * 2. Redis INCR 명령으로 요청 횟수를 1 증가시킵니다.
   * 3. 현재 Redis key의 TTL을 조회합니다.
   * 4. 첫 요청이거나 TTL이 없는 key라면 windowSeconds 만큼 TTL을 설정합니다.
   * 5. count가 limit 이하이면 요청을 허용합니다.
   *
   * 예:
   * windowSeconds가 60이고 limit이 5라면,
   * 같은 key로 60초 동안 최대 5번까지만 요청을 허용합니다.
   *
   * 실습 포인트:
   * Redis String 값을 카운터로 사용하고,
   * TTL을 함께 걸어 일정 시간이 지나면 요청 횟수가 자동 초기화되게 합니다.
   *
   * 보완 포인트:
   * INCR 성공 후 EXPIRE 실행 전에 장애가 나면 TTL 없는 key가 남을 수 있습니다.
   * 그래서 ttl === -1인 경우에도 expire를 다시 설정해 제한 key를 복구합니다.
   */
  async checkLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    // 요청 제한용 Redis key입니다.
    // 예: string:rate-limit:login:ip:127.0.0.1
    const redisKey = RedisKey.string.rateLimit(key);

    // INCR 후 EXPIRE가 별도 명령이라,
    // 아주 드물게 INCR 성공 후 EXPIRE 전에 장애가 나면
    // TTL 없는 제한 키가 남을 수 있습니다.
    // 실서비스라면 Lua script나 Redis transaction으로 묶는 방식을 고려할 수 있습니다.

    // INCR은 Redis에서 원자적으로 처리됩니다.
    // 동시에 여러 요청이 들어와도 count 증가 값이 깨지지 않습니다.
    // 기존 값 없음 → 0으로 간주 → +1 → 1 저장
    const count = await redis.incr(redisKey);

    // ttl 결과 의미:
    // - 양수: key가 만료되기까지 남은 시간(초)
    // - -1: key는 있지만 만료 시간이 없음
    // - -2: key가 없음
    //redis.ttl()    → 남은 만료 시간을 조회한다
    let ttl = await redis.ttl(redisKey);

    if (count === 1 || ttl === -1) {
      // count === 1:
      //   현재 제한 윈도우의 첫 요청이므로 TTL을 새로 설정합니다.
      //
      // ttl === -1:
      //   INCR은 성공했지만 EXPIRE가 누락된 key일 수 있으므로 TTL을 복구합니다.
      // redis.expire() → 만료 시간을 설정한다
      await redis.expire(redisKey, windowSeconds);

      // expire 이후 남은 시간을 다시 조회해 응답 값과 Redis 상태를 맞춥니다.
      ttl = await redis.ttl(redisKey);
    }

    return {
      // count가 limit을 초과하면 더 이상 요청을 허용하지 않습니다.
      allowed: count <= limit,
      count,
      limit,
      ttl,
    };
  }

  async checkLimitWithLuaScript(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    // Lua script를 사용한 rate limit 체크 로직을 구현할 수 있습니다.
    // Lua script는 Redis 서버에서 실행되므로, INCR와 EXPIRE를 원자적으로 처리할 수 있습니다.
    // 예시 Lua script:
    /*
    const redisKey = RedisKey.string.rateLimit(key);
    const script = `
    local count = redis.call('INCR', KEYS[1])
    local ttl = redis.call('TTL', KEYS[1])

    if count == 1 or ttl == -1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
      ttl = redis.call('TTL', KEYS[1])
    end

    return { count, ttl }
  `;
    const result = await redis.eval(script, {
      keys: [redisKey],
      arguments: [String(windowSeconds)],
    });

    const [count, ttl] = result as [number, number];
    return {
      allowed: count <= limit,
      count,
      limit,
      ttl,
    };
     */
    // 실제 구현에서는 Lua script를 Redis에 등록하고 EVALSHA 명령으로 실행하는 방식이 일반적입니다.
    // 이 방법은 INCR와 EXPIRE가 원자적으로 처리되어 TTL 없는 key가 남는 문제를 방지할 수 있습니다.

    throw new Error('checkLimitWithLuaScript is not implemented yet');
  }

  /**
   * 로그인 요청 제한
   *
   * 1. IP 주소를 기준으로 로그인 요청 제한 key를 만듭니다.
   * 2. 같은 IP에서 60초 동안 최대 5회 요청만 허용합니다.
   *
   * 실습 포인트:
   * 로그인처럼 공격 대상이 되기 쉬운 API는 IP 기준 제한을 둘 수 있습니다.
   */
  async checkLoginLimitByIp(ip: string): Promise<RateLimitResult> {
    return this.checkLimit(`login:ip:${ip}`, 5, 60);
  }

  /**
   * 사용자별 API 요청 제한
   *
   * 1. userId를 기준으로 API 요청 제한 key를 만듭니다.
   * 2. 같은 사용자에게 10초 동안 최대 20회 요청만 허용합니다.
   *
   * 실습 포인트:
   * 로그인 이후에는 IP보다 사용자 ID 기준으로 요청량을 제한할 수 있습니다.
   */
  async checkApiLimitByUser(userId: number): Promise<RateLimitResult> {
    return this.checkLimit(`api:user:${userId}`, 20, 10);
  }

  /**
   * 현재 요청 횟수 조회
   *
   * 1. 요청 제한용 Redis key를 만듭니다.
   * 2. Redis String 값을 조회합니다.
   * 3. 값이 없으면 아직 요청이 없거나 제한 시간이 끝난 상태로 보고 0을 반환합니다.
   */
  async getCurrentCount(key: string): Promise<number> {
    const redisKey = RedisKey.string.rateLimit(key);
    const value = await redis.get(redisKey);

    // Redis get 결과는 문자열 또는 null입니다.
    // 요청 횟수 계산에 사용하기 위해 number로 변환합니다.
    return value ? Number(value) : 0;
  }

  /**
   * 제한 상태 초기화
   *
   * 1. 요청 제한용 Redis key를 만듭니다.
   * 2. Redis key를 삭제해 요청 횟수와 TTL을 함께 제거합니다.
   *
   * 테스트 코드 또는 관리자 조치에서 사용할 수 있습니다.
   */
  async resetLimit(key: string): Promise<void> {
    const redisKey = RedisKey.string.rateLimit(key);
    await redis.del(redisKey);
  }
}
