// src/module/postfile/postfile.dto.ts

import { Type, type Static } from '@sinclair/typebox';

// 파일 등록 요청
export const PostFileBaseParamsSchema = Type.Object(
  {
    userId: Type.Integer(),
    postId: Type.Optional(Type.Integer()),
  },
  { $id: 'PostFileBaseParams', additionalProperties: false },
);
export type PostFileBaseParamsDto = Static<typeof PostFileBaseParamsSchema>;

// 게시글 파일 등록 요청 DTO
export const PostFilesBodySchema = Type.Object(
  {
    fileIds: Type.Array(Type.Integer()),
  },
  { $id: 'PostFilesBody', additionalProperties: false },
);

export type PostFilesBodyDto = Static<typeof PostFilesBodySchema>;

/////////////////////////
// TODO 아래 코드 수정해 야 함.

export const PostFileDownloadMetaSchema = Type.Object(
  {
    fileName: Type.String(),
    contentType: Type.String(),
    fileSize: Type.String(), // bigint → string,
  },
  { $id: 'PostFileDownloadMeta', additionalProperties: false },
);

export type PostFileDownloadMetaDto = Static<typeof PostFileDownloadMetaSchema>;

//  파일 조회 응답 DTO
export const PostFileResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    postId: Type.Integer(),
    fileKey: Type.String(),
    fileName: Type.String(),
    contentType: Type.String(),
    // bigint → number 변환은 정밀도 손실 위험이 있어서 문자열로 내려주는 게 안전한 설계입니다.
    fileSize: Type.String(), // bigint → string
    downloadCount: Type.Integer(),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'PostFileResponse', additionalProperties: false },
);

export type PostFileResponseDto = Static<typeof PostFileResponseSchema>;

export const PostFileListResponseSchema = Type.Object(
  {
    files: Type.Array(PostFileResponseSchema),
  },
  { $id: 'PostFileListResponse', additionalProperties: false },
);

export type PostFileListResponseDto = Static<typeof PostFileListResponseSchema>;
