import { Type, type Static } from '@sinclair/typebox';
import { BucketType } from './postviewstat.repository';

// 게시글 조회수 합계 조회 쿼리
export const PostViewStatPeriodQuerySchema = Type.Object(
  {
    postId: Type.Integer(),
    bucketType: Type.Enum(BucketType),
    startAt: Type.String({ format: 'date-time' }),
    endAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'PostViewStatPeriodQuery', additionalProperties: false },
);
export type PostViewStatPeriodQueryDto = Static<typeof PostViewStatPeriodQuerySchema>;

export const PostViewStatBucketSumResponseSchema = Type.Object(
  {
    count: Type.Integer({ minimum: 0 }),
  },
  { $id: 'PostViewStatBucketSumResponse', additionalProperties: false },
);
export type PostViewStatBucketSumResponseDto = Static<typeof PostViewStatBucketSumResponseSchema>;

export const PostViewStatBucketCountResponseSchema = Type.Array(
  Type.Object({
    bucketAt: Type.String({ format: 'date-time' }),
    viewCount: Type.Integer(),
  }),
  { $id: 'PostViewStatBucketCountResponse', additionalProperties: false },
);
export type PostViewStatBucketCountResponseDto = Static<
  typeof PostViewStatBucketCountResponseSchema
>;

export const PostViewStatTopViewedQuerySchema = Type.Object(
  {
    bucketType: Type.Enum(BucketType),
    bucketAt: Type.String({ format: 'date-time' }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { $id: 'PostViewStatTopViewedQuery', additionalProperties: false },
);
export type PostViewStatTopViewedQueryDto = Static<typeof PostViewStatTopViewedQuerySchema>;

export const PostViewStatTopViewedResponseSchema = Type.Array(
  Type.Object({
    postId: Type.Integer(),
    viewCount: Type.Integer(),
  }),
  { $id: 'PostViewStatTopViewedResponse', additionalProperties: false },
);
export type PostViewStatTopViewedResponseDto = Static<typeof PostViewStatTopViewedResponseSchema>;
