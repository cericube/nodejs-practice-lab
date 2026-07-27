import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import {
  CacheInvalidationPubSubService,
  type CacheInvalidationMessage,
} from '../../src/services/cache-invalidation-pubsub.service.js';
import '../setup.js';

describe('CacheInvalidationPubSubService', () => {
  const service = new CacheInvalidationPubSubService();

  it('무효화 메시지를 받으면 지정한 캐시를 삭제한다', async () => {
    await redis.set('cache:custom:test', 'cached');
    let resolveMessage!: (message: CacheInvalidationMessage) => void;
    const invalidated = new Promise<CacheInvalidationMessage>((resolve) => {
      resolveMessage = resolve;
    });
    const unsubscribe = await service.subscribeCacheInvalidation(resolveMessage);

    try {
      const subscriberCount = await service.publishCustomKeyInvalidation(
        'cache:custom:test',
        '데이터 변경',
      );
      const message = await invalidated;

      expect(subscriberCount).toBe(1);
      expect(message).toMatchObject({
        type: 'CUSTOM_KEY_INVALIDATED',
        key: 'cache:custom:test',
        reason: '데이터 변경',
        createdAt: expect.any(String),
      });
      await expect(redis.get('cache:custom:test')).resolves.toBeNull();
    } finally {
      await unsubscribe();
    }
  });

  it('사용자 ID로 사용자 캐시 무효화 메시지를 구성한다', async () => {
    let resolveMessage!: (message: CacheInvalidationMessage) => void;
    const invalidated = new Promise<CacheInvalidationMessage>((resolve) => {
      resolveMessage = resolve;
    });
    const unsubscribe = await service.subscribeCacheInvalidation(resolveMessage);

    try {
      await service.publishUserCacheInvalidation(12);

      await expect(invalidated).resolves.toMatchObject({
        type: 'USER_CACHE_INVALIDATED',
        key: 'cache:user:12',
        reason: 'User 12 updated',
      });
    } finally {
      await unsubscribe();
    }
  });
});
