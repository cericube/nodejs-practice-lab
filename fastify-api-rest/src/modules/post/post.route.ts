// src/module/post/post.route.ts
// 인터페이스 계층
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { PostController } from './post.controller';
import { PostService } from './post.service';
import { PostRepository } from './post.repository';
import { success, SuccessResponseSchema } from '../../common/response/response.success';
import {
  PostCreateBodySchema,
  PostDeleteQuerySchema,
  PostIdParamsSchema,
  PostListQuerySchema,
  PostListResponseSchema,
  PostQuerySchema,
  PostResponseSchema,
  PostUpdateBodySchema,
  PostUpdateCounterBodySchema,
  PostUpdateResponseSchema,
} from './post.dto';

/**
 * [Route Layer: 인터페이스 및 검증 계층]
 *
 * 1. Request Validation
 *   - Body / Params / Querystring을 TypeBox Schema로 검증합니다.
 *   - 스키마에 맞지 않는 요청은 Fastify가 자동으로 400 에러로 차단합니다.
 *
 * 2. Response Serialization
 *   - 정의된 Response Schema에 맞게 응답 데이터를 필터링합니다.
 *   - 불필요하거나 민감한 데이터가 응답에 포함되는 것을 방지합니다.
 *
 * 3. Controller 연결
 *   - Route 계층은 HTTP 요청을 Controller로 전달하는 역할만 수행합니다.
 *   - 비즈니스 로직은 Controller → Service → Repository 계층에서 처리됩니다.
 *
 * Prefix 예시: /api/posts
 */

// FastifyPluginAsyncTypebox 타입을 만족하는 비동기 Plugin 함수
// FastifyPluginAsyncTypebox 타입을 가진 화살표 함수를 postRoutes에 할당
export const postRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const prisma = fastify.prisma;
  const postRepository = new PostRepository(prisma);
  const postService = new PostService(postRepository);
  const postController = new PostController(postService);

  // Fastify에서 POST API 라우트를 정의하는 코드

  /**
   * POST /api/posts
   * 새로운 게시글 생성
   *
   * - 요청: PostCreateBodySchema를 통해 게시글 생성에 필요한 필드 검증
   * - 응답: 생성된 게시글 정보를 PostUpdateBodySchema 규격으로 반환
   */
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Post'],
        body: PostCreateBodySchema,
        response: { 200: SuccessResponseSchema(PostUpdateResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await postController.createPost(request.body);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * PATCH /api/posts/:id
   * 게시글 내용 수정
   *
   * - 요청:
   *   - Params: 게시글 식별자(id) 형식 검증
   *   - Body: 수정 가능한 필드(PostUpdateBodySchema)만 허용
   *
   * - 응답:
   *   - 수정 완료된 게시글 정보를 반환
   */
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['Post'],
        params: PostIdParamsSchema,
        body: PostUpdateBodySchema,
        response: { 200: SuccessResponseSchema(PostUpdateResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await postController.updatePost(request.params, request.body);

      return reply.code(200).send(success(result));
    },
  );

  /**
   * PATCH /api/posts/:id
   * 게시글 카운터 업데이트 (조회수, 좋아요 등)
   *
   * - 요청:
   *   - Params: 대상 게시글 ID 검증
   *   - Body: 카운터 증가/감소 요청(PostUpdateCounterBodySchema)
   *
   * - 응답:
   *   - 변경된 게시글 식별자 반환
   */
  // fastify.patch(
  //   '/:id/counter',
  //   {
  //     schema: {
  //       tags: ['Post'],
  //       params: PostIdParamsSchema,
  //       body: PostUpdateCounterBodySchema,
  //       response: { 200: SuccessResponseSchema(PostIdParamsSchema) },
  //     },
  //   },
  //   async (request, reply) => {
  //     const result = await postController.updateCounter(request.params, request.body);
  //     return reply.code(200).send(success(result));
  //   },
  // );

  /**
   * DELETE /api/posts/:id
   * 게시글 삭제
   *
   * - 요청:
   *   - Params: 삭제 대상 게시글 ID 검증
   *   - Body: 삭제 요청 검증(PostUpdateBodySchema)
   *
   * - 응답:
   *   - 삭제 처리 결과(PostUpdateResponseSchema)
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Post'],
        params: PostIdParamsSchema,
        querystring: PostDeleteQuerySchema,
        response: { 200: SuccessResponseSchema(PostUpdateResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await postController.deletePost(request.params, request.query);

      return reply.code(200).send(success(result));
    },
  );

  /**
   * GET /api/posts?title=test
   * 게시글 단건 조회 (조건 기반)
   *
   * - 요청:
   *   - Querystring: PostQuerySchema를 통해 검색 조건 검증
   *
   * - 응답:
   *   - 게시글 상세 정보(PostResponseSchema) 반환
   */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Post'],
        querystring: PostQuerySchema,
        response: { 200: SuccessResponseSchema(PostResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await postController.getPost(request.query);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * POST /api/posts/list
   * 게시글 목록 조회 및 페이징 처리
   *
   * - 요청:
   *   - body: 페이지 번호, 페이지 크기, 검색 조건 검증
   *
   * - 응답:
   *   - 게시글 목록 + Pagination 정보(PostListResponseSchema)
   */
  fastify.post(
    '/list',
    {
      schema: {
        tags: ['Post'],
        body: PostListQuerySchema,
        response: { 200: SuccessResponseSchema(PostListResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await postController.listPosts(request.body);
      return reply.code(200).send(success(result));
    },
  );
};
