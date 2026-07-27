// src/services/audit-log-stream.service.ts

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/** 감사 로그 이벤트를 Stream에 기록할 때 전달하는 행위와 대상 정보입니다. */
export type AuditLogEventInput = {
  action: string;
  target: string;
  message: string;
  actorId?: number;
};

/** Stream 메시지를 감사 로그 worker에서 처리할 수 있도록 변환한 작업 데이터입니다. */
export type AuditLogJob = {
  id: string;
  action: string;
  target: string;
  message: string;
  actorId: number | null;
  createdAt: string;
};

/**
 * Stream 메시지를 감사 로그 작업 데이터로 변환합니다.
 *
 * 1. Stream 메시지 ID를 작업 ID로 사용합니다.
 * 2. 행위자 ID가 있으면 number 타입으로 변환하고, 없으면 null로 처리합니다.
 * 3. 나머지 메시지 필드를 감사 로그 작업에 매핑합니다.
 */
function parseAuditLogJob(entry: { id: string; message: Record<string, string> }): AuditLogJob {
  return {
    id: entry.id,
    action: entry.message.action,
    target: entry.message.target,
    message: entry.message.message,
    actorId: entry.message.actorId ? Number(entry.message.actorId) : null,
    createdAt: entry.message.createdAt,
  };
}

export class AuditLogStreamService {
  /** 여러 감사 로그 worker가 공유하는 Consumer Group 이름입니다. */
  private readonly groupName = 'audit-log-workers';

  /**
   * 감사 로그 이벤트를 비동기 저장 작업으로 등록합니다.
   *
   * 1. 사용자 행위나 관리자 작업 정보를 Stream 메시지로 구성합니다.
   * 2. 행위자 ID가 없으면 빈 문자열로 저장합니다.
   * 3. 생성된 메시지 ID를 호출자에게 반환합니다.
   *
   * 실습 포인트:
   * API 요청과 DB 저장을 분리하면 감사 로그 저장을 worker에서 비동기로 처리할 수 있습니다.
   */
  async addAuditLogEvent(input: AuditLogEventInput): Promise<string> {
    const key = RedisKey.stream.auditLogs();

    // 감사 로그 이벤트를 Stream에 저장합니다.
    // 이벤트를 추가하고 생성된 메시지 ID를 반환합니다.
    return redis.xAdd(key, '*', {
      action: input.action,
      target: input.target,
      message: input.message,
      actorId: input.actorId !== undefined ? String(input.actorId) : '',
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 감사 로그 worker가 공유할 Consumer Group을 생성합니다.
   *
   * 1. 그룹 생성 이후에 추가되는 새 이벤트부터 처리하도록 시작 위치를 설정합니다.
   * 2. Stream이 없으면 함께 생성합니다.
   * 3. 이미 그룹이 존재하는 경우에는 오류 없이 종료합니다.
   *
   * 참고:
   * Consumer Group을 사용하면 여러 worker가 감사 로그 작업을 나누어 처리할 수 있습니다.
   */
  async createConsumerGroup(): Promise<void> {
    const key = RedisKey.stream.auditLogs();

    try {
      // 감사 로그 작업을 여러 worker가 나눠 처리할 Consumer Group을 생성합니다.
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
   * 아직 다른 worker에게 전달되지 않은 새 감사 로그 작업을 읽습니다.
   *
   * 1. 호출한 worker 이름으로 Consumer Group에 참여합니다.
   * 2. 새 메시지를 최대 count개까지 1초 동안 기다립니다.
   * 3. 읽은 메시지를 감사 로그 작업 데이터로 변환합니다.
   *
   * 참고:
   * 읽은 작업은 DB 저장 후 ACK하기 전까지 Pending 상태로 유지됩니다.
   */
  async readAuditLogJobs(consumerName: string, count = 10): Promise<AuditLogJob[]> {
    const key = RedisKey.stream.auditLogs();

    // Consumer Group에서 아직 전달되지 않은 새 감사 로그 작업을 읽습니다.
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

    return stream.messages.map(parseAuditLogJob);
  }

  /**
   * 감사 로그 작업을 DB에 저장하고 완료 처리합니다.
   *
   * 1. Stream에서 읽은 감사 로그 작업을 AuditLog 테이블에 저장합니다.
   * 2. DB 저장에 성공한 작업만 Consumer Group에 완료 처리합니다.
   * 3. 저장에 실패한 작업은 ACK하지 않아 Pending 상태로 남깁니다.
   *
   * 실습 포인트:
   * Stream은 worker가 읽은 뒤 ACK하지 않은 메시지를 Pending 상태로 관리합니다.
   * 따라서 실패한 작업을 추적할 수 있습니다.
   */
  async saveAuditLogToDatabase(job: AuditLogJob) {
    const auditLog = await prisma.auditLog.create({
      data: {
        action: job.action,
        target: job.target,
        message: job.message,
      },
    });

    await this.ackAuditLogJob(job.id);

    return auditLog;
  }

  /**
   * DB 저장이 끝난 감사 로그 작업을 완료 처리합니다.
   *
   * 1. 처리한 Stream 메시지 ID를 전달받습니다.
   * 2. Consumer Group의 Pending 목록에서 해당 작업을 제거합니다.
   */
  async ackAuditLogJob(messageId: string): Promise<void> {
    const key = RedisKey.stream.auditLogs();

    // DB 저장이 끝난 감사 로그 작업을 완료 상태로 표시합니다.
    // Pending 목록에서 제거한 메시지 수를 반환하며, 해당 메시지가 없으면 0을 반환합니다.
    await redis.xAck(key, this.groupName, messageId);
  }

  /**
   * Stream에 저장된 최근 감사 로그 이벤트를 조회합니다.
   *
   * 1. 가장 최근 메시지부터 역순으로 조회합니다.
   * 2. 최대 count개의 메시지를 감사 로그 작업 데이터로 변환합니다.
   *
   * 실습 포인트:
   * Consumer Group과 관계없이 Stream 원본을 조회하므로 디버깅이나 테스트에 사용할 수 있습니다.
   */
  async getRecentAuditLogEvents(count = 10): Promise<AuditLogJob[]> {
    const key = RedisKey.stream.auditLogs();

    // Stream에서 가장 최근 감사 로그 이벤트를 조회합니다.
    // COUNT 옵션으로 최대 조회 수를 제한하며, 이벤트가 없으면 빈 배열을 반환합니다.
    const entries = await redis.xRevRange(key, '+', '-', {
      COUNT: count,
    });

    return entries.map(parseAuditLogJob);
  }

  /**
   * 아직 완료되지 않은 감사 로그 작업을 요약해서 조회합니다.
   *
   * 1. Consumer Group에서 ACK되지 않은 전체 작업 수를 확인합니다.
   * 2. 메시지 ID 범위와 worker별 Pending 작업 수를 함께 조회합니다.
   */
  async getPendingSummary() {
    const key = RedisKey.stream.auditLogs();

    // 감사 로그 작업 중 아직 완료되지 않은 작업을 요약해서 조회합니다.
    // Pending 작업 수와 메시지 ID 범위, worker별 보유 수를 반환합니다.
    return redis.xPending(key, this.groupName);
  }
}
