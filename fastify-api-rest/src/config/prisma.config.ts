// src/config/prisma.config.ts

/**
 * Prisma Client & DataBase Pool 설정 모듈
 *
 * 이 모듈은 Prisma 7 환경에서 권장되는 Driver Adapter 패턴을 사용하여
 * DataBase 연결과 Prisma Client 생명주기를 관리한다.
 *
 * 핵심 설계 목표:
 * - Prisma 7 Driver Adapter(@prisma/adapter-pg) 사용
 * - pg.Pool 직접 제어 (커넥션 풀 옵션, 이벤트, 종료 시점)
 * - 개발 환경(HMR)에서 Prisma / Pool 싱글톤 유지
 * - Prisma 로그를 Pino Logger와 통합
 * - Graceful Shutdown 지원
 */

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/client';
import { env } from './env';
import type { Logger } from 'pino';

import { clearSql } from '../common/utils/utils';

/**
 * 전역(Global) 변수 선언
 *
 * 개발 환경에서 Hot Module Replacement(HMR)가 발생하면 이 파일이 여러 번 실행될 수 있다.
 *
 * 이때 PrismaClient와 pg.Pool을 매번 새로 생성하면
 * - 커넥션 누수
 * - 이벤트 리스너 중복 등록
 * - "Too many connections" 오류
 * 가 발생할 수 있다.
 *
 * 이를 방지하기 위해 global 객체에 인스턴스를 캐싱한다.
 *
 * 주의
 * - declare global 블록에서는 var만 사용 가능
 * - var는 전역 객체(globalThis)의 프로퍼티로 등록됨
 */
declare global {
  var __prisma_client__: PrismaClient | undefined;
  var __pg_pool__: Pool | undefined;
  var __prisma_logger_initialized__: boolean | undefined;
}

/**
 * Prisma 이벤트 로그를 전달할 Pino Logger
 *
 * 서버 초기화 이후 logger가 준비된 시점에 registerPrismaLogger()를 통해 주입된다.
 */
let _logger: Logger | undefined = undefined;

/**
 * Prisma 로그 이벤트를 Pino Logger와 연결한다.
 *
 * - logger는 언제든지 교체 가능
 * - 이벤트 리스너는 한 번만 등록됨 (HMR 대응)
 */
export function registerPrismaLogger(logger: Logger) {
  if (!client || !pool) {
    throw new Error('Prisma client is not initialized');
  }

  // logger는 항상 최신으로 교체
  _logger = logger;

  // HMR 환경에서 이벤트 리스너 중복 등록 방지
  if (!global.__prisma_logger_initialized__) {
    _logger.info('Registering Prisma event listeners');
    _setupPrismaEventListeners();
    global.__prisma_logger_initialized__ = true;
  }
}

/**
 * Prisma Client 및 pg.Pool 이벤트 리스너 설정
 *
 * Prisma:
 * - query / warn / error 로그 수집
 *
 * DataBase Pool:
 * - error 이벤트
 * - (dev only) 커넥션 상태 모니터링
 */
function _setupPrismaEventListeners() {
  if (!_logger) return;

  /**
   * Prisma Query 로그
   */
  client.$on('query' as never, (e: Prisma.QueryEvent) => {
    _logger?.debug(
      {
        query: clearSql(e.query),
        params: e.params,
        duration: `${e.duration}ms`,
      },
      'Prisma Query',
    );
  });

  client.$on('error' as never, (e: Prisma.LogEvent) => {
    _logger?.error({ message: e.message }, 'Prisma Error');
  });

  client.$on('warn' as never, (e: Prisma.LogEvent) => {
    _logger?.warn({ message: e.message }, 'Prisma Warning');
  });

  /**
   * pg.Pool error 이벤트
   *
   * 커넥션 레벨에서 발생하는 예기치 못한 오류 (네트워크 단절, 서버 재시작 등)
   */
  pool.removeAllListeners('error'); // HMR 시 리스너 중복 등록 방지
  pool.on('error', (err) => {
    _logger?.error({ err }, 'Unexpected DataBase pool error');
  });

  /**
   * 개발 환경에서만 Pool 상태 로깅
   *
   * acquire/release 이벤트는 트래픽이 많을 경우
   * 로그가 급증할 수 있으므로 production에서는 비활성화
   */
  if (env.NODE_ENV !== 'production') {
    const getPoolStats = () => ({
      max: env.POOL_MAX,
      total: pool.totalCount,
      idle: pool.idleCount,
      active: pool.totalCount - pool.idleCount,
      waiting: pool.waitingCount,
    });

    // HMR 시 리스너 중복 등록 방지를 위해 기존 리스너 제거
    pool.removeAllListeners('connect');
    pool.removeAllListeners('acquire');
    pool.removeAllListeners('release');
    pool.removeAllListeners('remove');

    pool.on('connect', () => {
      // info
      _logger?.info({ poolStats: getPoolStats() }, 'Pool client connected');
    });

    pool.on('acquire', () => {
      //debug
      _logger?.debug({ poolStats: getPoolStats() }, 'Pool client acquired');
    });

    pool.on('release', () => {
      //debug
      _logger?.debug({ poolStats: getPoolStats() }, 'Pool client released');
    });

    pool.on('remove', () => {
      //warn
      _logger?.warn({ poolStats: getPoolStats() }, 'Pool client removed');
    });
  }
}

