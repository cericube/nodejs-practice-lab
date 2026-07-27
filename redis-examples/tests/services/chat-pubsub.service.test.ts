import { describe, expect, it } from 'vitest';
import { ChatPubSubService, type ChatMessage } from '../../src/services/chat-pubsub.service.js';
import '../setup.js';

describe('ChatPubSubService', () => {
  const service = new ChatPubSubService();

  it('같은 채팅방 구독자에게 메시지를 발행한다', async () => {
    let resolveMessage!: (message: ChatMessage) => void;
    const received = new Promise<ChatMessage>((resolve) => {
      resolveMessage = resolve;
    });
    const unsubscribe = await service.subscribeChatRoom('room-1', resolveMessage);

    try {
      const subscriberCount = await service.sendMessage({
        roomId: 'room-1',
        senderUserId: 5,
        senderName: '지수',
        message: '안녕하세요.',
      });

      expect(subscriberCount).toBe(1);
      await expect(received).resolves.toMatchObject({
        roomId: 'room-1',
        senderUserId: 5,
        senderName: '지수',
        message: '안녕하세요.',
        createdAt: expect.any(String),
      });
    } finally {
      await unsubscribe();
    }
  });

  it('다른 채팅방 구독자는 메시지를 받지 않는다', async () => {
    const unsubscribe = await service.subscribeChatRoom('room-2', () => undefined);

    try {
      await expect(
        service.publishChatMessage({
          roomId: 'room-1',
          senderUserId: 1,
          senderName: '발신자',
          message: 'room-1 메시지',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      ).resolves.toBe(0);
    } finally {
      await unsubscribe();
    }
  });
});
