// src/config/prisma.config.ts

/**
 * Prisma Client 설정 모듈
 *
 * 이 모듈은 Prisma 7과 PostgreSQL Driver Adapter를 사용하여
 * 데이터베이스 연결을 관리합니다.
 *
 * 주요 특징:
 * - Driver Adapter 패턴 사용 (Prisma 7 필수)
 * - 개발 환경에서 싱글톤 패턴으로 불필요한 인스턴스 생성 방지
 * - Connection Pool 최적화
 * - Graceful Shutdown 지원
 * - Pino Logger 통합
 */

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/client';
import { env } from './env';
import type { Logger } from 'pino';

/**
 * 전역 타입 선언
 *
 * 개발 환경에서 Hot Module Replacement(HMR) 발생 시
 * 기존 PrismaClient 인스턴스를 재사용하기 위한 전역 변수 선언
 *
 * 주의사항:
 * - declare global 블록 내부에서는 var만 사용 가능
 * - let/const는 블록 스코프 변수이므로 전역 선언에 사용 불가
 * - var는 함수 스코프이며 전역 객체(global)의 프로퍼티로 등록됨
 */
declare global {
  // PrismaClient 인스턴스를 저장할 전역 변수
  var __prisma_client__: PrismaClient | undefined;

  // PostgreSQL Connection Pool을 저장할 전역 변수
  var __pg_pool__: Pool | undefined;
}

/**
 * 로거 저장소 (모듈 레벨)
 *
 * registerLogger()를 통해 등록된 로거를 저장합니다.
 * 등록된 로거가 있으면 모든 로그가 이 로거를 통해 출력됩니다.
 */
let _registeredLogger: Logger | undefined = undefined;

/**
 * Pino Logger 등록 함수
 *
 * Prisma 설정 모듈에 로거를 등록합니다.
 * 등록 후에는 모든 Prisma 관련 로그가 등록된 로거를 통해 출력됩니다.
 *
 * 사용 예시:
 * ```typescript
 * import pino from 'pino';
 * import { registerPrismaLogger, prisma } from '@/config/prisma.config';
 *
 * const logger = pino({ level: 'info' });
 * registerPrismaLogger(logger);
 *
 * // 이제 prisma 사용 시 모든 로그가 logger를 통해 출력됨
 * await prisma.user.findMany();
 * ```
 *
 * @param {Logger} logger - Pino 로거 인스턴스
 */
export function registerPrismaLogger(logger: Logger) {
  _registeredLogger = logger;
  logger.info('Logger registered to Prisma config');
  // Prisma 쿼리 로그 이벤트 리스너 등록
  _setupPrismaEventListeners();
}
/**
 * Prisma 이벤트 리스너 설정 (Private)
 *
 * Prisma의 쿼리, 에러, 경고 이벤트를 등록된 로거로 전달합니다.
 * registerLogger() 호출 후에만 실행됩니다.
 */
function _setupPrismaEventListeners() {
  if (!_registeredLogger || !client) return;
  const log = _registeredLogger;

  // 쿼리 로그 이벤트
  client.$on('query' as never, (e: Prisma.QueryEvent) => {
    log.debug(
      {
        query: e.query,
        params: e.params,
        duration: `${e.duration}ms`,
        target: e.target,
      },
      'Prisma Query',
    );
  });

  // 에러 로그 이벤트
  client.$on('error' as never, (e: Prisma.LogEvent) => {
    log.error(
      {
        message: e.message,
        target: e.target,
      },
      'Prisma Error',
    );
  });

  // 경고 로그 이벤트
  client.$on('warn' as never, (e: Prisma.LogEvent) => {
    log.warn(
      {
        message: e.message,
        target: e.target,
      },
      'Prisma Warning',
    );
  });
}

/**
 * PrismaClient 인스턴스 생성 함수 (Private)
 *
 * Prisma 7의 Driver Adapter 패턴을 사용하여
 * PrismaClient와 Connection Pool을 생성합니다.
 *
 * @returns {object} client와 pool을 포함한 객체
 * @throws {Error} DATABASE_URL이 정의되지 않은 경우
 */