/**
 * Prisma Client 및 DataBase Pool 생성
 *
 * production / dev 공통 로직
 */
function createPrismaInstance() {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  /**
   * DataBase Connection Pool 생성
   *
   * 커넥션 수명, 재사용, 타임아웃 정책을 애플리케이션에서 직접 제어
   */
  const pool = new Pool({
    connectionString,
    max: env.POOL_MAX,
    min: env.POOL_MIN,
    maxUses: env.POOL_MAX_USES,
    idleTimeoutMillis: env.POOL_IDLE_TIMEOUT_MILLIS,
    maxLifetimeSeconds: env.POOL_MAX_LIFETIME_SECONDS,
    connectionTimeoutMillis: env.POOL_CONNECTION_TIMEOUT_MILLIS,
  });

  /**
   * Prisma DataBase Driver Adapter
   */
  const adapter = new PrismaPg(pool, {
    schema: env.DATABASE_SCHEMA,
  });

  /**
   * Prisma 로그 설정
   *
   * - production: error only
   * - development: error + warn + query
   */
  const locOptions: Prisma.LogDefinition[] =
    env.NODE_ENV === 'production'
      ? [{ emit: 'event', level: 'error' }]
      : [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'query' },
        ];

  const client = new PrismaClient({
    adapter,
    log: locOptions,
  });

  return { client, pool };
}

/**
 * Prisma / Pool 인스턴스 초기화
 *
 * - production: 항상 새로 생성
 * - development: global 캐시 재사용
 */
const { client, pool } =
  env.NODE_ENV !== 'production' && global.__pg_pool__ && global.__prisma_client__
    ? { client: global.__prisma_client__, pool: global.__pg_pool__ }
    : createPrismaInstance();

if (env.NODE_ENV !== 'production') {
  global.__prisma_client__ = client;
  global.__pg_pool__ = pool;
}

/**
 * 애플리케이션에서 사용하는 Prisma Client
 */
export const prisma = client;

/**
 * Graceful Shutdown 제어 플래그
 */
let shuttingDown = false;

/**
 * Prisma & DataBase Pool Graceful Shutdown
 *
 * 서버 종료(SIGTERM, SIGINT 등) 시 호출
 */
export const shutdownPrisma = async (timeMillis = 5000) => {
  if (shuttingDown) return;
  shuttingDown = true;

  _logger?.info('Starting graceful Prisma shutdown...');

  /**
   * 타임아웃 래퍼
   *
   * 지정된 시간 내에 작업이 완료되지 않으면  강제로 실패 처리
   */
  const withTimeout = <T>(promise: Promise<T>, taskName: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${taskName} timed out after ${timeMillis}ms`)),
          timeMillis,
        ),
      ),
    ]);
  };

  try {
    if (client) {
      await withTimeout(client.$disconnect(), 'Prisma Disconnect');
      _logger?.info('Prisma Client disconnected successfully');
    }
  } catch (err) {
    _logger?.error({ err }, 'Error during Prisma Client disconnection');
  }

  try {
    if (pool) {
      await withTimeout(pool.end(), 'DataBase Pool End');
      _logger?.info('DataBase Connection Pool ended successfully');
    }
  } catch (err) {
    _logger?.error({ err }, 'Error during DataBase Pool shutdown');
  }

  if (env.NODE_ENV !== 'production') {
    global.__prisma_client__ = undefined;
    global.__pg_pool__ = undefined;
    global.__prisma_logger_initialized__ = undefined;
  }

  _logger?.info('Graceful Prisma shutdown completed');
};
