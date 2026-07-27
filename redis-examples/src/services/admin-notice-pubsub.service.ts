// src/services/admin-notice-pubsub.service.ts

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/**
 * 관리자 공지 채널로 전달하는 공지 메시지입니다.
 *
 * 공지 식별자와 표시 내용, 중요도, 생성 시각을 담습니다.
 * 객체는 발행할 때 JSON 문자열로 변환하고 구독할 때 다시 이 타입으로 복원합니다.
 */
export type AdminNoticeMessage = {
  noticeId: string;
  title: string;
  content: string;
  level: 'INFO' | 'WARNING' | 'URGENT';
  createdAt: string;
};

/**
 * Redis Pub/Sub으로 관리자 공지를 실시간 발행하고 구독합니다.
 *
 * 실습 포인트:
 * 1. 관리자가 작성한 공지를 공용 채널에 발행합니다.
 * 2. 공지 채널을 구독 중인 모든 구독자가 같은 메시지를 받습니다.
 * 3. 수신한 JSON 문자열을 공지 객체로 변환해 콜백에 전달합니다.
 *
 * 참고:
 * Pub/Sub은 공지 이력을 저장하지 않으므로 영구 보관이 필요하면 DB에 별도로 저장합니다.
 */
export class AdminNoticePubSubService {
  /**
   * 관리자 공지를 공용 공지 채널에 발행합니다.
   *
   * 1. 관리자 공지를 JSON 문자열로 변환합니다.
   * 2. 공지 채널을 구독 중인 모든 구독자에게 발행합니다.
   * 3. 메시지를 전달받은 구독자 수를 반환합니다.
   *
   * @returns 메시지를 받은 subscriber 수
   */
  async publishAdminNotice(message: AdminNoticeMessage): Promise<number> {
    const channel = RedisKey.channel.adminNotice();

    // 관리자 공지를 현재 연결된 모든 공지 구독자에게 전달합니다.
    // 메시지를 발행하고 이를 전달받은 구독자 수를 반환합니다.
    return redis.publish(channel, JSON.stringify(message));
  }

  /**
   * 입력값으로 일반 공지를 구성해 발행합니다.
   *
   * 1. 공지 식별자와 표시 내용을 메시지로 구성합니다.
   * 2. 중요도를 INFO로, 생성 시각을 현재 시각으로 설정합니다.
   * 3. 공용 관리자 공지 발행 메서드에 전달합니다.
   */
  async publishInfoNotice(input: {
    noticeId: string;
    title: string;
    content: string;
  }): Promise<number> {
    return this.publishAdminNotice({
      noticeId: input.noticeId,
      title: input.title,
      content: input.content,
      level: 'INFO',
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 입력값으로 긴급 공지를 구성해 발행합니다.
   *
   * 1. 공지 식별자와 표시 내용을 메시지로 구성합니다.
   * 2. 중요도를 URGENT로, 생성 시각을 현재 시각으로 설정합니다.
   * 3. 공용 관리자 공지 발행 메서드에 전달합니다.
   */
  async publishUrgentNotice(input: {
    noticeId: string;
    title: string;
    content: string;
  }): Promise<number> {
    return this.publishAdminNotice({
      noticeId: input.noticeId,
      title: input.title,
      content: input.content,
      level: 'URGENT',
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 관리자 공지 채널 구독을 시작합니다.
   *
   * 1. 일반 명령용 연결과 분리된 구독 전용 클라이언트를 생성합니다.
   * 2. 공지 채널에서 받은 JSON 문자열을 공지 메시지로 변환합니다.
   * 3. 변환한 공지를 콜백에 전달하고 구독 종료 함수를 반환합니다.
   */
  async subscribeAdminNotice(
    onMessage: (message: AdminNoticeMessage) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    const channel = RedisKey.channel.adminNotice();

    const subscriber = redis.duplicate();
    await subscriber.connect();

    // 관리자 공지 채널에서 새 공지를 실시간으로 수신합니다.
    // 구독이 유지되는 동안 공지를 받을 때마다 등록한 콜백을 실행합니다.
    await subscriber.subscribe(channel, async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage) as AdminNoticeMessage;
        await onMessage(message);
      } catch (error) {
        console.error('[AdminNoticePubSub] Invalid message:', rawMessage, error);
      }
    });

    return async () => {
      // 더 이상 관리자 공지를 받지 않도록 해당 채널의 구독을 해제합니다.
      // 구독 해제가 완료되면 구독자 클라이언트 연결을 종료할 수 있습니다.
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    };
  }
}
