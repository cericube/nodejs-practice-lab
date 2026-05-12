// /src/modules/reply/reply.dto.ts

import { Type, type Static } from '@sinclair/typebox';

/**
 * 댓글 생성 요청
 */
export const ReplyCreateBodySchema = Type.Object(
  {
    postId: Type.Integer(),
    authorId: Type.Integer(),
    content: Type.String(),
  },
  // $id: J$id는 JSON Schema의 고유 식별자로,
  //      AJV에서 스키마를 캐싱하고 $ref로 재사용할 수 있게 해준다.
  // additionalProperties : 정의된 3개 필드 외에 허용 않함
  {
    $id: 'ReplyCreateRequest', // AJV 스키마 식별자
    additionalProperties: false, // 정의된 필드만 허용
  },
);
export type ReplyCreateBodyDto = Static<typeof ReplyCreateBodySchema>;

/**
 * 댓글 수정 요청
 */
export const ReplyUpdateBodySchema = Type.Object(
  {
    // 일반 사용자 → 자기 댓글만 수정
    // id: Type.Integer(), // 댓글 ID
    authorId: Type.Integer(), // 댓글 작성자
    content: Type.String(), // 수정 내용
  },
  { $id: 'ReplyUpdateRequest', additionalProperties: false },
);

export type ReplyUpdateBodyDto = Static<typeof ReplyUpdateBodySchema>;

/**
 * 댓글 삭제 요청
 */
export const ReplyDeleteQuerySchema = Type.Object(
  {
    // 일반 사용자 → 자기 댓글만 수정
    // 관리자 → 사용자 지정 삭제
    //id: Type.Integer(),
    authorId: Type.Optional(Type.Integer()),
  },
  { $id: 'ReplyDeleteRequest', additionalProperties: false },
);
export type ReplyDeleteQueryDto = Static<typeof ReplyDeleteQuerySchema>;

/**
 * URL 파라미터 (/reply/:id)
 */
export const ReplyIdParamsSchema = Type.Object(
  {
    id: Type.Integer(),
  },
  { $id: 'ReplyIdParams', additionalProperties: false },
);
export type ReplyIdParamsDto = Static<typeof ReplyIdParamsSchema>;

/**
 * 커서 (페이지네이션용)
 */
export const CursorSchema = Type.Object(
  {
    id: Type.Integer(),
  },
  { $id: 'ReplyCursor', additionalProperties: false },
);

/**
 * 댓글 목록 조회 Query
 */
export const ReplyListQuerySchema = Type.Object(
  {
    authorId: Type.Optional(Type.Integer({ minimum: 1 })), // 작성자 필터
    keyword: Type.Optional(Type.String({ minLength: 1 })), // 검색어

    // --- 정렬 정책 ---
    sort: Type.Optional(
      Type.Union([
        Type.Literal('latest'), // 최신순 (id DESC)
        Type.Literal('oldest'), // 과거순 (id ASC)a
      ]),
    ),

    cursor: Type.Optional(CursorSchema), // 다음 페이지 기준
    /** 페이지당 노출 개수 (기본값 설정 권장) */
    take: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { $id: 'ReplyListQuery', additionalProperties: false },
);

export type ReplyListQueryDto = Static<typeof ReplyListQuerySchema>;

/**
 * 댓글 입력/수정/삭제 응답
 */
export const ReplyUpdateResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    authorId: Type.Integer(),
    postId: Type.Integer(),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'ReplyUpdateResponse', additionalProperties: false },
);
export type ReplyUpdateResponseDto = Static<typeof ReplyUpdateResponseSchema>;

/**
 * 작성자 정보
 */
export const ReplyAuthorSchema = Type.Object(
  {
    id: Type.Integer(),
    displayName: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: 'ReplyAuthor', additionalProperties: false },
);

/**
 * 댓글 리스트 아이템
 */
export const ReplyListItemSchema = Type.Object({
  id: Type.Integer(),
  postId: Type.Integer(),
  content: Type.String(),
  author: ReplyAuthorSchema,
  createdAt: Type.String({ format: 'date-time' }),
});
export type ReplyListItemDto = Static<typeof ReplyListItemSchema>;
/**
 * 댓글 목록 응답
 */
export const ReplyListResponseSchema = Type.Object(
  {
    replies: Type.Array(ReplyListItemSchema), // 댓글 목록
    hasNextPage: Type.Boolean(), // 다음 페이지 존재 여부
    nextCursor: Type.Optional(CursorSchema), // 다음 요청용 커서
  },
  { $id: 'ReplyListResponse', additionalProperties: false },
);
export type ReplyListResponseDto = Static<typeof ReplyListResponseSchema>;
