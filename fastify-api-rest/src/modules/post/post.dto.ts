// /src/modules/post/post.dto.ts
import { Type, type Static } from '@sinclair/typebox';

/**
 * 쿼리 스트링(URL)은 모든 데이터가 기본적으로 'String'입니다.
 * Boolean 타입 캐스팅 에러 방지 및 '0/1' 등의 모호한 입력을 차단하기 위해 명시적 리터럴을 사용합니다.
 */
const booleanSchema = Type.Union([Type.Literal('true'), Type.Literal('false')]);

/**
 * [POST /posts] 게시글 생성을 위한 요청 바디
 * 물리적 삭제 환경에서는 유효한 authorId의 존재 여부를 서비스 레이어에서 반드시 체크해야 합니다.
 */
export const PostCreateBodySchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 255 }),
    content: Type.Optional(Type.String()),
    published: Type.Optional(booleanSchema),
    /** 게시글 소유권 할당을 위한 식별자 */
    authorId: Type.Integer(),
  },
  { $id: 'PostCreateRequest', additionalProperties: false },
);
export type PostCreateBodyDto = Static<typeof PostCreateBodySchema>;

/**
 * [DELETE/PATCH /posts/:id] 특정 게시글 접근을 위한 경로 파라미터
 * 물리적 삭제 시 데이터 복구가 불가능하므로, 요청 id와 authorId를 대조하여
 * 삭제 권한(소유권)을 검증하는 2중 보안 장치로 활용합니다.
 */
export const PostIdParamsSchema = Type.Object(
  {
    /** 대상 게시글의 고유 식별자 */
    id: Type.Integer(),
    /** 보안 강화: 삭제/수정 요청 시 실제 소유주인지 대조하기 위한 작성자 ID */
    authorId: Type.Integer(),
  },
  { $id: 'PostIdParams', additionalProperties: false },
);
export type PostIdParamsDto = Static<typeof PostIdParamsSchema>;

/**
 * [PATCH /posts/:id] 게시글 수정을 위한 요청 바디
 * Partial을 적용하여 변경이 필요한 필드만 수신합니다.
 */
export const PostUpdateBodySchema = Type.Partial(
  Type.Object({
    title: Type.String({ minLength: 1, maxLength: 255 }),
    content: Type.String(),
    published: Type.Optional(booleanSchema),
  }),
  { $id: 'PostUpdateRequest', additionalProperties: false },
);
export type PostUpdateBodyDto = Static<typeof PostUpdateBodySchema>;

/**
 * 비즈니스 로직 오염 방지 및 사용자 직접 조작 방지를 위해 일반 수정 DTO와 분리합니다.
 * 물리적 삭제 시 관련 통계 데이터(PostViewStat 등)도 연쇄 삭제됩니다.
 */
export const PostUpdateAggregateBodySchema = Type.Object(
  {
    viewCount: Type.Optional(Type.Integer()),
    likeCount: Type.Optional(Type.Integer()),
    replyCount: Type.Optional(Type.Integer()),
  },
  { $id: 'PostUpdateAggregateRequest', additionalProperties: false },
);
export type PostUpdateAggregateBodyDto = Static<typeof PostUpdateAggregateBodySchema>;

/**
 * KeySet 기반 페이지네이션 객체
 * 고유 ID와 정렬값을 조합한 커서를 사용하여 데이터 누락 및 중복 노출을 방지합니다.
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
 * [GET /posts] 목록 조회 및 검색 필터링
 * 물리적 삭제 환경에서는 '삭제된 데이터'를 거를 필요가 없으므로 쿼리가 단순화되나,
 * 랭킹 산정 시 존재하지 않는 게시글의 ID가 포함되지 않도록 인덱스 관리가 중요합니다.
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
    titleOnly: Type.Optional(booleanSchema),

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
        Type.Literal('latest'), // 최신순 (createdAt DESC)
        Type.Literal('oldest'), // 과거순 (createdAt ASC)
        Type.Literal('mostViewed'), // 조회수순 (viewCount DESC)
        Type.Literal('mostLiked'), // 좋아요순 (likeCount DESC)
        Type.Literal('mostReplied'), // 댓글순 (replyCount DESC)
      ]),
    ),

    // --- 페이지네이션 ---
    cursor: Type.Optional(CursorSchema),
    /** 페이지당 노출 개수 (기본값 설정 권장) */
    take: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 10 })),
  },
  { $id: 'PostListQuery', additionalProperties: false },
);
export type PostListQueryDto = Static<typeof PostListQuerySchema>;

// ----------------------------------------------------------------
// Response DTO: 클라이언트로 전달되는 최종 데이터 정의
// ----------------------------------------------------------------

/** 전체 게시글 수 응답 (물리적 삭제 반영된 실시간 카운트) */
export const PostCountResponseSchema = Type.Object(
  {
    count: Type.Integer(),
  },
  { $id: 'PostCountResponse', additionalProperties: false },
);
export type PostCountResponseDto = Static<typeof PostCountResponseSchema>;

/** 작성자 프로필 요약 (User-Profile 조인 결과) */
export const PostAuthorSchema = Type.Object(
  {
    id: Type.Integer(),
    name: Type.String(),
  },
  { $id: 'PostAuthor', additionalProperties: false },
);

export const PostUpdateResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    authorId: Type.Integer(),
    published: Type.Optional(Type.Boolean()),
    updatedAt: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { $id: 'PostUpdateResponse', additionalProperties: false },
);
export type PostUpdateResponseDto = Static<typeof PostUpdateResponseSchema>;

/** 게시글 상세 응답 (단건 조회용) */
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

/** 목록 조회를 위한 경량 스키마 (본문 등 무거운 필드 제외) */
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

/** 목록 조회의 최종 결과물 및 다음 페이지 정보 */
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