function _createPrismaInstance() {
  const connectionString = env.DATABASE_URL;

  // 환경 변수 검증
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  /**
   * Step 1: PostgreSQL Connection Pool 생성
   *
   * node-pg의 Pool을 사용하여 데이터베이스 연결을 관리합니다.
   *
   * Connection Pool의 장점:
   * - 연결 재사용으로 성능 향상 (연결 생성 오버헤드 제거)
   * - 동시 연결 수 제한으로 데이터베이스 보호
   * - 유휴 연결 자동 정리 (메모리 효율성)
   *
   * 주요 설정값:
   * - max: 최대 동시 연결 수
   *   권장: CPU 코어 수 * 2 + 1 (기본값: 10)
   *   예: 4코어 시스템 = 9개 연결
   * - idleTimeoutMillis: 유휴 연결 유지 시간
   *   기본값: 10,000ms (10초)
   *   유휴 연결은 이 시간 후 자동으로 종료됨
   */
  const pool = new Pool({
    connectionString,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: env.DATABASE_POOL_IDLE_TIMEOUT,
  });

  /**
   * Pool 에러 핸들링
   *
   * 예상치 못한 Pool 에러 발생 시 프로세스 크래시를 방지합니다.
   *
   * 일반적인 에러 케이스:
   * - 데이터베이스 서버 다운 또는 재시작
   * - 네트워크 연결 끊김 또는 타임아웃
   * - 최대 연결 수 초과 (PostgreSQL max_connections)
   * - 인증 실패 또는 권한 문제
   *
   * 중요: 이 핸들러는 유휴 연결에서 발생하는 에러를 처리합니다.
   * 활성 쿼리 중 발생하는 에러는 해당 쿼리의 Promise에서 reject됩니다.
   */
  pool.removeAllListeners('error'); // HMR 시 리스너 중복 등록 방지
  pool.on('error', (err) => {
    if (_registeredLogger) {
      _registeredLogger.error({ err }, 'Unexpected PostgreSQL pool error');
    } else {
      console.error('Unexpected pool error:', err);
    }
  });

  /**
   * 개발 환경 전용: Pool 상태 모니터링
   *
   * 개발 중 데이터베이스 연결 상태를 추적하여 디버깅을 돕습니다.
   * 운영 환경에서는 성능을 위해 비활성화됩니다.
   */
  if (env.NODE_ENV !== 'production') {
    /**
     * Pool 상태를 객체로 반환하는 헬퍼 함수
     *
     * @returns {object} 현재 Pool 통계
     * - max: 설정된 최대 연결 수
     * - total: 현재 생성된 전체 연결 수
     * - idle: 사용 가능한 유휴 연결 수
     * - active: 현재 사용 중인 연결 수
     * - waiting: Pool이 가득 차서 대기 중인 요청 수
     */
    const getPoolStats = () => ({
      max: env.DATABASE_POOL_MAX,
      total: pool.totalCount,
      idle: pool.idleCount,
      active: pool.totalCount - pool.idleCount,
      waiting: pool.waitingCount,
    });

    // HMR 시 리스너 중복 등록 방지를 위해 기존 리스너 제거
    pool.removeAllListeners('connect');
    pool.removeAllListeners('remove');

    // 새 연결 생성 시
    pool.on('connect', () => {
      const poolStats = getPoolStats();
      if (_registeredLogger) {
        _registeredLogger.info({ poolStats }, 'New client connected');
      }
    });

    // 연결 제거 시 (유휴 타임아웃 또는 명시적 종료)
    pool.on('remove', () => {
      const poolStats = getPoolStats();
      if (_registeredLogger) {
        _registeredLogger.info({ poolStats }, 'Client removed');
      }
    });
  }

  /**
   * Step 2: Prisma PostgreSQL Adapter 생성
   *
   * Prisma 7부터는 모든 데이터베이스에 Driver Adapter가 필수입니다.
   * PrismaPg는 node-pg Pool을 Prisma와 연결하는 어댑터입니다.
   *
   * schema 옵션:
   * - PostgreSQL의 스키마를 지정합니다 (기본값: 'public')
   * - 멀티 테넌트 아키텍처에서 스키마 격리에 유용
   * - 예: schema: 'tenant_123'
   *
   * Driver Adapter의 역할:
   * - Prisma 쿼리를 실제 데이터베이스 드라이버 호출로 변환
   * - Connection Pool 관리를 데이터베이스 드라이버에 위임
   * - 다양한 데이터베이스 드라이버와의 호환성 제공
   */
  const adapter = new PrismaPg(pool, {
    schema: env.DATABASE_SCHEMA,
  });

  /**
   * Step 3: PrismaClient 인스턴스 생성
   *
   * adapter: Driver Adapter를 통해 데이터베이스와 연결
   * log: 로그 레벨 및 출력 방식 설정
   *
   * 로그 레벨 종류:
   * - 'query': 실행된 모든 SQL 쿼리, 파라미터, 실행 시간 기록
   * - 'error': 쿼리 실패, 연결 오류 등 에러 발생 시 기록
   * - 'warn': 성능 경고, Deprecated API 사용 등 경고 메시지 기록
   * - 'info': Prisma 엔진 시작/종료 등 일반 정보 기록
   *
   * emit 옵션:
   * - 'stdout': 콘솔에 직접 출력 (기본값)
   * - 'event': 이벤트로 발생시켜 리스너에서 처리 가능
   *
   * 환경별 권장 설정:
   * - 개발: ['query', 'error', 'warn'] - 디버깅 및 성능 분석
   * - 스테이징: ['error', 'warn'] - 문제 추적 및 성능 모니터링
   * - 운영: ['error'] - 성능 최적화 및 로그 저장 공간 절약
   */
  const logLevels: Prisma.LogDefinition[] =
    env.NODE_ENV === 'production'
      ? [{ emit: 'event', level: 'error' }]
      : [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'query' },
        ];

  const client = new PrismaClient({
    adapter,
    log: logLevels,
  });

  return { client, pool };
}

