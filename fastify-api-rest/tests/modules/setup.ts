import pino from 'pino';
import { beforeAll, afterAll } from 'vitest';
import { prisma, registerPrismaLogger, shutdownPrisma } from '../../src/config/prisma.config';

export const logger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
      singleLine: false,
    },
  },
});

export { prisma };

beforeAll(async () => {
  console.log('테스트 시작 전 setup beforeAll() 함수 실해 중... ');
  registerPrismaLogger(logger);
});

afterAll(async () => {
  console.log('테스트 종료 후 setup afterAll() 할수 실행 중... ');
  shutdownPrisma();
});
