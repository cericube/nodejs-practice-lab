import { describe, expect, it } from 'vitest';
import { EmailStreamService } from '../../src/services/email-stream.service.js';
import '../setup.js';

describe('EmailStreamService', () => {
  const service = new EmailStreamService();

  it('새 이메일 작업을 읽고 필드 타입을 변환한다', async () => {
    await service.createConsumerGroup();
    const messageId = await service.addWelcomeEmailJob('user@example.com', '홍길동');

    const jobs = await service.readEmailJobs('email-worker-1');

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: messageId,
      to: 'user@example.com',
      type: 'welcome',
      subject: '회원가입을 환영합니다.',
      body: '홍길동님, 회원가입을 환영합니다.',
      retryCount: 0,
      createdAt: expect.any(String),
    });
  });

  it('실패한 작업을 증가한 재시도 횟수로 다시 등록한다', async () => {
    await service.createConsumerGroup();
    await service.addEmailJob({
      to: 'retry@example.com',
      type: 'password-reset',
      subject: '비밀번호 재설정',
      body: '재설정 링크입니다.',
    });
    const [job] = await service.readEmailJobs('email-worker-retry');

    const retryMessageId = await service.retryEmailJob(job);
    await service.ackEmailJob(job.id);
    const [retriedJob] = await service.readEmailJobs('email-worker-retry');

    expect(retriedJob).toMatchObject({
      id: retryMessageId,
      to: job.to,
      type: job.type,
      retryCount: 1,
    });
    await expect(service.getPendingSummary()).resolves.toMatchObject({ pending: 1 });
  });

  it('새 작업이 없으면 빈 배열을 반환한다', async () => {
    await service.createConsumerGroup();

    await expect(service.readEmailJobs('idle-email-worker')).resolves.toEqual([]);
  });
});
