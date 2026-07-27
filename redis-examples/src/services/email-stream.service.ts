// src/services/email-stream.service.ts

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/** 이메일의 목적을 구분하고 worker의 발송 방식을 결정할 때 사용하는 작업 종류입니다. */
export type EmailJobType = 'welcome' | 'order-completed' | 'password-reset' | 'marketing';

/** Redis Stream에 새 이메일 작업을 기록할 때 전달하는 입력 데이터입니다. */
export type EmailJobInput = {
  to: string;
  type: EmailJobType;
  subject: string;
  body: string;
};

/** Redis Stream 메시지를 이메일 worker에서 사용할 수 있도록 변환한 작업 데이터입니다. */
export type EmailJob = {
  id: string;
  to: string;
  type: string;
  subject: string;
  body: string;
  retryCount: number;
  createdAt: string;
};

/**
 * Redis Stream 메시지를 이메일 작업 데이터로 변환합니다.
 *
 * 1. Redis가 생성한 Stream 메시지 ID를 작업 ID로 사용합니다.
 * 2. 문자열로 저장된 재시도 횟수를 number 타입으로 변환합니다.
 * 3. 나머지 메시지 필드를 이메일 작업 데이터에 매핑합니다.
 *
 * 실습 포인트:
 * Redis Stream의 필드와 값은 문자열이므로 서비스 경계에서 필요한 타입으로 변환합니다.
 */
function parseEmailJob(entry: { id: string; message: Record<string, string> }): EmailJob {
  return {
    id: entry.id,
    to: entry.message.to,
    type: entry.message.type,
    subject: entry.message.subject,
    body: entry.message.body,
    retryCount: Number(entry.message.retryCount ?? 0),
    createdAt: entry.message.createdAt,
  };
}

export class EmailStreamService {
  /** 여러 이메일 worker가 공유하는 Consumer Group 이름입니다. */
  private readonly groupName = 'email-workers';

