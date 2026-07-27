import { describe, expect, it } from 'vitest';
import {
  NotificationPubSubService,
  type RealtimeNotificationMessage,
} from '../../src/services/notification-pubsub.service.js';
import '../setup.js';

describe('NotificationPubSubService', () => {
  const service = new NotificationPubSubService();

  it('실시간 알림을 구독자에게 발행한다', async () => {
    let resolveMessage!: (message: RealtimeNotificationMessage) => void;
    const received = new Promise<RealtimeNotificationMessage>((resolve) => {
      resolveMessage = resolve;
    });
    const unsubscribe = await service.subscribeNotification(resolveMessage);

    try {
      const subscriberCount = await service.publishNotification({
        type: 'ORDER_STATUS_CHANGED',
        userId: 10,
        title: '주문 상태 변경',
        message: '배송이 시작되었습니다.',
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      expect(subscriberCount).toBe(1);
      await expect(received).resolves.toEqual({
        type: 'ORDER_STATUS_CHANGED',
        userId: 10,
        title: '주문 상태 변경',
        message: '배송이 시작되었습니다.',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    } finally {
      await unsubscribe();
    }
  });

  it('게시글 좋아요 입력을 알림 메시지로 구성한다', async () => {
    let resolveMessage!: (message: RealtimeNotificationMessage) => void;
    const received = new Promise<RealtimeNotificationMessage>((resolve) => {
      resolveMessage = resolve;
    });
    const unsubscribe = await service.subscribeNotification(resolveMessage);

    try {
      await service.publishPostLikedNotification({
        receiverUserId: 3,
        postId: 7,
        likedByUserName: '민수',
      });

      await expect(received).resolves.toMatchObject({
        type: 'POST_LIKED',
        userId: 3,
        title: '게시글 좋아요 알림',
        message: '민수님이 7번 게시글을 좋아합니다.',
        createdAt: expect.any(String),
      });
    } finally {
      await unsubscribe();
    }
  });
});
