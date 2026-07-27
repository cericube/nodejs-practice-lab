// src/services/notification-stream.service.ts

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/** 알림 작업을 구분하고 worker의 처리 방식을 결정할 때 사용하는 이벤트 종류입니다. */
export type NotificationType = 'order.created' | 'post.liked' | 'comment.created' | 'admin.notice';

/** Redis Stream에 새 알림 작업을 기록할 때 전달하는 입력 데이터입니다. */
export type NotificationEventInput = {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
};

/** Redis Stream 메시지를 알림 worker에서 사용할 수 있도록 변환한 작업 데이터입니다. */
export type NotificationJob = {
  id: string;
  userId: number;
  type: string;
  title: string;
  message: string;
  createdAt: string;
};

/**
 * Redis Stream 메시지를 알림 작업 응답으로 변환합니다.
 *
 * 1. Redis가 생성한 Stream 메시지 ID를 작업 ID로 사용합니다.
 * 2. 문자열로 저장된 사용자 ID를 number 타입으로 변환합니다.
 * 3. 나머지 메시지 필드를 알림 작업 데이터에 매핑합니다.
 *
 * 실습 포인트:
 * Redis Stream의 필드와 값은 문자열로 저장되므로 서비스 경계에서 필요한 타입으로 변환합니다.
 */
function parseNotificationJob(entry: {
  id: string;
  message: Record<string, string>;
}): NotificationJob {
  return {
    id: entry.id,
    userId: Number(entry.message.userId),
    type: entry.message.type,
    title: entry.message.title,
    message: entry.message.message,
    createdAt: entry.message.createdAt,
  };
}

export class NotificationStreamService {
  /** 여러 알림 worker가 공유하는 Consumer Group 이름입니다. */
  private readonly groupName = 'notification-workers';

  /**
   * 알림 작업을 Redis Stream에 추가합니다.
   *
   * 1. 알림 대상 사용자와 알림 내용을 Stream 메시지 필드로 구성합니다.
   * 2. 사용자 ID를 Redis에 저장할 문자열로 변환합니다.
   * 3. Redis가 생성한 메시지 ID를 반환합니다.
   *
   * 실습 포인트:
   * Stream에 기록된 작업은 worker가 즉시 실행 중이지 않아도 나중에 Consumer Group으로 읽을 수 있습니다.
   */
  async addNotificationEvent(input: NotificationEventInput): Promise<string> {
    const key = RedisKey.stream.notifications();

    // 알림 작업을 Stream에 저장합니다.
    // 이벤트를 추가하고 생성된 메시지 ID를 반환합니다.
    return redis.xAdd(key, '*', {
      userId: String(input.userId),
      type: input.type,
      title: input.title,
      message: input.message,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 알림 worker가 공유할 Consumer Group을 생성합니다.
   *
   * 1. 알림 Stream과 Consumer Group이 없으면 함께 생성합니다.
   * 2. `$`를 시작 ID로 사용해 그룹 생성 이후에 추가되는 메시지부터 처리합니다.
   * 3. 이미 그룹이 존재해서 발생한 BUSYGROUP 오류만 무시합니다.
   *
   * 실습 포인트:
   * Consumer Group을 사용하면 여러 worker가 같은 Stream의 새 메시지를 나누어 처리할 수 있습니다.
   *
   * 참고:
   * BUSYGROUP 이외의 오류는 연결 장애나 잘못된 명령일 수 있으므로 호출자에게 다시 전달합니다.
   */
  async createConsumerGroup(): Promise<void> {
    const key = RedisKey.stream.notifications();

    try {
      // 알림 작업을 여러 worker가 나눠 처리할 Consumer Group을 생성합니다.
      // $로 기존 메시지를 건너뛰고 MKSTREAM으로 Stream이 없으면 생성하며, 성공하면 OK를 반환합니다.
      await redis.xGroupCreate(key, this.groupName, '$', {
        MKSTREAM: true,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('BUSYGROUP')) {
        return;
      }

      throw error;
    }
  }

  /**
   * Consumer Group에 전달되지 않은 새 알림 작업을 읽습니다.
   *
   * 1. 호출한 worker를 Consumer Group의 consumer 이름으로 사용합니다.
   * 2. `>` ID로 아직 다른 consumer에게 전달되지 않은 메시지만 요청합니다.
   * 3. 최대 count개의 메시지를 1초 동안 기다려 읽고 알림 작업 데이터로 변환합니다.
   *
   * 실습 포인트:
   * 읽은 메시지는 ACK 전까지 Consumer Group의 pending 목록에 남습니다.
   *
   * 참고:
   * 이 메서드를 호출하기 전에 createConsumerGroup으로 Consumer Group을 준비해야 합니다.
   * 대기 시간 안에 새 메시지가 없으면 Redis가 null을 반환하므로 빈 배열로 변환합니다.
   */
  async readNotificationJobs(consumerName: string, count = 10): Promise<NotificationJob[]> {
    const key = RedisKey.stream.notifications();

    // Consumer Group에서 아직 전달되지 않은 새 알림 작업을 읽습니다.
    // COUNT만큼 최대 1초 동안 기다리며, 새 작업이 없으면 null을 반환합니다.
    const result = await redis.xReadGroup(
      this.groupName,
      consumerName,
      [
        {
          key,
          id: '>',
        },
      ],
      {
        COUNT: count,
        BLOCK: 1000,
      },
    );

    if (!result) {
      return [];
    }

    const stream = result[0];

    if (!stream) {
      return [];
    }

    return stream.messages.map(parseNotificationJob);
  }

  /**
   * 처리 완료한 알림 작업을 Consumer Group에 확인 처리합니다.
   *
   * 1. 처리한 Stream 메시지 ID를 전달받습니다.
   * 2. Consumer Group에 ACK를 보내 해당 메시지를 pending 목록에서 제거합니다.
   *
   * 실습 포인트:
   * 작업이 성공한 뒤 ACK해야 worker 장애 시 미완료 작업을 pending 목록에서 확인하거나 재처리할 수 있습니다.
   */
  async ackNotificationJob(messageId: string): Promise<void> {
    const key = RedisKey.stream.notifications();

    // 처리가 끝난 알림 작업을 완료 상태로 표시합니다.
    // Pending 목록에서 제거한 메시지 수를 반환하며, 대상 메시지가 없으면 0을 반환합니다.
    await redis.xAck(key, this.groupName, messageId);
  }

  /**
   * Consumer Group의 처리 대기 상태를 요약해서 조회합니다.
   *
   * 1. ACK되지 않은 전체 메시지 수를 조회합니다.
   * 2. 가장 오래된 ID, 가장 최근 ID와 consumer별 pending 개수를 함께 반환합니다.
   *
   * 실습 포인트:
   * pending 요약을 모니터링하면 worker 장애나 처리 지연으로 ACK되지 않은 작업을 확인할 수 있습니다.
   */
  async getPendingSummary() {
    const key = RedisKey.stream.notifications();

    // 알림 작업 중 아직 완료되지 않은 작업을 요약해서 조회합니다.
    // Pending 작업 수와 메시지 ID 범위, worker별 보유 수를 반환합니다.
    return redis.xPending(key, this.groupName);
  }
}
