// src/redis/cache.service.ts

import { redis } from '../lib/redis.js';

/**
 * Redis String 기반 JSON 캐시를 다루는 공통 서비스입니다.
 *
 * Redis의 String 자료구조는 문자열만 저장할 수 있으므로,
 * 객체 데이터는 JSON.stringify()로 문자열 변환 후 저장하고
 * 조회할 때는 JSON.parse()로 다시 객체로 변환합니다.
 *
 * 사용 예:
 * - 사용자 조회 결과 캐싱
 * - 게시글 상세 조회 캐싱
 * - 상품 상세 정보 캐싱
 */
export class CacheService {
  /**
   * Redis에서 JSON 문자열을 조회한 뒤 객체로 변환합니다.
   *
   * @param key Redis key
   * @returns 캐시가 있으면 객체, 없으면 null
   */
  async getJson<T>(key: string): Promise<T | null> {
    const cached = await redis.get(key);

    if (!cached) {
      return null;
    }

    try {
      return JSON.parse(cached) as T;
    } catch {
      await this.deleteCache(key);
      return null;
    }
  }

  /**
   * 객체 데이터를 JSON 문자열로 변환하여 Redis에 저장합니다.
   *
   * TTL을 함께 설정하여 캐시가 일정 시간이 지나면
   * 자동으로 만료되도록 합니다.
   *
   * @param key Redis key
   * @param value 저장할 객체 데이터
   * @param ttlSeconds 캐시 만료 시간, 초 단위
   */
  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('ttlSeconds must be a positive integer');
    }

    const serializedValue = JSON.stringify(value);

    await redis.set(key, serializedValue, {
      EX: ttlSeconds,
    });
  }
  /**
   * Redis key를 삭제합니다.
   *
   * 주로 DB 데이터가 수정되거나 삭제되었을 때
   * 기존 캐시를 무효화하기 위해 사용합니다.
   *
   * @param key 삭제할 Redis key
   */
  async deleteCache(key: string): Promise<void> {
    await redis.del(key);
  }

  /**
   * Redis key가 존재하는지 확인합니다.
   *
   * @param key 확인할 Redis key
   * @returns key가 존재하면 true, 없으면 false
   */
  async exists(key: string): Promise<boolean> {
    const result = await redis.exists(key);
    return result === 1;
  }
}
