import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { LogListService } from '../../src/services/log-list.service.js';
import '../setup.js';

describe('LogListService', () => {
  const logListService = new LogListService();

  it('로그를 버퍼에 추가하고 로그 개수를 조회한다', async () => {
    const log = await logListService.addLog({
      level: 'INFO',
      message: '서버가 시작되었습니다.',
      context: {
        port: 3000,
        ready: true,
      },
    });

    expect(log).toMatchObject({
      level: 'INFO',
      message: '서버가 시작되었습니다.',
      context: {
        port: 3000,
        ready: true,
      },
    });
    expect(new Date(log.createdAt).toString()).not.toBe('Invalid Date');
    await expect(logListService.getLogCount()).resolves.toBe(1);
  });

  it('최근 로그를 최신순으로 조회한다', async () => {
    const firstLog = await logListService.addLog({
      level: 'INFO',
      message: '첫 번째 로그',
    });
    const secondLog = await logListService.addLog({
      level: 'WARN',
      message: '두 번째 로그',
    });

    await expect(logListService.getRecentLogs()).resolves.toEqual([secondLog, firstLog]);
  });

  it('limit 개수만큼 최근 로그를 유지한다', async () => {
    await logListService.addLog(
      {
        level: 'INFO',
        message: '첫 번째 로그',
      },
      2,
    );
    const secondLog = await logListService.addLog(
      {
        level: 'WARN',
        message: '두 번째 로그',
      },
      2,
    );
    const thirdLog = await logListService.addLog(
      {
        level: 'ERROR',
        message: '세 번째 로그',
      },
      2,
    );

    await expect(logListService.getRecentLogs(10)).resolves.toEqual([thirdLog, secondLog]);
    await expect(logListService.getLogCount()).resolves.toBe(2);
  });

  it('조회 limit 개수만큼 최근 로그를 반환한다', async () => {
    await logListService.addLog({
      level: 'INFO',
      message: '첫 번째 로그',
    });
    const secondLog = await logListService.addLog({
      level: 'WARN',
      message: '두 번째 로그',
    });
    const thirdLog = await logListService.addLog({
      level: 'ERROR',
      message: '세 번째 로그',
    });

    await expect(logListService.getRecentLogs(2)).resolves.toEqual([thirdLog, secondLog]);
  });

  it('최근 로그 중 ERROR 레벨 로그만 조회한다', async () => {
    await logListService.addLog({
      level: 'INFO',
      message: '정상 요청',
    });
    const firstErrorLog = await logListService.addLog({
      level: 'ERROR',
      message: 'DB 연결 실패',
    });
    await logListService.addLog({
      level: 'WARN',
      message: '응답 지연',
    });
    const secondErrorLog = await logListService.addLog({
      level: 'ERROR',
      message: 'Redis 연결 실패',
    });

    await expect(logListService.getRecentErrorLogs()).resolves.toEqual([
      secondErrorLog,
      firstErrorLog,
    ]);
  });

  it('최근 로그 조회 시 JSON 파싱에 실패한 값은 제외한다', async () => {
    const key = RedisKey.list.logBuffer();
    const log = await logListService.addLog({
      level: 'INFO',
      message: '정상 로그',
    });

    await redis.lPush(key, 'not-json');

    await expect(logListService.getRecentLogs()).resolves.toEqual([log]);
  });

  it('로그 버퍼를 전체 초기화한다', async () => {
    const key = RedisKey.list.logBuffer();

    await logListService.addLog({
      level: 'INFO',
      message: '삭제할 로그',
    });

    await logListService.clearLogs();

    await expect(redis.exists(key)).resolves.toBe(0);
    await expect(logListService.getRecentLogs()).resolves.toEqual([]);
  });
});
