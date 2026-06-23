import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { JobListService } from '../../src/services/job-list.service.js';
import '../setup.js';

describe('JobListService', () => {
  const jobListService = new JobListService();

  it('작업을 큐에 추가하고 대기 작업 수를 조회한다', async () => {
    const job = await jobListService.enqueueJob({
      type: 'SEND_EMAIL',
      payload: {
        email: 'user@example.com',
        message: 'Welcome!',
      },
    });

    expect(job).toMatchObject({
      type: 'SEND_EMAIL',
      payload: {
        email: 'user@example.com',
        message: 'Welcome!',
      },
    });
    expect(job.id).toMatch(/^job_\d+_[a-z0-9]+$/);
    expect(new Date(job.createdAt).toString()).not.toBe('Invalid Date');

    await expect(jobListService.getPendingJobCount()).resolves.toBe(1);
  });

  it('대기 작업 목록을 최신 추가 순서로 조회한다', async () => {
    const firstJob = await jobListService.enqueueJob({
      type: 'SEND_EMAIL',
      payload: {
        email: 'first@example.com',
      },
    });
    const secondJob = await jobListService.enqueueJob({
      type: 'SEND_NOTIFICATION',
      payload: {
        userId: 1,
        message: '새 알림',
      },
    });

    await expect(jobListService.getPendingJobs()).resolves.toEqual([secondJob, firstJob]);
  });

  it('limit 개수만큼 대기 작업 목록을 조회한다', async () => {
    await jobListService.enqueueJob({
      type: 'SEND_EMAIL',
      payload: {
        email: 'first@example.com',
      },
    });
    const secondJob = await jobListService.enqueueJob({
      type: 'SEND_NOTIFICATION',
      payload: {
        userId: 1,
      },
    });
    const thirdJob = await jobListService.enqueueJob({
      type: 'RESIZE_IMAGE',
      payload: {
        imageUrl: 'https://example.com/image.png',
      },
    });

    await expect(jobListService.getPendingJobs(2)).resolves.toEqual([thirdJob, secondJob]);
  });

  it('작업을 먼저 들어온 순서대로 꺼낸다', async () => {
    const firstJob = await jobListService.enqueueJob({
      type: 'SEND_EMAIL',
      payload: {
        email: 'first@example.com',
      },
    });
    const secondJob = await jobListService.enqueueJob({
      type: 'SEND_NOTIFICATION',
      payload: {
        userId: 1,
      },
    });

    await expect(jobListService.dequeueJob()).resolves.toEqual(firstJob);
    await expect(jobListService.dequeueJob()).resolves.toEqual(secondJob);
    await expect(jobListService.getPendingJobCount()).resolves.toBe(0);
  });

  it('큐가 비어 있으면 작업 꺼내기 결과로 null을 반환한다', async () => {
    await expect(jobListService.dequeueJob()).resolves.toBeNull();
  });

  it('대기 작업 목록 조회 시 JSON 파싱에 실패한 값은 제외한다', async () => {
    const key = RedisKey.list.simpleJobQueue();
    const job = await jobListService.enqueueJob({
      type: 'SEND_EMAIL',
      payload: {
        email: 'user@example.com',
      },
    });

    await redis.lPush(key, 'not-json');

    await expect(jobListService.getPendingJobs()).resolves.toEqual([job]);
  });

  it('큐를 전체 초기화한다', async () => {
    const key = RedisKey.list.simpleJobQueue();

    await jobListService.enqueueJob({
      type: 'SEND_EMAIL',
      payload: {
        email: 'user@example.com',
      },
    });

    await jobListService.clearQueue();

    await expect(redis.exists(key)).resolves.toBe(0);
    await expect(jobListService.getPendingJobs()).resolves.toEqual([]);
  });
});
