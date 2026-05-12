// src/module/user/user.route.ts
// 인터페이스 계층
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  UserResponseSchema,
  UserCreateBodySchema,
  UserUpdateBodySchema,
  UserIdParamsSchema,
  UserListQuerySchema,
  UserListResponseSchema,
  UserDetailResponseSchema,
  UserQuerySchema,
  UserCountSchema,
  UserCountQuerySchema,
  UserExistsSchema,
} from './user.dto';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { success, SuccessResponseSchema } from '../../common/response/response.success';

/**
 * [Route Layer: 인터페이스 및 검증 계층]
 * 1. Request Validation:
 *   Body, Params, Querystring의 타입을 런타임에서 체크하여
 *   잘못된 요청을 400 에러로 즉시 차단합니다.
 * 2. Response Serialization:
 *   정의된 스키마에 없는 데이터는 응답에서 제외(Filtering)하여
 *   민감 정보 유출을 방지하고 성능을 최적화합니다.
 */
export const userRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // 의존성 주입 (DI)
  const prisma = fastify.prisma;
  const userRepository = new UserRepository(prisma);
  const userService = new UserService(userRepository);
  const userController = new UserController(userService);

  // ------------------------------------------------------
  // API 엔드포인트 정의 (Prefix: /api/users 가정)
  // ------------------------------------------------------

  /**
   * POST /api/users
   * 새로운 사용자 등록
   * - 요청: UserCreateBodySchema에 정의된 필수 필드(email, password 등) 유무 확인
   * - 응답: 생성된 사용자 정보를 UserResponseSchema 규격에 맞춰 필터링 후 반환
   */
  fastify.post(
    '/',
    {
      schema: {
        tags: ['User'],
        body: UserCreateBodySchema,
        response: { 200: SuccessResponseSchema(UserResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await userController.createUser(request.body);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * PATCH /api/users/:id (예: /api/users/123)
   * 사용자 정보 수정
   * - 요청: URL의 :id가 유효한 형식인지(Params) + 수정할 필드만 포함된 Body 검증
   * - 응답: 수정 완료된 사용자 정보를 표준 규격으로 반환
   */
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['User'],
        params: UserIdParamsSchema,
        body: UserUpdateBodySchema,
        response: { 200: SuccessResponseSchema(UserResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await userController.updateUser(request.params, request.body);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * GET /api/users?email=test@test.com
   * 조건 기반 사용자 단건 상세 조회
   * - 요청: QueryString에 허용된 검색 조건만 포함되어 있는지 확인
   * - 응답: 상세 프로필 정보를 포함한 UserDetailResponseSchema 반환
   */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['User'],
        querystring: UserQuerySchema,
        response: { 200: SuccessResponseSchema(UserDetailResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await userController.getUser(request.query);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * GET /api/users/count?role=ADMIN
   * 조건에 맞는 사용자 수 조회
   * - 요청: 카운트용 필터 조건 검증
   * - 응답: { count: number } 형태의 데이터 보장
   */
  fastify.get(
    '/count',
    {
      schema: {
        tags: ['User'],
        querystring: UserCountQuerySchema,
        response: { 200: SuccessResponseSchema(UserCountSchema) },
      },
    },
    async (request, reply) => {
      const result = await userController.countUser(request.query);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * GET /api/users/exists?nickname=gemini
   * 아이디/이메일 등 중복 여부 확인
   * - 요청: 존재 확인을 위한 필드값 검증
   * - 응답: { exists: boolean } 형태의 명확한 타입 보장
   */
  fastify.get(
    '/exists',
    {
      schema: {
        tags: ['User'],
        querystring: UserQuerySchema,
        response: { 200: SuccessResponseSchema(UserExistsSchema) },
      },
    },
    async (request, reply) => {
      const result = await userController.existsUser(request.query);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * DELETE /api/users/:id (예: /api/users/123)
   * 사용자 탈퇴 (Soft Delete)
   * - 요청: 삭제 대상 식별자(:id) 형식 검증
   * - 응답: 삭제 처리된 데이터의 기본 상태 정보 반환
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['User'],
        params: UserIdParamsSchema,
        response: { 200: SuccessResponseSchema(UserResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await userController.softDeleteUser(request.params);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * PATCH /api/users/:id/restore (예: /api/users/123/restore)
   * 삭제된 사용자 복구
   * - 요청: 복구 대상 식별자(:id) 검증
   * - 응답: 활성화된 사용자 정보 반환
   */
  fastify.patch(
    '/:id/restore',
    {
      schema: {
        tags: ['User'],
        params: UserIdParamsSchema,
        response: { 200: SuccessResponseSchema(UserResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await userController.restoreUser(request.params);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * GET /api/users/list?page=1&limit=10
   * 사용자 목록 검색 및 페이징 조회
   * - 요청: 페이지 번호, 한 페이지당 개수 등 Pagination 스키마 검증
   * - 응답: 데이터 배열과 메타데이터를 포함한 UserListResponseSchema 반환
   */
  fastify.get(
    '/list',
    {
      schema: {
        tags: ['User'],
        querystring: UserListQuerySchema,
        response: { 200: SuccessResponseSchema(UserListResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await userController.listUsers(request.query);
      return reply.code(200).send(success(result));
    },
  );
};
