// src/modules/postviewstat/postviewstat.route.ts

import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { PostViewStatController } from './postviewstat.controller';
import { PostViewStatService } from './postviewstat.service';
import { PostViewStatRepository } from './postviewstat.repository';
import { success, SuccessResponseSchema } from '../../common/response/response.success';

import {
  PostViewStatBucketCountResponseSchema,
  PostViewStatBucketSumResponseSchema,
  PostViewStatPeriodQuerySchema,
  PostViewStatTopViewedQuerySchema,
  PostViewStatTopViewedResponseSchema,
} from './postviewstat.dto';

// 이 파일은 게시글 조회 통계(PostViewStat)와 관련된 Fastify 라우트를 정의합니다.
// 각 라우트는 컨트롤러 메서드를 호출하고 결과를 표준 성공 응답 형식으로 반환합니다.
export const postViewStatRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // Fastify 인스턴스에서 Prisma 클라이언트를 가져옵니다.
  const prisma = fastify.prisma;

  // 레포지토리 -> 서비스 -> 컨트롤러 계층을 초기화합니다.
  // 이 구조는 비즈니스 로직과 데이터 액세스를 분리하는 데 도움을 줍니다.
  const repository = new PostViewStatRepository(prisma);
  const service = new PostViewStatService(repository);
  const controller = new PostViewStatController(service);

  // 1) /count/sum 엔드포인트
  // 기간 기준으로 조회 수 합계를 버킷 단위로 계산합니다.
  fastify.get(
    '/count/sum',
    {
      schema: {
        tags: ['PostViewStat'],
        querystring: PostViewStatPeriodQuerySchema,
        response: { 200: SuccessResponseSchema(PostViewStatBucketSumResponseSchema) },
      },
    },

    async (request, reply) => {
      const query = request.query;
      // 컨트롤러에 쿼리 파라미터를 전달하여 기간별 조회수 합계 데이터를 가져옵니다.
      const result = await controller.getPostViewCountSumByBucketPeriod(query);
      reply.send(success(result));
    },
  );

  // 2) /count/list 엔드포인트
  // 기간 기준으로 조회 수를 버킷 단위로 나열합니다.
  fastify.get(
    '/count/list',
    {
      schema: {
        tags: ['PostViewStat'],
        querystring: PostViewStatPeriodQuerySchema,
        response: { 200: SuccessResponseSchema(PostViewStatBucketCountResponseSchema) },
      },
    },

    async (request, reply) => {
      const query = request.query;
      // 컨트롤러에 쿼리 파라미터를 전달하여 기간별 조회수 목록 데이터를 가져옵니다.
      const result = await controller.getPostViewCountListByBucketPeriod(query);
      reply.send(success(result));
    },
  );

  // 3) /top-viewed 엔드포인트
  // 주어진 범위 또는 버킷 기준으로 가장 많이 본 게시글 목록을 반환합니다.
  fastify.get(
    '/top-viewed',
    {
      schema: {
        tags: ['PostViewStat'],
        querystring: PostViewStatTopViewedQuerySchema,
        response: { 200: SuccessResponseSchema(PostViewStatTopViewedResponseSchema) },
      },
    },

    async (request, reply) => {
      const query = request.query;
      // 컨트롤러에 쿼리 파라미터를 전달하여 상위 조회 게시글 데이터를 가져옵니다.
      const result = await controller.getTopViewPostListByBucket(query);
      reply.send(success(result));
    },
  );
};
