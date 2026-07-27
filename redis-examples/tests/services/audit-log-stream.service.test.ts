import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { AuditLogStreamService } from '../../src/services/audit-log-stream.service.js';
import '../setup.js';

describe('AuditLogStreamService', () => {
  const service = new AuditLogStreamService();

  it('감사 로그 작업을 읽고 선택적 행위자 ID를 변환한다', async () => {
    await service.createConsumerGroup();
    const messageId = await service.addAuditLogEvent({
      action: 'USER_UPDATED',
      target: 'user:7',
      message: '사용자 정보 변경',
      actorId: 3,
    });

    const jobs = await service.readAuditLogJobs('audit-worker-1');

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: messageId,
      action: 'USER_UPDATED',
      target: 'user:7',
      message: '사용자 정보 변경',
      actorId: 3,
      createdAt: expect.any(String),
    });
  });

  it('감사 로그를 DB에 저장하고 작업을 완료 처리한다', async () => {
    await service.createConsumerGroup();
    await service.addAuditLogEvent({
      action: 'POST_DELETED',
      target: 'post:9',
      message: '게시글 삭제',
    });
    const [job] = await service.readAuditLogJobs('audit-worker-save');

    const saved = await service.saveAuditLogToDatabase(job);

    expect(saved).toMatchObject({
      action: 'POST_DELETED',
      target: 'post:9',
      message: '게시글 삭제',
    });
    await expect(prisma.auditLog.count()).resolves.toBe(1);
    await expect(service.getPendingSummary()).resolves.toMatchObject({ pending: 0 });
  });

  it('최근 감사 로그를 최신순으로 제한해 조회한다', async () => {
    await service.addAuditLogEvent({ action: 'FIRST', target: 'target:1', message: '첫 번째' });
    await service.addAuditLogEvent({ action: 'SECOND', target: 'target:2', message: '두 번째' });

    const events = await service.getRecentAuditLogEvents(1);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'SECOND',
      target: 'target:2',
      actorId: null,
    });
  });
});
