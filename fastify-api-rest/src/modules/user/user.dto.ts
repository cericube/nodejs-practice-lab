// src/module/user/user.dto.ts
import { Type, type Static } from '@sinclair/typebox';

/**
 * TypeBox 패키지 비교 (Fastify 관점)
 *
 * 1. @sinclair/typebox (0.x), typebox-legacy
 * - 기존 안정 버전 (실무에서 가장 많이 사용), 지속적으로 관리중
 * - Fastify ecosystem 및 예제가 대부분 이 버전 기준
 * - @fastify/type-provider-typebox와 호환성 검증됨
 * - 자료 / 커뮤니티 / 사례 많음
 * - Fastify 프로젝트 시작 시 가장 안전한 선택
 *
 * 2. typebox (1.x)
 * - 차세대 구조 (기능 확장 및 내부 구조 개선 진행 중)
 * - ecosystem 및 Fastify 사례는 아직 적음
 * - 일부 API 변화 가능성 있음
 * - 실험적 도입 또는 장기 관점 검토용
 */

/** ----------------------------------------------------------------
 * [개념 설명] additionalProperties: false 의 역할
 * ----------------------------------------------------------------
 * 1. 역할: 스키마에 명시적으로 정의되지 않은 "추가 속성"의 허용 여부를 결정합니다.
 * 2. 요청(Request) 시:
 *    클라이언트가 정의되지 않은 불필요한 필드를 보낼 경우
 *    에러를 발생시키거나 차단합니다. (보안 및 데이터 정합성 유지)
 * 3. 응답(Response) 시:
 *    서버에서 클라이언트로 데이터를 보낼 때,
 *    스키마에 정의된 필드만 필터링하여 노출되도록 강제합니다. (의도치 않은 데이터 유출 방지)
 * ---------------------------------------------------------------- */

/** ----------------------------------------------------------------
 * 공용 기본 타입 (Primitive/Atom Schemas)
 * ---------------------------------------------------------------- */

/** 이메일 형식 스키마 */
const emailSchema = Type.String({ format: 'email' });

/** 한국 휴대폰 번호 스키마 (E.164 포맷: +821012345678) */
const krNumberSchema = Type.String({
  pattern: '^\\+8210\\d{8}$',
  description: 'E.164 format (+8210xxxxxxxx)',
});

/** 사용자 표시 이름 (2~50자, 선택 사항) */
const displayNameSchema = Type.Optional(Type.String({ minLength: 2, maxLength: 50 }));

/** 쿼리 스트링 등에서 사용되는 문자열 기반 Boolean (URL 파라미터 대응) */
const booleanSchema = Type.Union([Type.Literal('true'), Type.Literal('false')]);

/** 정렬 순서 */
const orderSchema = Type.Union([Type.Literal('asc'), Type.Literal('desc')]);

/** 정렬 가능 필드 목록 */
const orderFieldSchema = Type.Union([
  Type.Literal('id'),
  Type.Literal('email'),
  Type.Literal('phoneNumber'),
  Type.Literal('createdAt'),
  Type.Literal('updatedAt'),
]);

/** ----------------------------------------------------------------
 * 요청(Request) DTO 스키마
 * ---------------------------------------------------------------- */

/**
 * 사용자 생성 요청 바디
 * - additionalProperties: false를 통해 API 명세에 없는 필드 유입을 원천 차단합니다.
 */
export const UserCreateBodySchema = Type.Object(
  {
    email: emailSchema,
    phoneNumber: krNumberSchema,
    displayName: displayNameSchema,
  },
  { $id: 'UserCreateRequest', additionalProperties: false },
);
export type UserCreateBodyDto = Static<typeof UserCreateBodySchema>;

/**
 * 사용자 정보 수정 요청 바디 (Partial 적용)
 * - Partial을 사용하여 모든 필드를 선택사항으로 만들면서도 정의되지 않은 속성은 허용하지 않습니다.
 */
export const UserUpdateBodySchema = Type.Partial(
  Type.Object({
    displayName: displayNameSchema,
    email: emailSchema,
    phoneNumber: krNumberSchema,
  }),
  { $id: 'UserUpdateRequest', additionalProperties: false },
);
export type UserUpdateBodyDto = Static<typeof UserUpdateBodySchema>;

/**
 * 단일 사용자 조회 쿼리 (Union)
 * - ID, 이메일, 전화번호 중 하나로 조회를 허용합니다.
 * - Union 내부의 각 객체에 additionalProperties: false를 개별 설정하여 타입 안전성을 높였습니다.
 * - Union 에서의 additionalProperties: false 사용은 의도치 않게 동작하으로 사용하지 않습니다.
 */
