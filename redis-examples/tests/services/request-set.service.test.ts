import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { RequestSetService } from '../../src/services/request-set.service.js';
import '../setup.js';

describe('RequestSetService', () => {
  const requestSetService = new RequestSetService();

  it('요청 ID를 저장하고 같은 requestId는 중복 요청으로 판단한다', async () => {
    const requestGroup = 'test:basic';
    const requestId = 'req-001';

    const first = await requestSetService.checkAndStoreRequest(requestGroup, requestId, 60);
    const duplicated = await requestSetService.checkAndStoreRequest(requestGroup, requestId, 60);

    expect(first).toMatchObject({
      requestGroup,
      requestId,
      firstRequest: true,
      duplicate: false,
      storedRequestCount: 1,
    });
    expect(first.ttl).toBeGreaterThan(0);
    expect(first.ttl).toBeLessThanOrEqual(60);

    expect(duplicated).toMatchObject({
      requestGroup,
      requestId,
      firstRequest: false,
      duplicate: true,
      storedRequestCount: 1,
    });
  });

  it('중복 여부와 저장된 요청 수를 조회한다', async () => {
    const requestGroup = 'test:count';

    await requestSetService.checkAndStoreRequest(requestGroup, 'req-001', 60);
    await requestSetService.checkAndStoreRequest(requestGroup, 'req-002', 60);

    await expect(requestSetService.isDuplicateRequest(requestGroup, 'req-001')).resolves.toBe(true);
    await expect(requestSetService.isDuplicateRequest(requestGroup, 'req-999')).resolves.toBe(false);
    await expect(requestSetService.getStoredRequestCount(requestGroup)).resolves.toBe(2);
  });

  it('업무별 헬퍼 메서드는 정해진 TTL로 중복 요청을 기록한다', async () => {
    const order = await requestSetService.checkOrderCreateRequest('order-req-001');
    const coupon = await requestSetService.checkCouponUseRequest('coupon-req-001');
    const email = await requestSetService.checkEmailSendRequest('email-req-001');

    expect(order).toMatchObject({
      requestGroup: 'order:create',
      requestId: 'order-req-001',
      firstRequest: true,
      duplicate: false,
    });
    expect(order.ttl).toBeGreaterThan(0);
    expect(order.ttl).toBeLessThanOrEqual(300);

    expect(coupon).toMatchObject({
      requestGroup: 'coupon:use',
      requestId: 'coupon-req-001',
      firstRequest: true,
      duplicate: false,
    });
    expect(coupon.ttl).toBeGreaterThan(0);
    expect(coupon.ttl).toBeLessThanOrEqual(300);

    expect(email).toMatchObject({
      requestGroup: 'email:send',
      requestId: 'email-req-001',
      firstRequest: true,
      duplicate: false,
    });
    expect(email.ttl).toBeGreaterThan(0);
    expect(email.ttl).toBeLessThanOrEqual(180);
  });

  it('요청 그룹의 중복 요청 기록을 삭제한다', async () => {
    const requestGroup = 'test:clear';
    const key = RedisKey.set.duplicateRequest(requestGroup);

    await requestSetService.checkAndStoreRequest(requestGroup, 'req-001', 60);
    await requestSetService.clearDuplicateRequests(requestGroup);

    await expect(redis.exists(key)).resolves.toBe(0);
    await expect(requestSetService.getStoredRequestCount(requestGroup)).resolves.toBe(0);
  });
});