/**
 * PrismaClient 인스턴스 제공 함수
 *
 * 환경에 따라 적절한 인스턴스 생성 전략을 사용합니다:
 *
 * 운영 환경 (production):
 * - 매번 새로운 인스턴스 생성
 * - 서버가 재시작되지 않는 한 단일 인스턴스 유지
 * - 글로벌 변수 사용 안 함 (메모리 누수 방지)
 *
 * 개발 환경 (development):
 * - 글로벌 변수를 사용한 싱글톤 패턴
 * - HMR(Hot Module Replacement) 발생 시에도 기존 인스턴스 재사용
 * - 불필요한 데이터베이스 연결 생성 방지
 * - "too many clients" 에러 예방
 *
 * HMR(Hot Module Replacement)이란?
 * - Next.js, Vite 등의 개발 서버에서 제공하는 기능
 * - 코드 변경 시 전체 페이지를 새로고침하지 않고 변경된 모듈만 교체
 * - 브라우저 상태를 유지하면서 빠른 개발 경험 제공
 *
 * HMR과 데이터베이스 연결 문제:
 * - HMR 시 모듈이 재로드되면 PrismaClient가 매번 새로 생성됨
 * - 이전 연결이 정리되지 않으면 연결 수가 계속 증가
 * - PostgreSQL의 max_connections 한계에 도달하여 에러 발생
 * - 글로벌 변수로 인스턴스를 재사용하여 이 문제 해결
 *
 * @returns {object} PrismaClient와 Pool 인스턴스
 */
const getInstances = () => {
  // 운영 환경: 단순히 새 인스턴스 생성
  if (env.NODE_ENV === 'production') {
    return _createPrismaInstance();
  }

  /**
   * 개발 환경: 글로벌 싱글톤 패턴
   *
   * 동작 원리:
   * 1. 첫 실행 시: 글로벌 변수가 undefined이므로 새 인스턴스 생성 및 저장
   * 2. HMR 발생 시: 글로벌 변수에 저장된 인스턴스 재사용
   * 3. 서버 재시작 시: 글로벌 변수가 초기화되어 새 인스턴스 생성
   *
   * 기술적 세부사항:
   * - 글로벌 변수는 Node.js의 global 객체에 저장됨
   * - TypeScript 컴파일 후에도 런타임에 유지됨
   * - 모듈 시스템을 우회하여 HMR 영향을 받지 않음
   *
   * 주의사항:
   * - 오직 개발 환경에서만 사용 (운영 환경에서는 메모리 누수 가능)
   * - 수동으로 서버를 재시작해야 완전히 초기화됨
   */
  if (!global.__prisma_client__ || !global.__pg_pool__) {
    const { client, pool } = _createPrismaInstance();
    global.__prisma_client__ = client;
    global.__pg_pool__ = pool;
  }

  return {
    client: global.__prisma_client__,
    pool: global.__pg_pool__,
  };
};

/**
 * 기본 인스턴스 생성
 *
 * 모듈 로드 시 자동으로 인스턴스가 생성됩니다.
 * 이는 애플리케이션 시작 시 데이터베이스 연결을 미리 준비하여
 * 첫 번째 쿼리의 지연 시간을 줄입니다.
 */
const { client, pool } = getInstances();

/**
 * 외부에서 사용할 PrismaClient 인스턴스
 *
 * 사용 예시:
 * ```typescript
 * import { prisma, registerLogger } from '@/config/prisma.config';
 * import pino from 'pino';
 *
 * // 선택적: 로거 등록
 * const logger = pino({ level: 'info' });
 * registerLogger(logger);
 *
 * // Prisma 사용
 * const users = await prisma.user.findMany();
 *
 * // 트랜잭션 사용
 * await prisma.$transaction(async (tx) => {
 *   await tx.user.create({ data: { name: 'Alice' } });
 *   await tx.post.create({ data: { title: 'Hello' } });
 * });
 * ```
 */
