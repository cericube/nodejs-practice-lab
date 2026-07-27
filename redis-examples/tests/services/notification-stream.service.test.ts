import { describe, expect, it } from 'vitest';
import { NotificationStreamService } from '../../src/services/notification-stream.service.js';
import '../setup.js';

describe('NotificationStreamService', () => {
  const service = new NotificationStreamService();

  it('Consumer Group을 중복 생성해도 오류가 발생하지 않는다', async () => {
    await expect(service.createConsumerGroup()).resolves.toBeUndefined();
    await expect(service.createConsumerGroup()).resolves.toBeUndefined();
  });

  it('새 알림을 Consumer Group으로 읽고 타입을 변환한다', async () => {
    await service.createConsumerGroup();
    const messageId = await service.addNotificationEvent({
      userId: 7,
      type: 'post.liked',
      title: '좋아요 알림',
      message: '게시글에 좋아요가 추가되었습니다.',
    });

    const jobs = await service.readNotificationJobs('worker-1');

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: messageId,
      userId: 7,
      type: 'post.liked',
      title: '좋아요 알림',
      message: '게시글에 좋아요가 추가되었습니다.',
    });
    expect(jobs[0].createdAt).toEqual(expect.any(String));
  });

  it('읽은 알림은 pending에 들어가고 ACK 후 제거된다', async () => {
    await service.createConsumerGroup();
    await service.addNotificationEvent({
      userId: 9,
      type: 'admin.notice',
      title: '공지',
      message: '점검 안내',
    });
    const [job] = await service.readNotificationJobs('worker-ack');

    const pendingBefore = await service.getPendingSummary();
    expect(pendingBefore.pending).toBe(1);

    await service.ackNotificationJob(job.id);

    const pendingAfter = await service.getPendingSummary();
    expect(pendingAfter.pending).toBe(0);
  });

  it('새 알림이 없으면 빈 배열을 반환한다', async () => {
    await service.createConsumerGroup();

    await expect(service.readNotificationJobs('idle-worker')).resolves.toEqual([]);
  });
});
