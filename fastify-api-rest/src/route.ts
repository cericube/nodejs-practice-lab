// src/routes.ts
import type { FastifyInstance } from 'fastify';

/**
 * [Central Route Registry: 계층적 라우팅 구성]
 * 1. [Level 1] src/app.ts: app.register(routes, { prefix: '/api' });
 * 2. [Level 2] src/routes.ts: app.register(userRoutes, { prefix: '/users' });
 * 3. [Level 3] user.route.ts: fastify.get('/:id', ...);
 * => 최종 엔드포인트: GET /api/users/:id
 *
 * 전략적 이점:
 * - 네임스페이스 격리: 모든 API를 '/api' 하위로 모아 정적 리소스나 프론트엔드 경로와의 충돌을 방지합니다.
 * - 일괄 제어: 필요 시 prefix를 '/api/v1'으로 변경하여 전체 API 버전을 한 번에 업데이트할 수 있습니다.
 * - 모듈화: 각 도메인(User, Post 등)의 상세 로직을 독립적으로 유지하면서도 중앙에서 구조를 관리합니다.
 */

import { userRoutes } from './modules/user/user.route';
import { postRoutes } from './modules/post/post.route';
import { replyRoutes } from './modules/reply/reply.route';
import { postLikeRoutes } from './modules/postlike/postlike.route';
import { postFileRoutes } from './modules/postfile/postfile.route';

export async function routes(app: FastifyInstance) {
  // API v1 (원하면 /api/v1로 한번 더 감싸도 됨)
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(postRoutes, { prefix: '/posts' });
  await app.register(postFileRoutes, { prefix: '/files' });
  await app.register(replyRoutes, { prefix: '/replies' });
  await app.register(postLikeRoutes, { prefix: '/postlikes' });
}
