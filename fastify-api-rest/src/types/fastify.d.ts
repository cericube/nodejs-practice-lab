import 'fastify';
import { PrismaClient } from '../generated/client';

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
// plugins/prisma.plugin.ts 참고
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
