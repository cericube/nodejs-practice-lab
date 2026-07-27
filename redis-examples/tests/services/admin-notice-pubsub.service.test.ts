import { describe, expect, it } from 'vitest';
import {
  AdminNoticePubSubService,
  type AdminNoticeMessage,
} from '../../src/services/admin-notice-pubsub.service.js';
import '../setup.js';

describe('AdminNoticePubSubService', () => {
  const service = new AdminNoticePubSubService();

  it('일반 공지를 구독자에게 발행한다', async () => {
    let resolveMessage!: (message: AdminNoticeMessage) => void;
    const received = new Promise<AdminNoticeMessage>((resolve) => {
      resolveMessage = resolve;
    });
    const unsubscribe = await service.subscribeAdminNotice(resolveMessage);

    try {
      const subscriberCount = await service.publishInfoNotice({
        noticeId: 'notice-1',
        title: '점검 안내',
        content: '오후 10시에 점검합니다.',
      });

      expect(subscriberCount).toBe(1);
      await expect(received).resolves.toMatchObject({
        noticeId: 'notice-1',
        title: '점검 안내',
        content: '오후 10시에 점검합니다.',
        level: 'INFO',
        createdAt: expect.any(String),
      });
    } finally {
      await unsubscribe();
    }
  });

  it('긴급 공지의 중요도를 URGENT로 설정한다', async () => {
    let resolveMessage!: (message: AdminNoticeMessage) => void;
    const received = new Promise<AdminNoticeMessage>((resolve) => {
      resolveMessage = resolve;
    });
    const unsubscribe = await service.subscribeAdminNotice(resolveMessage);

    try {
      await service.publishUrgentNotice({
        noticeId: 'urgent-1',
        title: '긴급 점검',
        content: '서비스를 일시 중단합니다.',
      });

      await expect(received).resolves.toMatchObject({
        noticeId: 'urgent-1',
        level: 'URGENT',
      });
    } finally {
      await unsubscribe();
    }
  });
});
