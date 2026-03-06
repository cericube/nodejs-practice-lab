// src/plugins/prisma.plugin.ts

/**
 * Prisma Fastify 플러그인 모듈
 * * 이 모듈은 PrismaClient를 Fastify 인스턴스에 통합하여
 * 애플리케이션 전역에서 데이터베이스 접근을 가능하게 합니다.
 * * 주요 특징:
 * - Fastify Decorator를 통한 Prisma 인스턴스 주입
 * - Fastify 기본 로거(Pino)와 Prisma 로깅 시스템 통합
 * - 'onClose' 훅을 사용한 Graceful Shutdown 자동화
 * - fastify-plugin을 사용한 캡슐화 방지 (전역 사용 가능)
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';
import { prisma, registerPrismaLogger, shutdownPrisma } from '../config/prisma.config';

/**
 * Fastify 타입 확장 (Declaration Merging)
 * * TypeScript에게 Fastify 인스턴스 내에 'prisma' 객체가 존재함을 알립니다.
 * 이를 통해 코드 작성 시 자동 완성과 타입 체크 혜택을 받을 수 있습니다.
 * * 사용 예시:
 * ```typescript
 * fastify.get('/users', async (request, reply) => {
 * return await fastify.prisma.user.findMany();
 * });
 * ```
 */
// src/types/fastify.d.ts
// declare module 'fastify' {
//   interface FastifyInstance {
//     prisma: typeof prisma;
//   }
// }

/**
 * Prisma 플러그인 본체
 * * Fastify 생명주기에 맞춰 Prisma를 설정하고 등록합니다.
 * * @param {FastifyInstance} fastify - Fastify 인스턴스
 */
export const prismaPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * Step 1: 로거 통합
   * * Fastify의 내장 Pino 로거를 Prisma 설정에 등록합니다.
   * 이로 인해 Prisma에서 발생하는 모든 쿼리, 에러, 경고 로그가
   * 애플리케이션의 메인 로그 스트림과 통합됩니다.
   * * 주의: FastifyBaseLogger와 Pino Logger 간의 미세한 타입 차이로 인해
   * 'unknown'을 거쳐 타입 캐스팅을 수행합니다.
   * as unknown as Logger — 완전한 강제 캐스팅 (타입 체크 우회)
   * 1. fastify.log as unknown
   *   → 모든 타입은 unknown으로 캐스팅 가능 (top type)
   * 2. unknown as Logger
   *   → unknown은 어떤 타입으로도 캐스팅 가능
   */
  registerPrismaLogger(fastify.log as unknown as Logger);

  /**
   * Step 2: 인스턴스 데코레이션
   * * 'decorate'를 사용하여 Prisma 인스턴스를 Fastify 루트 인스턴스에 추가합니다.
   * 이후 모든 Route나 Hook에서 'fastify.prisma'로 접근이 가능합니다.
   * * 장점:
   * - 의존성 주입(DI) 효과: 매번 prisma를 import할 필요 없음
   * - 테스트 용이성: 필요한 경우 Mocking이 수월함
   */
  fastify.decorate('prisma', prisma);

  /**
   * Step 3: 자원 정리 (Graceful Shutdown)
   * * 'onClose' 훅은 Fastify 서버가 종료될 때(fastify.close() 호출 시) 실행됩니다.
   * * 수행 작업:
   * - 진행 중인 쿼리 및 트랜잭션의 안전한 마침 보장
   * - PostgreSQL 커넥션 풀의 연결 정상 종료
   * - 5,000ms(5초)의 타임아웃을 설정하여 무한 대기 방지
   */
  fastify.addHook('onClose', async (_instance) => {
    // shutdownPrisma 내부에서 로거를 사용하여 종료 로그를 기록함
    await shutdownPrisma(5000);
  });
};

/**
 * fastify-plugin 래퍼
 * * 기본적으로 Fastify의 플러그인은 새로운 스코프를 생성하여(Encapsulation)
 * 내부에서 등록한 데코레이터가 외부로 노출되지 않습니다.
 * * fp()를 사용함으로써:
 * - prismaPlugin에서 등록한 'prisma' 데코레이터를 앱 전체에서 사용 가능하게 함
 * - 플러그인 간 의존성 및 로드 순서 관리
 */
export default fp(prismaPlugin, {
  name: 'prisma-plugin',
  // 해당 플러그인이 다른 플러그인보다 먼저 로드되어야 할 경우 등을 대비한 설정
});
