// src/module/reply/reply.route.ts

import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { ReplyController } from './reply.controller';
import { ReplyService } from './reply.service';
import { ReplyRepository } from './reply.repository';

import { success, SuccessResponseSchema } from '../../common/response/response.success';

import {
  ReplyCreateBodySchema,
  ReplyDeleteQuerySchema,
  ReplyIdParamsSchema,
  ReplyListQuerySchema,
  ReplyListResponseSchema,
  ReplyUpdateBodySchema,
  ReplyUpdateResponseSchema,
} from './reply.dto';
import { PostRepository } from '../post/post.repository';

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
 * Prefix 예시: /api/replies
 */

// FastifyPluginAsyncTypebox 타입을 만족하는 비동기 Plugin 함수
export const replyRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const prisma = fastify.prisma;
  const repository = new ReplyRepository(prisma);
  const service = new ReplyService(repository);
  const controller = new ReplyController(service);

  /**
   * POST /api/replies
   * 댓글 생성
   *
   * - 요청:
   *   - Body: 댓글 생성에 필요한 필드 검증 (ReplyCreateBodySchema)
   *
   * - 응답:
   *   - 생성된 댓글 정보 반환 (ReplyUpdateResponseSchema)
   */
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Reply'],
        body: ReplyCreateBodySchema,
        response: { 200: SuccessResponseSchema(ReplyUpdateResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await controller.createReply(request.body);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * PATCH /api/replies/:id
   * 댓글 수정
   *
   * - 요청:
   *   - Params: 댓글 식별자(id) 검증
   *   - Body: 수정 가능한 필드 검증 (ReplyUpdateBodySchema)
   *
   * - 응답:
   *   - 수정 완료된 댓글 정보 반환 (ReplyUpdateResponseSchema)
   */
  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['Reply'],
        params: ReplyIdParamsSchema,
        body: ReplyUpdateBodySchema,
        response: { 200: SuccessResponseSchema(ReplyUpdateResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await controller.updateReply(request.params, request.body);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * DELETE /api/replies/:id
   * 댓글 삭제
   *
   * - 요청:
   *   - Params: 삭제 대상 댓글 ID 검증
   *   - Querystring: 삭제 옵션 검증 (ReplyDeleteQuerySchema)
   *
   * - 응답:
   *   - 삭제 처리 결과 반환 (ReplyUpdateResponseSchema)
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Reply'],
        params: ReplyIdParamsSchema,
        querystring: ReplyDeleteQuerySchema,
        response: { 200: SuccessResponseSchema(ReplyUpdateResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await controller.deleteReply(request.params, request.query);
      return reply.code(200).send(success(result));
    },
  );

  /**
   * POST /api/replies/list
   * 댓글 목록 조회 (페이징 및 조건 검색)
   *
   *  - 요청:
   *   - Body: 페이지 정보 및 검색 조건 검증 (ReplyListQuerySchema)
   *
   * - 응답:
   *   - 댓글 목록 + Pagination 정보 반환 (ReplyListResponseSchema)
   */
  fastify.post(
    '/list',
    {
      schema: {
        tags: ['Reply'],
        body: ReplyListQuerySchema,
        response: { 200: SuccessResponseSchema(ReplyListResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await controller.listReplies(request.body);
      return reply.code(200).send(success(result));
    },
  );
};
