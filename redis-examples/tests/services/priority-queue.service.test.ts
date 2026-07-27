import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { PriorityQueueService } from '../../src/services/priority-queue.service.js';
import '../setup.js';

describe('PriorityQueueService', () => {
  const service = new PriorityQueueService();

  it('priority가 가장 낮은 작업을 먼저 조회하고 꺼낸다', async () => {
    await service.addJob({ jobId: 'normal', priority: 10 });
    await service.addJob({ jobId: 'urgent', priority: 1 });

    await expect(service.peekNextJob()).resolves.toEqual({
      jobId: 'urgent',
      priority: 1,
    });
    await expect(service.getQueueSize()).resolves.toBe(2);
    await expect(service.popNextJob()).resolves.toEqual({
      jobId: 'urgent',
      priority: 1,
    });
    await expect(service.getQueueSize()).resolves.toBe(1);
  });

  it('빈 큐를 조회하거나 꺼내면 null을 반환한다', async () => {
    await expect(service.peekNextJob()).resolves.toBeNull();
    await expect(service.popNextJob()).resolves.toBeNull();
  });

  it('payload를 JSON으로 저장하고 완료 처리 시 삭제한다', async () => {
    const payload = { email: 'user@example.com', retry: 2 };
    await service.addJob({ jobId: 'email-1', priority: 5, payload });

    await expect(service.getJobPayload<typeof payload>('email-1')).resolves.toEqual(payload);
    const ttl = await redis.ttl('zset:priority-queue:payload:email-1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);

    await service.completeJob('email-1');
    await expect(service.getJobPayload('email-1')).resolves.toBeNull();
  });

  it('작업 제거 시 큐 항목과 payload를 함께 삭제한다', async () => {
    await service.addJob({
      jobId: 'remove-me',
      priority: 3,
      payload: { value: true },
    });

    await service.removeJob('remove-me');

    await expect(service.getQueueSize()).resolves.toBe(0);
    await expect(service.getJobPayload('remove-me')).resolves.toBeNull();
  });

  it('큐 초기화 시 대기 작업을 모두 제거한다', async () => {
    await service.addJob({ jobId: 'job-1', priority: 1 });
    await service.addJob({ jobId: 'job-2', priority: 2 });

    await service.clearQueue();

    await expect(redis.exists(RedisKey.zset.priorityQueue())).resolves.toBe(0);
  });
});
