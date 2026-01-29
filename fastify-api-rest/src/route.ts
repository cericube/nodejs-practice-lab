// src/routes.ts
import type { FastifyInstance } from 'fastify';

// modules
// import healthRoutes from "./modules/health/health.route";
import { userRoutes } from './modules/user/user.route';
// import profileRoutes from "./modules/profile/profile.route";
// import postRoutes from "./modules/post/post.route";
// import replyRoutes from "./modules/reply/reply.route";

export async function routes(app: FastifyInstance) {
  // Health
  //await app.register(healthRoutes, { prefix: '/health' });
  // API v1 (원하면 /api/v1로 한번 더 감싸도 됨)
  await app.register(userRoutes, { prefix: '/users' });
  //await app.register(profileRoutes, { prefix: '/profiles' });
  //
  //await app.register(postRoutes, { prefix: '/posts' });
  //await app.register(replyRoutes, { prefix: '/replies' });
  // like/file이 route를 갖는다면 여기에 추가
  // await app.register(likeRoutes, { prefix: "/likes" });
  // await app.register(fileRoutes, { prefix: "/files" });
}
