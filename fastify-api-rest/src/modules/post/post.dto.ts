// /src/modules/post/post.dto.ts
import { Type, type Static } from '@sinclair/typebox';

/**
 * 쿼리 스트링(URL)은 모든 데이터가 기본적으로 'String'입니다.
 * Boolean 타입 캐스팅 에러 방지 및 '0/1' 등의 모호한 입력을 차단하기 위해 명시적 리터럴을 사용합니다.
 */
// const booleanSchema = Type.Union([Type.Literal('true'), Type.Literal('false')]);

/**
 * [POST /posts]
 * 게시글 생성을 위한 요청 바디
 *
 * - 게시글의 기본 정보(title, content 등)를 포함합니다.
 * - authorId는 게시글 소유권을 식별하기 위한 필드입니다.
 * - 실제 authorId 유효성 검증은 서비스 레이어에서 수행합니다.
 */
export const PostCreateBodySchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 255 }),
    content: Type.Optional(Type.String()),
    published: Type.Optional(Type.Boolean()),
    /** 게시글 소유권 할당을 위한 식별자 */
    authorId: Type.Integer(),
  },
  { $id: 'PostCreateRequest', additionalProperties: false },
);
export type PostCreateBodyDto = Static<typeof PostCreateBodySchema>;

/**
 * [DELETE /posts/:id]
 * [PATCH /posts/:id]
 *
 * 특정 게시글을 식별하기 위한 Path Parameter입니다.
 * 작성자 검증용 authorId는 수정 Body 또는 삭제 Query에서 별도로 받습니다.
 */
export const PostIdParamsSchema = Type.Object(
  {
    /** 대상 게시글의 고유 식별자 */
    id: Type.Integer(),
  },
  { $id: 'PostIdParams', additionalProperties: false },
);
export type PostIdParamsDto = Static<typeof PostIdParamsSchema>;

/**
 * [PATCH /posts/:id]
 * 게시글 수정 요청 바디
 *
 * - Partial 타입을 사용하여 변경이 필요한 필드만 전달합니다.
 * - 전달되지 않은 필드는 기존 값을 유지합니다.
 */
export const PostUpdateBodySchema = Type.Partial(
  Type.Object({
    authorId: Type.Optional(Type.Integer()),
    title: Type.String({ minLength: 1, maxLength: 255 }),
    content: Type.String(),
    published: Type.Optional(Type.Boolean()),
  }),
  { $id: 'PostUpdateRequest', additionalProperties: false },
);
export type PostUpdateBodyDto = Static<typeof PostUpdateBodySchema>;

export const PostDeleteQuerySchema = Type.Object(
  {
    /** 삭제 요청 시 실제 소유주인지 대조하기 위한 작성자 ID */
    authorId: Type.Optional(Type.Integer()),
  },
  { $id: 'PostDeleteQuery', additionalProperties: false },
);
export type PostDeleteQueryDto = Static<typeof PostDeleteQuerySchema>;

/**
 * [GET /posts?id]
 * 게시글 단건 조회 Query
 *
 * includeDraft 옵션
 * - true  : draft 게시글 포함 조회
 * - false : 공개된 게시글만 조회
 *
 * 일반 사용자 요청에서는 보통 draft 조회가 제한되며
 * 관리자 또는 작성자 권한에서만 사용됩니다.
 */
export const PostQuerySchema = Type.Object({
  id: Type.Integer(),
  includeDraft: Type.Optional(Type.Boolean()),
});
export type PostQueryDto = Static<typeof PostQuerySchema>;

/**
 * Keyset 기반 페이지네이션 커서
 *
 * - id + 정렬 기준값(value)을 조합하여 커서를 생성합니다.
 * - offset pagination에서 발생하는
 *   데이터 누락 및 중복 노출 문제를 방지합니다.
 */