  /**
   * 이메일 발송 작업을 Redis Stream에 추가합니다.
   *
   * 1. 수신자, 작업 종류, 제목과 본문을 Stream 메시지 필드로 구성합니다.
   * 2. 최초 재시도 횟수를 0으로 설정하고 생성 시각을 기록합니다.
   * 3. Redis가 생성한 메시지 ID를 반환합니다.
   *
   * 실습 포인트:
   * 이메일 생성 요청과 실제 발송을 분리하면 요청 처리 중 외부 메일 서버의 응답을 기다리지 않아도 됩니다.
   */
  async addEmailJob(input: EmailJobInput): Promise<string> {
    const key = RedisKey.stream.emails();

    // 이메일 발송 작업을 Stream에 저장합니다.
    // 이벤트를 추가하고 생성된 메시지 ID를 반환합니다.
    return redis.xAdd(key, '*', {
      to: input.to,
      type: input.type,
      subject: input.subject,
      body: input.body,
      retryCount: '0',
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 회원가입 환영 이메일 작업을 생성합니다.
   *
   * 1. 수신자 이메일과 사용자 이름을 전달받습니다.
   * 2. 환영 이메일의 작업 종류, 제목과 본문을 구성합니다.
   * 3. 공통 이메일 작업 추가 메서드에 발송을 위임합니다.
   */
  async addWelcomeEmailJob(email: string, name: string): Promise<string> {
    return this.addEmailJob({
      to: email,
      type: 'welcome',
      subject: '회원가입을 환영합니다.',
      body: `${name}님, 회원가입을 환영합니다.`,
    });
  }

  /**
   * 주문 완료 안내 이메일 작업을 생성합니다.
   *
   * 1. 수신자 이메일과 주문 ID를 전달받습니다.
   * 2. 주문 완료 이메일의 작업 종류, 제목과 본문을 구성합니다.
   * 3. 공통 이메일 작업 추가 메서드에 발송을 위임합니다.
   */
  async addOrderCompletedEmailJob(email: string, orderId: number): Promise<string> {
    return this.addEmailJob({
      to: email,
      type: 'order-completed',
      subject: '주문이 완료되었습니다.',
      body: `주문 번호 ${orderId}의 주문이 완료되었습니다.`,
    });
  }

  /**
   * 이메일 worker가 공유할 Consumer Group을 생성합니다.
   *
   * 1. 이메일 Stream과 Consumer Group이 없으면 함께 생성합니다.
   * 2. `$`를 시작 ID로 사용해 그룹 생성 이후에 추가되는 메시지부터 처리합니다.
   * 3. 이미 그룹이 존재해서 발생한 BUSYGROUP 오류만 무시합니다.
   *
   * 실습 포인트:
   * Consumer Group을 사용하면 여러 이메일 worker가 같은 Stream의 새 작업을 나누어 처리할 수 있습니다.
   *
   * 참고:
   * BUSYGROUP 이외의 오류는 연결 장애나 잘못된 명령일 수 있으므로 호출자에게 다시 전달합니다.
   */
  async createConsumerGroup(): Promise<void> {
    const key = RedisKey.stream.emails();

    try {
      // 이메일 발송 작업을 여러 worker가 나눠 처리할 Consumer Group을 생성합니다.
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
   * Consumer Group에 전달되지 않은 새 이메일 작업을 읽습니다.
   *
   * 1. 호출한 worker를 Consumer Group의 consumer 이름으로 사용합니다.
   * 2. `>` ID로 아직 다른 consumer에게 전달되지 않은 메시지만 요청합니다.
   * 3. 최대 count개의 메시지를 1초 동안 기다려 읽고 이메일 작업 데이터로 변환합니다.
   *
   * 실습 포인트:
   * 읽은 메시지는 ACK 전까지 Consumer Group의 pending 목록에 남습니다.
   *
   * 참고:
   * 이 메서드를 호출하기 전에 createConsumerGroup으로 Consumer Group을 준비해야 합니다.
   * 대기 시간 안에 새 메시지가 없으면 Redis가 null을 반환하므로 빈 배열로 변환합니다.
   */
  async readEmailJobs(consumerName: string, count = 5): Promise<EmailJob[]> {
    const key = RedisKey.stream.emails();

    // Consumer Group에서 아직 전달되지 않은 새 이메일 발송 작업을 읽습니다.
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

    return stream.messages.map(parseEmailJob);
  }

  /**
   * 발송을 완료한 이메일 작업을 Consumer Group에 확인 처리합니다.
   *
   * 1. 발송을 완료한 Stream 메시지 ID를 전달받습니다.
   * 2. Consumer Group에 ACK를 보내 해당 메시지를 pending 목록에서 제거합니다.
   *
   * 실습 포인트:
   * 이메일 발송에 성공한 뒤 ACK해야 장애가 발생했을 때 미완료 작업을 확인하거나 재처리할 수 있습니다.
   */
  async ackEmailJob(messageId: string): Promise<void> {
    const key = RedisKey.stream.emails();

    // 처리가 끝난 이메일 발송 작업을 완료 상태로 표시합니다.
    // Pending 목록에서 제거한 메시지 수를 반환하며, 대상 메시지가 없으면 0을 반환합니다.
    await redis.xAck(key, this.groupName, messageId);
  }

  /**
   * 실패한 이메일 작업을 새 메시지로 다시 등록합니다.
   *
   * 1. 실패한 작업의 이메일 내용을 새 Stream 메시지에 복사합니다.
   * 2. 재시도 횟수를 1 증가시키고 새 생성 시각을 기록합니다.
   * 3. 원본 메시지 ID를 함께 저장해 재시도 작업의 출처를 추적합니다.
   *
   * 실습 포인트:
   * Stream 메시지는 직접 수정할 수 없으므로 변경된 재시도 정보를 가진 새 메시지를 추가합니다.
   *
   * 참고:
   * 이 메서드는 원본 메시지를 ACK하지 않습니다. 호출자는 재등록 성공 후 원본 작업을 별도로 ACK해야 합니다.
   * 실무에서는 지연 재시도, 재시도 전용 Stream, Dead Letter Stream 또는 전문 큐 사용을 고려할 수 있습니다.
   */
  async retryEmailJob(job: EmailJob): Promise<string> {
    const key = RedisKey.stream.emails();

    // 이메일 발송 작업을 Stream에 저장합니다.
    // 이벤트를 추가하고 생성된 메시지 ID를 반환합니다.
    return redis.xAdd(key, '*', {
      to: job.to,
      type: job.type,
      subject: job.subject,
      body: job.body,
      retryCount: String(job.retryCount + 1),
      createdAt: new Date().toISOString(),
      originalMessageId: job.id,
    });
  }

  /**
   * Consumer Group의 처리 대기 상태를 요약해서 조회합니다.
   *
   * 1. ACK되지 않은 전체 이메일 작업 수를 조회합니다.
   * 2. 가장 오래된 ID, 가장 최근 ID와 consumer별 pending 개수를 함께 반환합니다.
   *
   * 실습 포인트:
   * pending 요약을 모니터링하면 worker 장애나 발송 지연으로 완료되지 않은 작업을 확인할 수 있습니다.
   */
  async getPendingSummary() {
    const key = RedisKey.stream.emails();

    // 이메일 발송 작업 중 아직 완료되지 않은 작업을 요약해서 조회합니다.
    // Pending 작업 수와 메시지 ID 범위, worker별 보유 수를 반환합니다.
    return redis.xPending(key, this.groupName);
  }
}