export const UserQuerySchema = Type.Union(
  [
    Type.Object(
      { id: Type.Integer(), includeProfile: Type.Optional(booleanSchema) },
      { additionalProperties: false },
    ),
    Type.Object(
      { email: emailSchema, includeProfile: Type.Optional(booleanSchema) },
      { additionalProperties: false },
    ),
    Type.Object(
      { phoneNumber: krNumberSchema, includeProfile: Type.Optional(booleanSchema) },
      { additionalProperties: false },
    ),
  ],
  { $id: 'UserQuery' },
);
export type UserQueryDto = Static<typeof UserQuerySchema>;

/**
 * 사용자 목록 조회 쿼리 (필터링, 정렬, 페이징 포함)
 * - 쿼리 스트링을 통해 악의적인 필드 주입이 일어나는 것을 방지합니다.
 */
export const UserListQuerySchema = Type.Object(
  {
    includeProfile: Type.Optional(booleanSchema),
    displayName: Type.Optional(Type.String({ description: 'Partial match search' })),
    orderBy: Type.Optional(
      Type.Object(
        {
          field: orderFieldSchema,
          direction: Type.Optional(orderSchema),
        },
        { additionalProperties: false },
      ),
    ),
    skip: Type.Optional(Type.Integer({ minimum: 0 })),
    take: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { $id: 'UserListQuery', additionalProperties: false },
);
export type UserListQueryDto = Static<typeof UserListQuerySchema>;

/** URL 파라미터 기반 ID 조회 */
export const UserIdParamsSchema = Type.Object(
  {
    id: Type.Integer(),
  },
  { $id: 'UserIdParams', additionalProperties: false },
);
export type UserIdParamsDto = Static<typeof UserIdParamsSchema>;

/** 사용자 수 조회를 위한 검색 조건 */
export const UserCountQuerySchema = Type.Object(
  {
    displayName: Type.Optional(Type.String()),
  },
  { $id: 'UserCountQuery', additionalProperties: false },
);
export type UserCountQueryDto = Static<typeof UserCountQuerySchema>;

/** ----------------------------------------------------------------
 * 응답(Response) DTO 스키마
 * ---------------------------------------------------------------- */

/**
 * 단순 개수 응답
 * - 응답 시 불필요한 메타데이터가 포함되지 않도록 보장합니다.
 */
export const UserCountSchema = Type.Object(
  {
    count: Type.Integer(),
  },
  { $id: 'UserCount', additionalProperties: false },
);
export type UserCountDto = Static<typeof UserCountSchema>;

/** 존재 여부 확인 응답 */
export const UserExistsSchema = Type.Object(
  {
    exists: Type.Boolean(),
  },
  { $id: 'UserExist', additionalProperties: false },
);
export type UserExistsDto = Static<typeof UserExistsSchema>;

/**
 * 기본 사용자 정보 응답
 * - additionalProperties: false를 설정하여 DB 모델의 내부 필드(예: passwordHash)가
 * 의도치 않게 응답에 포함되어 클라이언트에 노출되는 것을 방지합니다.
 */
export const UserResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    email: emailSchema,
    phoneNumber: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'UserResponse', additionalProperties: false },
);
export type UserResponseDto = Static<typeof UserResponseSchema>;

/** 사용자 상세 정보 응답 (프로필 정보 포함) */
export const UserDetailResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    email: emailSchema,
    phoneNumber: Type.String(),
    displayName: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),

    profile: Type.Optional(
      Type.Object(
        {
          bio: Type.Union([Type.String(), Type.Null()]),
          avatarKey: Type.Union([Type.String(), Type.Null()]),
          avatarFileName: Type.Union([Type.String(), Type.Null()]),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: 'UserDetailResponse', additionalProperties: false },
);
export type UserDetailResponseDto = Static<typeof UserDetailResponseSchema>;

/** 페이지네이션이 적용된 사용자 목록 응답 */
export const UserListResponseSchema = Type.Object(
  {
    data: Type.Array(UserDetailResponseSchema),
    meta: Type.Optional(
      Type.Object(
        {
          total: Type.Integer(),
          skip: Type.Optional(Type.Integer()),
          take: Type.Optional(Type.Integer()),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: 'UserListResponse', additionalProperties: false },
);
export type UserListResponseDto = Static<typeof UserListResponseSchema>;
