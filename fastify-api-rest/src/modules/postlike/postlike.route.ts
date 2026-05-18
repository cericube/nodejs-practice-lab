// src/module/postlike/postlike.route.ts

import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { PostLikeController } from './postlike.controller';
import { PostLikeService } from './postlike.service';
import { PostLikeRepository } from './postlike.repository';

import { success, SuccessResponseSchema } from '../../common/response/response.success';
import {
  PostLikeIdParamsSchema,
  PostLikeParamsSchema,
  PostLikePostListResponseSchema,
  PostLikeQuerySchema,
  PostLikeResponseSchema,
  PostLikeUserListResponseSchema,
} from './postlike.dto';

/**
 * [Route Layer: 인터페이스 및 검증 계층]
 *
 * 1. Request Validation
 *   - Params / Querystring을 TypeBox Schema로 검증합니다.
 *   - 유효하지 않은 요청은 Fastify가 자동으로 400 에러로 처리합니다.
 *
 * 2. Response Serialization
 *   - 정의된 Response Schema를 기반으로 응답 데이터를 필터링합니다.
 *   - 내부 데이터 구조 노출 및 불필요한 필드를 방지합니다.
 *
 * 3. Controller 연결
 *   - Route는 HTTP 요청을 Controller로 전달하는 역할만 수행합니다.
 *   - 실제 비즈니스 로직은 Controller → Service → Repository 계층에서 처리됩니다.
 *
 * Prefix 예시: /api/post-likes
 */

// FastifyPluginAsyncTypebox 타입을 만족하는 비동기 Plugin 함수
export const postLikeRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const prisma = fastify.prisma;
  const repository = new PostLikeRepository(prisma);
  // Service와 Controller 인스턴스를 생성합니다.
  const service = new PostLikeService(repository);
  const controller = new PostLikeController(service);

  /**
   * POST /api/postlikes/:postId/:userId
   * 좋아요 등록
   *
   * - 요청:
   *   - Params:
   *     - postId: 대상 게시글 ID
   *     - userId: 좋아요를 누르는 사용자 ID
   *
   * - 응답:
   *   - 좋아요 등록 결과 반환 (PostLikeResponseSchema)
   */
  fastify.post(
    '/:postId/:userId',
    {
      schema: {
        tags: ['PostLike'],
        params: PostLikeParamsSchema,
        response: {
          200: SuccessResponseSchema(PostLikeResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const result = await controller.likePost(request.params);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * DELETE /api/postlikes/:postId/:userId
   * 좋아요 취소
   *
   * - 요청:
   *   - Params:
   *     - postId: 대상 게시글 ID
   *     - userId: 좋아요를 취소하는 사용자 ID
   *
   * - 응답:
   *   - 좋아요 취소 결과 반환 (PostLikeResponseSchema)
   */
  fastify.delete(
    '/:postId/:userId',
    {
      schema: {
        tags: ['PostLike'],
        params: PostLikeParamsSchema,
        response: {
          200: SuccessResponseSchema(PostLikeResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const result = await controller.unlikePost(request.params);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * GET /api/postlikes/:id/posts
   * 내가 좋아요한 게시글 목록 조회
   *
   * - 요청:
   *   - Params:
   *     - id: 사용자 ID
   *   - Querystring:
   *     - 페이지네이션 및 조회 옵션 (PostLikeQuerySchema)
   *
   * - 응답:
   *   - 좋아요한 게시글 목록 + 페이징 정보 반환 (PostLikePostListResponseSchema)
   */
  fastify.get(
    '/:id/posts',
    {
      schema: {
        tags: ['PostLike'],
        params: PostLikeIdParamsSchema,
        querystring: PostLikeQuerySchema,
        response: {
          200: SuccessResponseSchema(PostLikePostListResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const result = await controller.getLikedPostsByUser(request.params, request.query);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * GET /api/postlikes/:id/users
   * 특정 게시글에 좋아요를 누른 사용자 목록 조회
   *
   * - 요청:
   *   - Params:
   *     - id: 게시글 ID
   *   - Querystring:
   *     - 페이지네이션 및 조회 옵션 (PostLikeQuerySchema)
   *
   * - 응답:
   *   - 좋아요를 누른 사용자 목록 + 페이징 정보 반환 (PostLikeUserListResponseSchema)
   */
  fastify.get(
    '/:id/users',
    {
      schema: {
        tags: ['PostLike'],
        params: PostLikeIdParamsSchema,
        querystring: PostLikeQuerySchema,
        response: {
          200: SuccessResponseSchema(PostLikeUserListResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const result = await controller.getUsersWhoLikedPost(request.params, request.query);
      return reply.code(200).send(success(result));
    },
  );
};
