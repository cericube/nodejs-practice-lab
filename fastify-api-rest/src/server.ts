// src/server.ts
import { env } from './config/env';
import { createApp } from './app';

// Fastify 앱을 초기화하고 설정된 host/port로 서버를 시작한다.
async function startServer() {
  // createApp()에서 등록된 플러그인/라우트가 포함된 앱을 생성한다.
  const app = await createApp();

  let isShuttingDown = false;

  // 프로세스 종료 시 공통적으로 호출되는 graceful shutdown 로직
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    try {
      app.log.info({ signal }, 'Gracefully shutting down');
      // - keep-alive 연결 정리
      // - plugin onClose 훅 실행 (DB, Redis, Queue 정리 지점)
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Shutdown failed');
      process.exit(1);
    }
  };

  // void : Promise를 의도적으로 무시한다는 의사표현
  // SIGINT (Interrupt)
  // - 터미널에서 Ctrl + C 입력 시 발생
  // - 주로 개발 환경에서 서버 종료할 때 발생
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // SIGTERM (Termination) — 운영 환경에서 가장 중요
  // - Docker: docker stop
  // - Kubernetes: Pod 종료 / 재배포
  // - PM2, systemd 서비스 종료
  // → 반드시 graceful shutdown 수행해야 데이터 정합성 유지 가능
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // unhandledRejection
  // - Promise에서 에러가 발생했지만 await/catch로 처리되지 않은 경우
  // - 상태가 이미 오염되었을 가능성이 높으므로 복구 시도하지 않고 종료 권장
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled rejection');
    void shutdown('unhandledRejection');
  });

  // uncaughtException
  // - try/catch로 잡히지 않고 이벤트 루프 최상단까지 전파된 동기 예외
  // - Node 공식 문서상 "undefined state" → 즉시 종료가 정석
  process.on('uncaughtException', (err) => {
    app.log.error({ err }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });

  try {
    // HTTP 서버를 시작하고 실제 바인딩 주소를 로그로 남긴다.
    const address = await app.listen({
      host: env.HOST,
      port: env.PORT,
    });
    app.log.info(`Server listening at ${address}`);
  } catch (err) {
    // 시작 실패를 로그로 남기고 비정상 종료한다(프로세스 매니저 감지용).
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// 실행 시 서버 시작.
startServer();