export const prisma = client;

/**
 * Graceful Shutdown 함수
 *
 * 애플리케이션 종료 시 안전하게 데이터베이스 연결을 정리합니다.
 *
 * 호출 시점:
 * - SIGTERM, SIGINT 시그널 수신 시
 * - 애플리케이션 종료 전
 * - 배포/재배포 시
 *
 * 사용 예시:
 * ```typescript
 * process.on('SIGTERM', async () => {
 *   await shutdownPrisma();
 *   process.exit(0);
 * });
 * ```
 *
 * Graceful Shutdown이 필요한 이유:
 * 1. 진행 중인 트랜잭션 완료 보장
 * 2. 데이터베이스 연결 정상 종료
 * 3. 리소스 누수 방지
 * 4. 데이터베이스 서버의 부하 감소
 *
 * @async
 * @returns {Promise<void>}
 */
export const shutdownPrisma = async (timeMillis = 5000) => {
  const log = _registeredLogger;

  if (log) {
    log.info('Starting graceful Prisma shutdown...');
  } else {
    console.log('Starting graceful shutdown...');
  }

  /**
   * 타임아웃 래퍼 함수
   * 작업을 수행하되, 지정된 시간 내에 완료되지 않으면 에러를 발생시킴
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

  /**
   * Step 1: PrismaClient 연결 종료
   *
   * $disconnect()는 다음을 수행합니다:
   * 1. 새로운 쿼리 요청 거부
   * 2. 진행 중인 쿼리 완료 대기 (타임아웃 없음)
   * 3. 커넥션 풀에서 모든 연결 반환
   * 4. Prisma 엔진 프로세스 종료
   * 5. 내부 리소스 정리
   *
   * 에러 처리:
   * - 연결이 이미 종료된 경우: "Client is already disconnected" 에러 발생 가능
   * - 진행 중인 쿼리 실패 시: 해당 에러가 throw됨
   * - Pool 종료를 위해 try-catch로 에러를 잡고 계속 진행
   *
   * 주의사항:
   * - $disconnect() 후에는 prisma 인스턴스를 재사용할 수 없음
   * - 재사용하려면 새로운 PrismaClient 인스턴스 생성 필요
   */
  try {
    if (client) {
      await withTimeout(client.$disconnect(), 'Prisma Disconnect');
      if (log) log.info('Prisma Client disconnected successfully');
    }
  } catch (err) {
    if (log) {
      log.error({ err }, 'Error during Prisma Client disconnection');
    } else {
      console.error('Error during Prisma Client disconnection:', err);
    }
  }

  /**
   * Step 2: PostgreSQL Pool 종료
   *
   * pool.end()는 다음을 수행합니다:
   * 1. 새로운 연결 요청 거부
   * 2. 모든 활성 연결이 반환될 때까지 대기
   * 3. 유휴 연결 즉시 종료
   * 4. 모든 연결이 정리될 때까지 Promise 대기
   *
   * 주의사항:
   * - pool.end() 호출 후에는 새로운 쿼리 실행 불가
   * - 타임아웃이 없으므로 무한 대기할 수 있음
   *   (필요 시 Promise.race로 타임아웃 구현 가능)
   */
  try {
    if (pool) {
      await withTimeout(pool.end(), 'Postgres Pool End');
      if (log) log.info('PostgreSQL Connection Pool ended successfully');
    }
  } catch (err) {
    if (log) {
      log.error({ err }, 'Error during PostgreSQL Pool shutdown');
    } else {
      console.error('Error during Postgres Pool shutdown:', err);
    }
  }

  /**
   * Step 3: 개발 환경 글로벌 변수 정리
   *
   * 개발 환경에서만 글로벌 변수를 초기화합니다.
   *
   * 이유:
   * - 개발 환경에서 수동으로 서버 재시작 시 깨끗한 상태 보장
   * - 운영 환경에서는 프로세스가 완전히 종료되므로 불필요
   *
   * 주의:
   * - 글로벌 변수를 undefined로 설정해도 메모리는 즉시 해제되지 않음
   * - Node.js 가비지 컬렉터가 적절한 시점에 메모리 회수
   */
  if (env.NODE_ENV !== 'production') {
    global.__prisma_client__ = undefined;
    global.__pg_pool__ = undefined;
  }

  if (log) {
    log.info('Graceful Prisma shutdown completed');
  } else {
    console.log('Graceful Prisma shutdown completed');
  }
};
