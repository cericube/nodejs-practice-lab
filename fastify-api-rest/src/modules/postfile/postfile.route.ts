// src/modules/postfile/postfile.route.ts

import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { PostFileController } from './postfile.controller';
import { PostFileService } from './postfile.service';
import { PostFileRepository } from './postfile.repository';

import { Type } from '@sinclair/typebox';
import { success, SuccessResponseSchema } from '../../common/response/response.success';
import { env } from '../../config/env';
import {
  PostFileBaseParamsSchema,
  PostFileListResponseSchema,
  PostFilesBodySchema,
  PostFileUserIdSchema,
  PostFileAttachParamsSchema,
  PostFilePostIdSchema,
} from './postfile.dto';
import { PostRepository } from '../post/post.repository';

const PostFileDownloadParamsSchema = Type.Object(
  {
    id: Type.Integer(),
  },
  { $id: 'PostFileDownloadParams', additionalProperties: false },
);

const PostFileDownloadQuerySchema = Type.Object(
  {
    fileKey: Type.String(),
  },
  { $id: 'PostFileDownloadQuery', additionalProperties: false },
);

export const postFileRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // Fastify 인스턴스에서 Prisma 클라이언트 가져오기
  const prisma = fastify.prisma;
  // 업로드 파일 저장소 생성 (최대 파일 개수 제한 포함)
  const fileRepository = new PostFileRepository(prisma, env.UPLOAD_MAX_FILES);
  // 게시글 정보를 조회하기 위한 저장소 생성
  const postRepository = new PostRepository(prisma);
  // 서비스 계층에 저장소 주입
  const service = new PostFileService(fileRepository, postRepository);
  // 컨트롤러 생성
  const controller = new PostFileController(service);

  // 사용자 ID와 파일을 받아서 저장하는 API
  fastify.post(
    '/:userId',
    {
      schema: {
        tags: ['PostFile'],
        params: PostFileUserIdSchema,
        response: { 200: SuccessResponseSchema(Type.Array(PostFileBaseParamsSchema)) },
      },
    },
    async (request, reply) => {
      // multipart 파일 스트림을 순회하며 업로드 처리
      const files = request.files();
      const uploadedFiles = [];
      for await (const file of files) {
        const uploaded = await controller.uploadFile(file, request.params);
        uploadedFiles.push(uploaded);
      }
      // 업로드된 파일 정보 목록을 성공 응답으로 반환
      return reply.code(200).send(success(uploadedFiles));
    },
  );

  fastify.patch(
    '/attach/:userId/:postId',
    {
      schema: {
        tags: ['PostFile'],
        params: PostFileAttachParamsSchema,
        body: PostFilesBodySchema, // { "fileIds": [101, 102, 103] }
        response: { 200: SuccessResponseSchema(Type.Object({ count: Type.Integer() })) },
      },
    },
    async (request, reply) => {
      // const { userId, postId } = request.params;
      const result = await controller.attachFiles(request.params, request.body);
      return reply.code(200).send(success(result));
    },
  );

  fastify.get(
    '/download/:id',
    {
      schema: {
        tags: ['PostFile'],
        params: PostFileDownloadParamsSchema,
        querystring: PostFileDownloadQuerySchema,
        response: {
          // 다운로드는 stream + header 기반이라 Fastify 직렬화 스키마는 최소화합니다.
          200: Type.Any(),
        },
      },
    },
    async (request, reply) => {
      const { stream, meta } = await controller.downloadFile({
        ...request.params,
        ...request.query,
      });
      // 헤더 설정 (파일 다운로드)
      reply.header('Content-Type', meta.contentType);
      reply.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
      );
      reply.header('Content-Length', meta.fileSize);

      return reply.send(stream);
    },
  );

  // 파일 삭제 예시 라우트
  fastify.delete(
    '/:userId',
    {
      schema: {
        tags: ['PostFile'],
        params: PostFileUserIdSchema, // { userId: number }
        querystring: PostFileBaseParamsSchema,
        response: { 200: SuccessResponseSchema(PostFileBaseParamsSchema) },
      },
    },
    async (request, reply) => {
      const result = await controller.deleteFile(request.params, request.query);
      return reply.code(200).send(success(result));
    },
  );

  // 게시글에 첨부된 파일 목록 조회 라우트
  fastify.get(
    '/list/:postId',
    {
      schema: {
        tags: ['PostFile'],
        params: PostFilePostIdSchema, // { postId: number }
        response: { 200: SuccessResponseSchema(PostFileListResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await controller.getFileList(request.params);
      return reply.code(200).send(success(result));
    },
  );
};
