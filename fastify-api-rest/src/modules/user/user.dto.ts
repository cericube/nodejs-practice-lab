import { Type, type Static } from '@sinclair/typebox';
/**
 * ============================================================
 * DTO / Schema 명명 규칙 표준 (Fastify + TypeBox + Prisma 기준)
 * ============================================================
 *
 * [Request / Query / Params]
 * ┌──────────────────────┬──────────────────────────┬──────────────────────────┬──────────────────────┐
 * │ 용도                 │ Schema 변수명             │ DTO(Type) 변수명          │ Swagger $id          │
 * ├──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────┤
 * │ Create Body          │ UserCreateBodySchema      │ UserCreateBodyDto         │ UserCreateRequest    │
 * │ Update Body          │ UserUpdateBodySchema      │ UserUpdateBodyDto         │ UserUpdateRequest    │
 * │ Query (List/Search)  │ UserListQuerySchema       │ UserListQueryDto          │ UserListQuery        │
 * │ Path Params          │ UserIdParamsSchema        │ UserIdParamsDto           │ UserIdParams         │
 * └──────────────────────┴──────────────────────────┴──────────────────────────┴──────────────────────┘
 *
 * [Response - Payload Model]
 * ┌──────────────────────┬──────────────────────────┬──────────────────────────┬──────────────────────┐
 * │ 목적                 │ Schema 변수명             │ DTO(Type) 변수명          │ Swagger $id          │
 * ├──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────┤
 * │ Base Item (List)     │ UserBaseSchema            │ UserBaseDto               │ UserBase             │
 * │ Detail Item (Join)   │ UserDetailSchema          │ UserDetailDto             │ UserDetail           │
 * └──────────────────────┴──────────────────────────┴──────────────────────────┴──────────────────────┘
 *
 * [Response]
 * ┌──────────────────────┬──────────────────────────┬──────────────────────────┬──────────────────────┐
 * │ API 응답             │ Schema 변수명             │ DTO(Type) 변수명          │ Swagger $id          │
 * ├──────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────┤
 * │ 단건 (Base)          │ UserResponseSchema        │ UserResponseDto           │ UserResponse         │
 * │ 단건 (Detail)        │ UserDetailResponseSchema  │ UserDetailResponseDto     │ UserDetailResponse   │
 * │ 목록                 │ UserListResponseSchema    │ UserListResponseDto       │ UserListResponse     │
 * └──────────────────────┴──────────────────────────┴──────────────────────────┴──────────────────────┘
 *
 * [명명 원칙]
 * - Prefix: 항상 Entity(User, Order, Payment 등)로 시작
 * - Suffix:
 *   - Schema → Fastify 런타임 검증 / Swagger 노출용
 *   - Dto    → TypeScript 타입 계약 (Static<typeof Schema>)
 * - Swagger $id:
 *   - 코드 변수명과 분리하여 Request / Response 계약 명칭으로 사용
 * - Response:
 *   - Base / Detail Payload 분리하여 Join 포함 여부 명확화
 */

/* ==================================================================== */
/* Request DTOs                                                         */
/* ==================================================================== */

/**
 * [POST /users]
 * 회원 생성 요청 Body
 *
 * 설계 원칙:
 * - DB insert에 필요한 필드만 포함
 * - 서버 생성 필드(id, createdAt 등)는 포함하지 않음
 */
export const UserCreateBodySchema = Type.Object(
  {
    email: Type.String({ format: 'email' }),
    phoneNumber: Type.String({
      pattern: '^\\+8210\\d{8}$',
      description: 'E.164 format (+8210xxxxxxxx)',
    }),
    displayName: Type.Optional(Type.String({ minLength: 2, maxLength: 50 })),
  },
  { $id: 'UserCreateRequest' },
);
export type UserCreateBodyDto = Static<typeof UserCreateBodySchema>;

/**
 * [PATCH /users/:id]
 * 회원 정보 부분 수정 요청 Body
 *
 * 설계 원칙:
 * - PATCH 의미에 맞게 모든 필드는 optional
 * - 수정 가능한 필드만 명시
 */
export const UserUpdateBodySchema = Type.Partial(
  Type.Object({
    displayName: Type.String({ minLength: 2, maxLength: 50 }),
  }),
  { $id: 'UserUpdateRequest' },
);
export type UserUpdateBodyDto = Static<typeof UserUpdateBodySchema>;

/**
 * [GET /users]
 * 회원 목록 조회 / 검색 Query String
 *
 * 포함 요소:
 * - 검색 조건
 * - 페이징 파라미터
 *
 * 주의:
 * - default 값은 Ajv validation 기준이며
 *   실제 런타임 값 보정은 service 계층에서 처리 권장
 */
export const UserListQuerySchema = Type.Object(
  {
    email: Type.Optional(Type.String()),
    displayName: Type.Optional(Type.String()),
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    size: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  },
  { $id: 'UserListQuery' },
);
export type UserListQueryDto = Static<typeof UserListQuerySchema>;

/**
 * [GET|PATCH|DELETE /users/:id]
 * 공통 Path Parameter
 */
export const UserIdParamsSchema = Type.Object(
  {
    id: Type.Integer(),
  },
  { $id: 'UserIdParams' },
);
export type UserIdParamsDto = Static<typeof UserIdParamsSchema>;

/* ==================================================================== */
/* Response Item DTOs (Payload Shape)                                    */
/* ==================================================================== */

/**
 * 기본 응답 아이템
 *
 * 사용 예:
 * - GET /users (목록)
 * - POST /users (생성 직후 응답)
 *
 * 특징:
 * - 화면 리스트 및 요약 정보 용도
 * - 민감 정보 제외
 */
export const UserResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    email: Type.String({ format: 'email' }),
    displayName: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'UserResponse' },
);
export type UserResponseDto = Static<typeof UserResponseSchema>;

/**
 * 상세 응답 아이템 (Join 포함)
 *
 * 사용 예:
 * - GET /users/:id
 *
 * 특징:
 * - phoneNumber, profile 등 확장 정보 포함
 * - 상세 화면 전용 응답 구조
 */
export const UserDetailResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    email: Type.String({ format: 'email' }),
    phoneNumber: Type.String(),
    displayName: Type.Optional(Type.String()),
    createdAt: Type.String({ format: 'date-time' }),

    profile: Type.Optional(
      Type.Object({
        bio: Type.Optional(Type.String()),
        avatarUrl: Type.Optional(Type.String({ format: 'url' })),
      }),
    ),
  },
  { $id: 'UserDetailResponse' },
);
export type UserDetailResponseDto = Static<typeof UserDetailResponseSchema>;

/* ==================================================================== */
/* Response Wrapper DTOs (HTTP Shape)                                    */
/* ==================================================================== */

/**
 * 목록 응답 Wrapper
 *
 * 실제 HTTP Response:
 * {
 *   data: UserResponse[],
 *   meta: { total, page, size }
 * }
 */
export const UserListResponseSchema = Type.Object(
  {
    data: Type.Array(UserResponseSchema),
    meta: Type.Object({
      total: Type.Integer(),
      page: Type.Integer(),
      size: Type.Integer(),
    }),
  },
  { $id: 'UserListResponse' },
);
export type UserListResponseDto = Static<typeof UserListResponseSchema>;