export const CursorSchema = Type.Object(
  {
    /** 페이지네이션의 기준이 되는 고유 ID */
    id: Type.Integer(),
    /**
     * 정렬 기준값 (조회수순일 땐 viewCount, 좋아요순일 땐 likeCount 등)
     * 첫 페이지 요청 시에는 존재하지 않으므로 Optional
     */
    value: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { $id: 'PostCursor', additionalProperties: false },
);

/**
 * [GET /posts]
 * 게시글 목록 조회 Query
 *
 * 기능
 * - 다양한 검색 및 필터링 조건 제공
 * - 정렬 정책 선택 가능
 * - Keyset 기반 페이지네이션 지원
 */
export const PostListQuerySchema = Type.Object(
  {
    // --- 필터 조건 ---
    authorId: Type.Optional(Type.Integer({ minimum: 1 })),
    /** 게시글 상태 필터 (공개/임시저장) */
    status: Type.Optional(Type.Union([Type.Literal('published'), Type.Literal('draft')])),

    // --- 검색 조건 ---
    keyword: Type.Optional(Type.String({ minLength: 1 })),
    /** true: 제목 검색 / false: 제목+본문 통합 검색 */
    titleOnly: Type.Optional(Type.Boolean()),

    // --- 수치/범위 필터 ---
    minViewCount: Type.Optional(Type.Integer({ minimum: 0 })),
    maxViewCount: Type.Optional(Type.Integer({ minimum: 0 })),
    minLikeCount: Type.Optional(Type.Integer({ minimum: 0 })),
    maxLikeCount: Type.Optional(Type.Integer({ minimum: 0 })),
    minReplyCount: Type.Optional(Type.Integer({ minimum: 0 })),
    maxReplyCount: Type.Optional(Type.Integer({ minimum: 0 })),

    // --- 날짜 범위 필터 ---
    createdFrom: Type.Optional(Type.String({ format: 'date-time' })),
    createdTo: Type.Optional(Type.String({ format: 'date-time' })),
    publishedFrom: Type.Optional(Type.String({ format: 'date-time' })),
    publishedTo: Type.Optional(Type.String({ format: 'date-time' })),

    // --- 정렬 정책 ---
    sort: Type.Optional(
      Type.Union([
        Type.Literal('latest'), // 최신순 (id DESC)
        Type.Literal('oldest'), // 과거순 (id ASC)
        Type.Literal('mostViewed'), // 조회수순 (viewCount DESC)
        Type.Literal('mostLiked'), // 좋아요순 (likeCount DESC)
        Type.Literal('mostReplied'), // 댓글순 (replyCount DESC)
      ]),
    ),

    // --- 페이지네이션 ---
    cursor: Type.Optional(CursorSchema),
    /** 페이지당 노출 개수 (기본값 설정 권장) */
    take: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { $id: 'PostListQuery', additionalProperties: false },
);
export type PostListQueryDto = Static<typeof PostListQuerySchema>;

/**
 * 게시글 작성자 요약 정보
 * (User + Profile 조인 결과)
 */
export const PostAuthorSchema = Type.Object(
  {
    id: Type.Integer(),
    name: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: 'PostAuthor', additionalProperties: false },
);

/**
 * 게시글 수정 응답 DTO
 *
 * 수정 이후 최소한의 상태 정보만 반환합니다.
 */
export const PostUpdateResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    authorId: Type.Integer(),
    published: Type.Optional(Type.Boolean()),
    publishedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'PostUpdateResponse', additionalProperties: false },
);
export type PostUpdateResponseDto = Static<typeof PostUpdateResponseSchema>;

/**
 * 게시글 상세 조회 응답 DTO
 */
export const PostResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    title: Type.String(),
    content: Type.Union([Type.String(), Type.Null()]),
    published: Type.Boolean(),
    author: PostAuthorSchema,
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
    publishedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    viewCount: Type.Integer(),
    likeCount: Type.Integer(),
    replyCount: Type.Integer(),
  },
  { $id: 'PostResponse', additionalProperties: false },
);
export type PostResponseDto = Static<typeof PostResponseSchema>;

/**
 * 목록 조회 결과용 경량 DTO
 *
 * - content 등 무거운 필드는 제외
 * - 리스트 페이지 최적화 목적
 */
export const PostListItemSchema = Type.Pick(PostResponseSchema, [
  'id',
  'title',
  'published',
  'author',
  'createdAt',
  'viewCount',
  'likeCount',
  'replyCount',
]);
export type PostListItemDto = Static<typeof PostListItemSchema>;

/**
 * 게시글 목록 조회 응답
 */
export const PostListResponseSchema = Type.Object(
  {
    posts: Type.Array(PostListItemSchema),
    /** 추가 데이터 존재 여부 */
    hasNextPage: Type.Boolean(),
    /** 다음 요청 시 사용할 커서 (hasNextPage가 false이면 undefined) */
    nextCursor: Type.Optional(CursorSchema),
  },
  { $id: 'PostListResponse', additionalProperties: false },
);
export type PostListResponseDto = Static<typeof PostListResponseSchema>;
