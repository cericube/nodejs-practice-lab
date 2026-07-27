// src/services/notification-pubsub.service.ts

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/**
 * Pub/Sub 채널로 전달하는 실시간 알림 메시지입니다.
 *
 * 알림 종류와 수신자, 화면에 표시할 내용, 생성 시각을 담습니다.
 * 객체는 발행할 때 JSON 문자열로 변환하고 구독할 때 다시 이 타입으로 복원합니다.
 */
export type RealtimeNotificationMessage = {
  type: 'POST_LIKED' | 'COMMENT_CREATED' | 'ORDER_STATUS_CHANGED';
  userId: number;
  title: string;
  message: string;
  createdAt: string;
};

/**
 * Redis Pub/Sub으로 알림을 실시간 발행하고 구독합니다.
 *
 * 실습 포인트:
 * 1. 일반 Redis 클라이언트로 알림을 발행합니다.
 * 2. 복제한 전용 클라이언트로 알림 채널을 구독합니다.
 * 3. 수신한 JSON 문자열을 알림 객체로 변환해 콜백에 전달합니다.
 *
 * 참고:
 * Pub/Sub 메시지는 저장되지 않으므로 발행 시점에 연결된 구독자만 받을 수 있습니다.
 */
export class NotificationPubSubService {
  /**
   * 실시간 알림을 공용 알림 채널에 발행합니다.
   *
   * 1. 알림 메시지를 JSON 문자열로 변환합니다.
   * 2. 알림 채널을 구독 중인 모든 구독자에게 문자열을 발행합니다.
   * 3. 메시지를 전달받은 구독자 수를 반환합니다.
   *
   * @returns 메시지를 받은 subscriber 수
   */
  async publishNotification(message: RealtimeNotificationMessage): Promise<number> {
    const channel = RedisKey.channel.notification();

    const payload = JSON.stringify(message);

    // 직렬화한 알림을 현재 연결된 구독자에게 전달합니다.
    // 메시지를 발행하고 이를 전달받은 구독자 수를 반환합니다.
    return redis.publish(channel, payload);
  }

  /**
   * 게시글 좋아요 정보를 실시간 알림으로 발행합니다.
   *
   * 1. 수신자와 게시글 정보를 좋아요 알림 메시지로 구성합니다.
   * 2. 현재 시각을 알림 생성 시각으로 기록합니다.
   * 3. 공용 알림 발행 메서드에 메시지를 전달합니다.
   */
  async publishPostLikedNotification(input: {
    receiverUserId: number;
    postId: number;
    likedByUserName: string;
  }): Promise<number> {
    return this.publishNotification({
      type: 'POST_LIKED',
      userId: input.receiverUserId,
      title: '게시글 좋아요 알림',
      message: `${input.likedByUserName}님이 ${input.postId}번 게시글을 좋아합니다.`,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 댓글 작성 정보를 실시간 알림으로 발행합니다.
   *
   * 1. 수신자와 게시글 정보를 댓글 알림 메시지로 구성합니다.
   * 2. 현재 시각을 알림 생성 시각으로 기록합니다.
   * 3. 공용 알림 발행 메서드에 메시지를 전달합니다.
   */
  async publishCommentCreatedNotification(input: {
    receiverUserId: number;
    postId: number;
    commentAuthorName: string;
  }): Promise<number> {
    return this.publishNotification({
      type: 'COMMENT_CREATED',
      userId: input.receiverUserId,
      title: '댓글 알림',
      message: `${input.commentAuthorName}님이 ${input.postId}번 게시글에 댓글을 작성했습니다.`,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 실시간 알림 채널 구독을 시작합니다.
   *
   * 1. 일반 명령용 연결과 분리된 구독 전용 클라이언트를 생성합니다.
   * 2. 알림 채널에서 받은 JSON 문자열을 알림 객체로 변환합니다.
   * 3. 변환한 알림을 콜백에 전달하고 구독 종료 함수를 반환합니다.
   *
   * 참고:
   * Pub/Sub 모드의 연결은 일반 Redis 명령 처리에 함께 사용하지 않습니다.
   *
   * @param onMessage 알림 메시지를 받았을 때 실행할 콜백
   * @returns 구독 종료 함수
   */
  async subscribeNotification(
    onMessage: (message: RealtimeNotificationMessage) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    const channel = RedisKey.channel.notification();

    // 일반 Redis 명령용 연결과 분리하기 위해 구독 전용 클라이언트를 생성합니다.
    // 복제한 클라이언트는 별도 연결이 필요하므로 구독을 시작하기 전에 연결합니다.
    const subscriber = redis.duplicate();
    await subscriber.connect();

    // 알림 채널에서 새 메시지를 실시간으로 수신합니다.
    // 구독이 유지되는 동안 메시지를 받을 때마다 등록한 콜백을 실행합니다.
    await subscriber.subscribe(channel, async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage) as RealtimeNotificationMessage;
        await onMessage(message);
      } catch (error) {
        console.error('[NotificationPubSub] Invalid message:', rawMessage, error);
      }
    });

    return async () => {
      // 더 이상 알림을 받지 않도록 해당 채널의 구독을 해제합니다.
      // 구독 해제가 완료되면 구독자 클라이언트 연결을 종료할 수 있습니다.
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    };
  }
}
