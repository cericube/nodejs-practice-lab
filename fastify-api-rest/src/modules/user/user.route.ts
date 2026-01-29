// src/module/user/user.route.ts
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import {
  UserResponseSchema,
  UserCreateBodySchema,
  UserUpdateBodySchema,
  UserIdParamsSchema,
  UserListQuerySchema,
  UserListResponseSchema,
  UserDetailResponseSchema,
} from './user.dto';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

/**
 * User 관련 HTTP 엔드포인트를 등록하는 Fastify Plugin
 *
 * 책임:
 * - URL + HTTP Method 정의
 * - Request/Response Schema 연결 (validation + Swagger)
 * - HTTP 계층에서 controller 호출
 *
 * 비즈니스 로직은 절대 여기서 작성하지 않는다.
 */

export const userRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // 1. infra
  const prisma = fastify.prisma;
  // 2. repository
  const userRepository = new UserRepository(prisma);
  // 3. service
  const userService = new UserService(userRepository);
  // 4. controller
  const userController = new UserController(userService);

  // ======================================================
  // POST /users
  // ======================================================
  fastify.post(
    '/', // prefix가 /users 라면 실제 경로는 POST /users
    // 이 파일에서는 리소스 기준 상대 경로만 관리

    {
      /**
       * RouteShorthandOptions
       *
       * Fastify가 이 엔드포인트에 대해 사용하는 설정 묶음
       * - validation
       * - serialization
       * - swagger 문서 생성
       *
       * → 이 객체 하나로 런타임 동작 + 문서 계약이 동시에 결정됨
       */
      schema: {
        /**
         * Swagger 전용
         * TypeBoxTypeProvider 사용해야 오류 안나고 무시함.
         * Swagger UI에서 API를 리소스 단위로 묶는 태그
         * /docs 에서 "User" 섹션으로 그룹화됨
         */
        tags: ['User'],

        /**
         * Request Body 검증 스키마
         *
         * - 들어오는 JSON payload를 TypeBox 스키마로 validation
         * - 실패 시 handler까지 오지 않고 Fastify가 자동으로 400 반환
         */
        body: UserCreateBodySchema,

        /**
         * Response Schema
         *
         * - handler가 send() 하는 payload는 반드시 이 형태여야 함
         * - Fastify가 응답 직전에 serialization 검증 수행
         * - Swagger/OpenAPI 문서에도 그대로 노출됨
         */
        response: {
          200: UserResponseSchema,
        },
      },
    },

    /**
     * Route Handler (HTTP 계층)
     */
    async (request, reply) => {
      // Controller 호출 → 유스케이스 진입
      const result = await userController.createUser(request.body);
      return reply.code(200).send(result);
    },
  );

  // ======================================================
  // PATCH /users/:id
  // ======================================================
  fastify.patch(
    '/:id',
    {
      schema: {
        //Swagger 전용, TypeBoxTypeProvider 사용해야 오류 안나고 무시함.
        tags: ['User'],
        // Path Params 검증
        params: UserIdParamsSchema,
        // Patch Body
        body: UserUpdateBodySchema,
        // 응답: 기본 User 형태 반환
        response: {
          200: UserResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = null;
      return reply.code(200); //.send(result);
    },
  );

  // ======================================================
  // DELETE /users/:id  (Soft Delete)
  // ======================================================
  fastify.delete(
    '/:id',
    {
      schema: {
        //Swagger 전용, TypeBoxTypeProvider 사용해야 오류 안나고 무시함.
        tags: ['User'],
        // Path Params 검증
        params: UserIdParamsSchema,
        // Soft delete 후 기본 정보 반환
        response: { 200: UserResponseSchema },
      },
    },
    async (request, reply) => {
      const result = null;
      return reply.code(200); //.send(result);
    },
  );

  // ======================================================
  // GET /users  사용자 목록
  // ======================================================
  fastify.get(
    '/',
    {
      schema: {
        //Swagger 전용, TypeBoxTypeProvider 사용해야 오류 안나고 무시함.
        tags: ['User'],
        // Query String validation
        queryString: UserListQuerySchema,
        // 응답 wrapper
        response: { 200: UserListResponseSchema },
      },
    },
    async (request, reply) => {
      const result = null;
      return reply.code(200); //.send(result);
    },
  );

  // ======================================================
  // GET /users/:id  사용자 상세 정보
  // ======================================================
  fastify.get(
    '/:id',
    {
      schema: {
        //Swagger 전용, TypeBoxTypeProvider 사용해야 오류 안나고 무시함.
        tags: ['User'],
        // Path Params validation
        params: UserIdParamsSchema,
        // Detail Response
        response: { 200: UserDetailResponseSchema },
      },
    },
    async (request, reply) => {
      const result = null;
      return reply.code(200); //.send(result);
    },
  );
};
