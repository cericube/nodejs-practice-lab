// src/app.ts
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

import { env } from './config/env';
import { errorHandler } from './common/errors/error.handler';

import { prismaPlugin } from './plugins/prisma.plugin';
import { routes } from './route';

// ================================
// Fastify Application Factory
// ================================
// - 테스트 / 프로덕션 공통으로 사용하는 서버 생성 진입점
// - listen()은 여기서 하지 않고, main.ts 등에서 수행
// - 이렇게 분리하면 e2e 테스트 시 서버 인스턴스만 생성해서 사용 가능
export const createApp = async () => {
  // --------------------------------
  // 1. Fastify 서버 인스턴스 생성
  // --------------------------------
  // Fastify()는 서버 인스턴스를 생성하는 팩토리 함수
  // 옵션은 "프로세스 전역 레벨" 설정 (로깅, 타임아웃, 라우터 정책 등)
  const app = Fastify({
    // --------------------------------
    // Logging (Pino 기반)
    // --------------------------------
    // 환경에 따라 pretty log / 파일 로그 분기
    logger: {
      level: env.LOG_LEVEL,
      transport: {
        targets: [
          env.NODE_ENV === 'development'
            ? // 개발 환경: 사람이 읽기 쉬운 pretty log
              // (pino-pretty 패키지 필요)
              {
                target: 'pino-pretty',
                level: 'info',
                options: {
                  colorize: true,
                  translateTime: 'yyyy-mm-dd HH:MM:ss',
                  ignore: 'pid,hostname',
                },
              }
            : // 운영 환경: 파일 로그 (로그 수집 시스템과 연계)
              {
                target: 'pino/file',
                options: { destination: env.LOG_PATH, mkdir: true },
                level: 'info',
              },
        ],
      },
    },

    // --------------------------------
    // HTTP / Connection Level Safety
    // --------------------------------
    // 요청 본문 최대 크기 (대용량 업로드/DoS 방지)
    bodyLimit: 1024 * 1024,

    // TCP 연결 및 요청 타임아웃 정책
    connectionTimeout: 10_000, // 소켓 연결 제한
    keepAliveTimeout: 5_000, // keep-alive 유지 시간
    requestTimeout: 30_000, // 요청 처리 전체 제한 시간

    // --------------------------------
    // Reverse Proxy 환경 대응
    // --------------------------------
    // Nginx, ALB 뒤에 있을 경우 실제 client IP를 신뢰
    trustProxy: true,

    // --------------------------------
    // Plugin & Router System Limits
    // --------------------------------
    // 플러그인 초기화 지연 방지 (DB 커넥션 등)
    pluginTimeout: 10_000,

    routerOptions: {
      // /path 와 /path/ 를 동일한 라우트로 처리
      ignoreTrailingSlash: true,

      // URL 대소문자 구분 비활성화
      caseSensitive: false,

      // Path parameter 최대 길이 제한 (ReDoS 방지)
      maxParamLength: 200,
    },
  })
    // --------------------------------
    // 2. Type Provider 연결
    // --------------------------------
    // Fastify schema → TypeScript 타입 자동 연결
    // 이후 route에서 request.body / params / reply 타입이
    // TypeBox 스키마 기반으로 추론됨
    .withTypeProvider<TypeBoxTypeProvider>();

  // ==========================================================
  // 여기부터는 "애플리케이션 구성 단계"
  // (의존성 → 정책 → 기능 순서로 등록하는 것이 일반적)
  // 또한 등록 순서도 매우 좋습니다:
  // Infra plugin (prisma)
  // Global error policy
  // Business routes
  // ==========================================================

  // --------------------------------
  // 3. Infrastructure Plugins
  // --------------------------------
  // 예: DB, Redis, Message Queue, External SDK
  // fastify.decorate('prisma', prisma) 같은 방식으로
  // request / app 인스턴스에 의존성 주입
  await app.register(prismaPlugin);

  // --------------------------------
  // 4. Global Error Policy
  // --------------------------------
  // throw 된 모든 에러를 단일 응답 포맷으로 변환
  // (비즈니스 에러 / 검증 에러 / 시스템 에러 분리 처리)
  app.setErrorHandler(errorHandler);

  // --------------------------------
  // 5. Routes (Application Layer)
  // --------------------------------
  // 실제 비즈니스 API 엔드포인트 등록
  // prefix를 통해 API versioning 또는 gateway routing 대응 가능
  app.register(routes, { prefix: '/api' }); // → /api/users, /api/posts ...

  // --------------------------------
  // 서버 구성 완료된 Fastify 인스턴스 반환
  // listen()은 외부(main.ts, test bootstrap)에서 수행
  // --------------------------------
  return app;
};
