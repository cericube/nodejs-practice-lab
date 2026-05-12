// /src/modules/postlike/postlike.dto.ts

import { Type, type Static } from '@sinclair/typebox';

// 좋아요 등록/취소 요청
export const PostLikeParamsSchema = Type.Object(
  {
    postId: Type.Integer(),
    userId: Type.Integer(),
  },
  { $id: 'PostLikeRequest', additionalProperties: false },
);

export type PostLikeParamsDto = Static<typeof PostLikeParamsSchema>;

// 좋아요 선택/취소 응답.
export const PostLikeResponseSchema = Type.Object(
  {
    postId: Type.Integer(),
  },
  { $id: 'PostLikeResponse', additionalProperties: false },
);
export type PostLikeResponseDto = Static<typeof PostLikeResponseSchema>;

// 좋아요 등록한 사용자 조회용 글 ID 파라미터
export const PostLikeIdParamsSchema = Type.Object(
  {
    id: Type.Integer(),
  },
  { $id: 'PostLikeIdParamsSchema', additionalProperties: false },
);

export type PostLikeIdParamsDto = Static<typeof PostLikeIdParamsSchema>;

/**
 * 커서 (페이지네이션용)
 */
export const CursorSchema = Type.Object(
  {
    createdAt: Type.String({ format: 'date-time' }),
    value: Type.Integer(),
  },
  { $id: 'PostLikeCursor', additionalProperties: false },
);

export const PostLikeQuerySchema = Type.Object(
  {
    sort: Type.Optional(Type.Union([Type.Literal('latest'), Type.Literal('oldest')])),
    createdAt: Type.Optional(Type.String({ format: 'date-time' })), // 커서로 사용할 createdAt
    value: Type.Optional(Type.Integer()), // 커서로 사용할 postId 또는 userId
    take: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { $id: 'PostLikeQuery', additionalProperties: false },
);

export type PostLikeQueryDto = Static<typeof PostLikeQuerySchema>;

// 특정 게시글에 좋아요를 누른 사용자 목록 조회 결과
export const PostLikeUserListResponseSchema = Type.Object(
  {
    users: Type.Array(
      Type.Object({
        user: Type.Object({
          id: Type.Integer(),
          displayName: Type.Union([Type.String(), Type.Null()]),
        }),
        createdAt: Type.String({ format: 'date-time' }),
      }),
    ),
    hasNextPage: Type.Boolean(),
    nextCursor: Type.Optional(CursorSchema), // userId와 createdAt을 커서로 사용
  },
  { $id: 'PostLikeUserListResponse', additionalProperties: false },
);

export type PostLikeUserListResponseDto = Static<typeof PostLikeUserListResponseSchema>;

// 사용자가 좋아요 선택한 글 목록 조회 결과
export const PostLikePostListResponseSchema = Type.Object(
  {
    posts: Type.Array(
      Type.Object({
        post: Type.Object({
          id: Type.Integer(),
          title: Type.String(),
          published: Type.Boolean(),
        }),
        createdAt: Type.String({ format: 'date-time' }), // 좋아요 누른 시점(createdAt)
      }),
    ),
    hasNextPage: Type.Boolean(),
    nextCursor: Type.Optional(CursorSchema), // postId와 createdAt을 커서로 사용
  },
  { $id: 'PostLikePostListResponse', additionalProperties: false },
);
export type PostLikePostListResponseDto = Static<typeof PostLikePostListResponseSchema>;
