// src/module/postfile/postfile.route.ts

import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { PostFileController } from './postfile.controller';
import { PostFileService } from './postfile.service';
import { PostFileRepository } from './postfile.repository';

import { success, SuccessResponseSchema } from '../../common/response/response.success';
import { env } from '../../config/env';
import {
  PostFileIdParamsSchema,
  PostFileListResponseSchema,
  PostFilePostIdParamsSchema,
  PostFileResponseSchema,
} from './postfile.dto';
import type { MultipartFile } from '@fastify/multipart';

export const postFileRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const prisma = fastify.prisma;
  const repository = new PostFileRepository(prisma, env.UPLOAD_MAX_FILES);
  const service = new PostFileService(repository);
  const controller = new PostFileController(service);

  fastify.post(
    '/:id',
    {
      schema: {
        tags: ['PostFile'],
        params: PostFilePostIdParamsSchema,
        response: { 200: SuccessResponseSchema(PostFileListResponseSchema) },
      },
    },
    async (request, reply) => {
      const files = await request.files();
      const results = [];
      for await (const file of files) {
        const rs = await controller.uploadFile(file, request.params);
        results.push(rs);
      }
      //if (!file) {
      //  throw new Error('파일이 존재하지 않습니다.');
      // }
      // const result = await controller.uploadFile(file, request.params);
      return reply.code(200).send(
        success({
          files: results,
        }),
      );
    },
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['PostFile'],
        params: PostFileIdParamsSchema,
        response: {
          200:
            // 다운로드는 stream + header 기반이라 schema 최소화
            {
              type: 'stream',
              format: 'binary',
            },
        },
      },
    },
    //
    async (request, reply) => {
      const { stream, meta } = await controller.downloadFile(request.params);
      // 헤더 설정 (파일 다운로드)
      reply.header('Content-Type', meta.contentType);
      reply.header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
      );
      reply.header('Content-Length', meta.fileSize);

      return reply.send(stream);
    },
    //
  );

  //
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['PostFile'],
        params: PostFileIdParamsSchema,
        response: { 200: SuccessResponseSchema(PostFileResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await controller.deleteFile(request.params);
      return reply.code(200).send(success(result));
    },
  );

  //
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['PostFile'],
        params: PostFilePostIdParamsSchema,
        response: { 200: SuccessResponseSchema(PostFileListResponseSchema) },
      },
    },
    async (request, reply) => {
      const result = await controller.getFileListByPostId(request.params);
      return reply.code(200).send(success(result));
    },
  );
};
