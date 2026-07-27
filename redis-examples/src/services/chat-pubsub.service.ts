// src/services/chat-pubsub.service.ts

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/**
 * 채팅방 Pub/Sub 채널로 전달하는 채팅 메시지입니다.
 *
 * 채팅방과 발신자 정보, 메시지 내용, 생성 시각을 담습니다.
 * 객체는 발행할 때 JSON 문자열로 변환하고 구독할 때 다시 이 타입으로 복원합니다.
 */
export type ChatMessage = {
  roomId: string;
  senderUserId: number;
  senderName: string;
  message: string;
  createdAt: string;
};

/**
 * Redis Pub/Sub으로 채팅방 메시지를 실시간 발행하고 구독합니다.
 *
 * 실습 포인트:
 * 1. 채팅방 ID로 Pub/Sub 채널을 분리합니다.
 * 2. 같은 채팅방 채널을 구독 중인 구독자에게만 메시지를 전달합니다.
 * 3. 수신한 JSON 문자열을 채팅 메시지 객체로 변환해 콜백에 전달합니다.
 *
 * 참고:
 * Pub/Sub은 채팅 이력을 저장하지 않으므로 영구 보관이 필요하면 DB나 Stream을 함께 사용합니다.
 */
export class ChatPubSubService {
  /**
   * 채팅 메시지를 해당 채팅방 채널에 발행합니다.
   *
   * 1. 채팅방 ID로 발행할 채널을 결정합니다.
   * 2. 채팅 메시지를 JSON 문자열로 변환해 발행합니다.
   * 3. 메시지를 전달받은 구독자 수를 반환합니다.
   *
   * @returns 메시지를 받은 subscriber 수
   */
  async publishChatMessage(message: ChatMessage): Promise<number> {
    const channel = RedisKey.channel.chat(message.roomId);

    // 채팅 메시지를 해당 채팅방에 접속한 구독자에게 전달합니다.
    // 메시지를 발행하고 이를 전달받은 구독자 수를 반환합니다.
    return redis.publish(channel, JSON.stringify(message));
  }

  /**
   * 입력값으로 채팅 메시지를 구성해 발행합니다.
   *
   * 1. 채팅방과 발신자 정보를 채팅 메시지로 구성합니다.
   * 2. 현재 시각을 메시지 생성 시각으로 기록합니다.
   * 3. 공용 채팅 메시지 발행 메서드에 전달합니다.
   *
   * 참고:
   * 채팅 이력이 필요하면 이 메서드 호출 전후에 DB 저장을 별도로 수행합니다.
   */
  async sendMessage(input: {
    roomId: string;
    senderUserId: number;
    senderName: string;
    message: string;
  }): Promise<number> {
    return this.publishChatMessage({
      roomId: input.roomId,
      senderUserId: input.senderUserId,
      senderName: input.senderName,
      message: input.message,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 특정 채팅방의 메시지 구독을 시작합니다.
   *
   * 1. 일반 명령용 연결과 분리된 구독 전용 클라이언트를 생성합니다.
   * 2. 채팅방 채널에서 받은 JSON 문자열을 채팅 메시지로 변환합니다.
   * 3. 변환한 메시지를 콜백에 전달하고 구독 종료 함수를 반환합니다.
   *
   * 참고:
   * WebSocket 서버는 콜백에서 해당 채팅방에 접속한 클라이언트에게 메시지를 전달할 수 있습니다.
   */
  async subscribeChatRoom(
    roomId: string,
    onMessage: (message: ChatMessage) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    const channel = RedisKey.channel.chat(roomId);

    const subscriber = redis.duplicate();
    await subscriber.connect();

    // 지정한 채팅방 채널에서 새 메시지를 실시간으로 수신합니다.
    // 구독이 유지되는 동안 메시지를 받을 때마다 등록한 콜백을 실행합니다.
    await subscriber.subscribe(channel, async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage) as ChatMessage;
        await onMessage(message);
      } catch (error) {
        console.error('[ChatPubSub] Invalid message:', rawMessage, error);
      }
    });

    return async () => {
      // 더 이상 채팅 메시지를 받지 않도록 해당 채널의 구독을 해제합니다.
      // 구독 해제가 완료되면 구독자 클라이언트 연결을 종료할 수 있습니다.
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    };
  }
}
