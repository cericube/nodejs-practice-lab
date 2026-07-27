// src/services/cache-invalidation-pubsub.service.ts

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/**
 * 여러 서버에 전달하는 캐시 무효화 메시지입니다.
 *
 * 무효화 대상과 사유, 이벤트 생성 시각을 담습니다.
 * 각 구독 서버는 메시지의 key를 사용해 자신의 Redis 캐시를 삭제합니다.
 */
export type CacheInvalidationMessage = {
  type: 'USER_CACHE_INVALIDATED' | 'POST_CACHE_INVALIDATED' | 'CUSTOM_KEY_INVALIDATED';
  key: string;
  reason: string;
  createdAt: string;
};

/**
 * Redis Pub/Sub으로 여러 서버의 캐시 무효화를 전파합니다.
 *
 * 실습 포인트:
 * 1. 한 서버가 캐시 무효화 메시지를 공용 채널에 발행합니다.
 * 2. 채널을 구독 중인 각 서버가 같은 메시지를 수신합니다.
 * 3. 각 서버가 메시지에 포함된 키의 캐시를 삭제합니다.
 *
 * 참고:
 * Pub/Sub은 메시지를 저장하지 않으므로 발행 시점에 연결되지 않은 서버는 이벤트를 받지 못합니다.
 */
export class CacheInvalidationPubSubService {
  /**
   * 캐시 무효화 메시지를 공용 채널에 발행합니다.
   *
   * 1. 무효화 메시지를 JSON 문자열로 변환합니다.
   * 2. 캐시 무효화 채널을 구독 중인 모든 서버에 발행합니다.
   * 3. 메시지를 전달받은 구독자 수를 반환합니다.
   *
   * @returns 메시지를 받은 subscriber 수
   */
  async publishCacheInvalidation(message: CacheInvalidationMessage): Promise<number> {
    const channel = RedisKey.channel.cacheInvalidation();

    // 캐시 무효화 정보를 현재 연결된 구독 서버에 전달합니다.
    // 메시지를 발행하고 이를 전달받은 구독자 수를 반환합니다.
    return redis.publish(channel, JSON.stringify(message));
  }

  /**
   * 사용자 캐시 무효화 메시지를 구성해 발행합니다.
   *
   * 1. 사용자 ID로 무효화할 캐시 키를 생성합니다.
   * 2. 사용자 변경 사유와 현재 시각을 메시지에 기록합니다.
   * 3. 공용 캐시 무효화 발행 메서드에 전달합니다.
   */
  async publishUserCacheInvalidation(userId: number): Promise<number> {
    const key = RedisKey.cache.user(userId);

    return this.publishCacheInvalidation({
      type: 'USER_CACHE_INVALIDATED',
      key,
      reason: `User ${userId} updated`,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 지정한 Redis 키의 캐시 무효화 메시지를 발행합니다.
   *
   * 1. 입력받은 키와 사유로 사용자 정의 무효화 메시지를 구성합니다.
   * 2. 현재 시각을 이벤트 생성 시각으로 기록합니다.
   * 3. 공용 캐시 무효화 발행 메서드에 전달합니다.
   */
  async publishCustomKeyInvalidation(key: string, reason: string): Promise<number> {
    return this.publishCacheInvalidation({
      type: 'CUSTOM_KEY_INVALIDATED',
      key,
      reason,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 캐시 무효화 메시지 구독을 시작합니다.
   *
   * 1. 일반 명령용 연결과 분리된 구독 전용 클라이언트를 생성합니다.
   * 2. 수신한 JSON 문자열을 캐시 무효화 메시지로 변환합니다.
   * 3. 메시지에 포함된 키를 삭제하고 선택적 콜백을 실행합니다.
   * 4. 구독 해제와 연결 종료를 수행하는 함수를 반환합니다.
   *
   * 참고:
   * 각 API 서버는 애플리케이션 시작 시 구독을 시작해 캐시 상태를 동기화할 수 있습니다.
   */
  async subscribeCacheInvalidation(
    onInvalidated?: (message: CacheInvalidationMessage) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    const channel = RedisKey.channel.cacheInvalidation();

    const subscriber = redis.duplicate();
    await subscriber.connect();

    // 캐시 무효화 채널에서 새 이벤트를 실시간으로 수신합니다.
    // 구독이 유지되는 동안 이벤트를 받을 때마다 등록한 콜백을 실행합니다.
    await subscriber.subscribe(channel, async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage) as CacheInvalidationMessage;

        // 현재 서버에 저장된 무효화 대상 캐시를 삭제합니다.
        // 키가 없어도 오류 없이 처리하며 삭제한 키의 수를 반환합니다.
        await redis.del(message.key);

        if (onInvalidated) {
          await onInvalidated(message);
        }
      } catch (error) {
        console.error('[CacheInvalidationPubSub] Invalid message:', rawMessage, error);
      }
    });

    return async () => {
      // 더 이상 캐시 무효화 이벤트를 받지 않도록 채널 구독을 해제합니다.
      // 구독 해제가 완료되면 구독자 클라이언트 연결을 종료할 수 있습니다.
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    };
  }
}
