# fastify-api-rest 개발 표준

이 문서는 `fastify-api-rest` 프로젝트의 백엔드 개발 표준입니다.
현재 코드베이스의 실제 구조와 작성 방식을 기준으로 정리했으며, 새 기능을 추가하거나 기존 기능을 수정할 때 우선 적용합니다.

문서의 목적은 다음과 같습니다.

- 도메인 모듈을 같은 구조로 작성한다.
- Route, Controller, Service, Repository의 책임을 명확히 나눈다.
- TypeBox, Prisma, Vitest 사용 방식을 통일한다.
- 응답, 에러, 주석, 테스트 작성 방식을 팀 기준으로 맞춘다.

## 1. 프로젝트 기준

### 1.1 기본 경로

| 구분 | 경로 |
| --- | --- |
| 워크스페이스 루트 | `D:\NodejsDevelope\workspace\nodejs-practice-lab` |
| API 프로젝트 루트 | `D:\NodejsDevelope\workspace\nodejs-practice-lab\fastify-api-rest` |
| 애플리케이션 소스 | `fastify-api-rest/src` |
| 테스트 소스 | `fastify-api-rest/tests` |
| Prisma 스키마/마이그레이션 | `fastify-api-rest/prisma` |

### 1.2 주요 폴더 역할

```text
fastify-api-rest/
  prisma/                 # Prisma schema, migration
  src/
    app.ts                # Fastify 앱 생성 및 plugin/route 등록
    server.ts             # 실제 listen() 실행 진입점
    route.ts              # 도메인 route 중앙 등록
    common/               # 공통 응답, 에러, 유틸
    config/               # 환경변수, Prisma 설정
    generated/            # Prisma generated code
    modules/              # 도메인별 기능 모듈
    plugins/              # Fastify plugin
    types/                # Fastify 타입 확장
  tests/                  # Vitest 테스트
```

### 1.3 직접 수정하지 않는 영역

아래 경로는 생성물 또는 실행 산출물이므로 직접 수정하지 않습니다.

- `dist`
- `coverage`
- `node_modules`
- `src/generated`
- `logs`
- `uploads`

`src/generated` 변경이 필요하면 `prisma/schema.prisma`를 수정한 뒤 Prisma generate 또는 migration 절차를 따릅니다.

## 2. 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| Runtime | Node.js |
| Language | TypeScript |
| Module System | ESM (`"type": "module"`) |
| Web Framework | Fastify |
| Validation / Schema | TypeBox |
| ORM | Prisma |
| Database | PostgreSQL |
| Test | Vitest |
| Logger | Pino, pino-pretty |

## 3. 코드 스타일

### 3.1 TypeScript 규칙

루트 `tsconfig.json` 정책을 따릅니다.

- `strict: true` 기준으로 작성한다.
- ESM `import/export` 문법을 사용한다.
- 타입 전용 import는 `import type`을 사용한다.
- `any` 사용은 피한다.
- 외부 에러처럼 타입을 알 수 없는 값은 `unknown`으로 받고 타입 가드로 좁힌다.
- optional field는 `undefined`와 속성 부재를 구분해서 다룬다.

좋은 예:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';

function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof Error) {
    request.log.error({ err: error }, error.message);
  }

  return reply.status(500).send({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: '서버에서 알 수 없는 오류가 발생했습니다.',
  });
}
```

피해야 할 예:

```ts
function handleError(error: any) {
  console.log(error.message);
}
```

### 3.2 Formatting

루트 `.prettierrc` 기준을 따릅니다.

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

### 3.3 네이밍 규칙

| 대상 | 규칙 | 예시 |
| --- | --- | --- |
| 파일명 | `{domain}.{role}.ts` | `post.service.ts` |
| 클래스 | PascalCase | `PostService` |
| 함수/변수 | camelCase | `createPost` |
| DTO 타입 | `Dto` 접미사 | `PostCreateBodyDto` |
| TypeBox Schema | `Schema` 접미사 | `PostCreateBodySchema` |
| 에러 코드 | 대문자 snake case | `VALIDATION_ERROR` |
| 테스트 파일 | `{domain}.{layer}.test.ts` | `post.route.test.ts` |

도메인 모듈 파일은 아래 형식을 우선 사용합니다.

```text
src/modules/{domain}/
  {domain}.route.ts
  {domain}.controller.ts
  {domain}.service.ts
  {domain}.repository.ts
  {domain}.dto.ts
```

## 4. 애플리케이션 구성 표준

### 4.1 `createApp()`와 `listen()` 분리

Fastify 인스턴스 생성은 `src/app.ts`의 `createApp()`에서 담당합니다.
실제 서버 실행은 `src/server.ts`에서만 수행합니다.

이 구조를 유지해야 테스트에서 `app.inject()`로 HTTP 요청을 직접 검증할 수 있습니다.

```ts
// 테스트 코드 예시
const app = await createApp();
await app.ready();

const res = await app.inject({
  method: 'GET',
  url: '/api/posts?id=1&includeDraft=true',
});
```

### 4.2 Fastify 등록 순서

`createApp()`에서는 아래 순서를 유지합니다.

1. Fastify 인스턴스 생성
2. TypeBox Type Provider 연결
3. Infrastructure plugin 등록
4. 공통 plugin 등록
5. Global error handler 등록
6. NotFound handler 등록
7. Business route 등록

현재 프로젝트 기준 예시:

```ts
const app = Fastify(options).withTypeProvider<TypeBoxTypeProvider>();

await app.register(prismaPlugin);
await app.register(multipart, { limits: uploadLimits });

app.setErrorHandler(errorHandler);
app.setNotFoundHandler(notFoundHandler);

app.register(routes, { prefix: '/api' });
```

등록 순서는 의존성 흐름을 표현합니다.
DB, multipart 같은 기반 기능을 먼저 등록하고, 그 다음 전역 정책과 비즈니스 route를 연결합니다.

## 5. 라우팅 표준

### 5.1 중앙 route 등록

모든 도메인 route는 `src/route.ts`에서 중앙 등록합니다.

```ts
export async function routes(app: FastifyInstance) {
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(postRoutes, { prefix: '/posts' });
  await app.register(postFileRoutes, { prefix: '/files' });
}
```

최종 URL은 `src/app.ts`의 `/api` prefix와 결합됩니다.

| Route 등록 | 최종 URL 예시 |
| --- | --- |
| `{ prefix: '/posts' }` | `/api/posts` |
| `{ prefix: '/users' }` | `/api/users` |
| `{ prefix: '/files' }` | `/api/files` |

### 5.2 Route Layer 책임

Route 계층은 HTTP 인터페이스만 담당합니다.

- request schema 정의
- response schema 정의
- Controller 호출
- 성공 응답 래핑

Route 계층에 두지 않는 것:

- Prisma 직접 호출
- 비즈니스 규칙
- 복잡한 조건 분기
- Entity 응답 변환

좋은 예:

```ts
fastify.post(
  '/',
  {
    schema: {
      tags: ['Post'],
      body: PostCreateBodySchema,
      response: { 200: SuccessResponseSchema(PostUpdateResponseSchema) },
    },
  },
  async (request, reply) => {
    const result = await postController.createPost(request.body);
    return reply.code(200).send(success(result));
  },
);
```

피해야 할 예:

```ts
fastify.post('/', async (request, reply) => {
  const post = await fastify.prisma.post.create({ data: request.body });
  return reply.send(post);
});
```

### 5.3 HTTP method 사용 기준

| 목적 | Method | 예시 |
| --- | --- | --- |
| 생성 | `POST` | `POST /api/posts` |
| 단건 조회 | `GET` | `GET /api/posts?id=1` |
| 목록/복합 검색 | `POST` 또는 `GET` | `POST /api/posts/list` |
| 부분 수정 | `PATCH` | `PATCH /api/posts/:id` |
| 삭제 | `DELETE` | `DELETE /api/posts/:id` |

검색 조건이 많거나 cursor 객체가 포함되는 경우 현재 프로젝트처럼 `POST /list`를 사용할 수 있습니다.

## 6. 계층별 책임

### 6.1 전체 흐름

```text
HTTP Request
  -> Route
  -> Controller
  -> Service
  -> Repository
  -> Prisma / DB
```

응답은 반대 방향으로 돌아오며, 외부 응답 형태는 Route와 Service 사이에서 DTO 기준으로 유지합니다.

### 6.2 Controller

Controller는 Route와 Service 사이의 얇은 실행 조정 계층입니다.

규칙:

- request/reply 객체를 Service에 넘기지 않는다.
- Service 메서드 호출에 필요한 DTO만 전달한다.
- 복잡한 비즈니스 판단을 작성하지 않는다.

예시:

```ts
export class PostController {
  constructor(private readonly postService: PostService) {}

  createPost(input: PostCreateBodyDto): Promise<PostUpdateResponseDto> {
    return this.postService.createPost(input);
  }
}
```

### 6.3 Service

Service는 애플리케이션 비즈니스 규칙과 응답 변환을 담당합니다.

규칙:

- Repository를 조합해 유스케이스를 완성한다.
- DB Entity를 API 응답 DTO로 변환한다.
- Date는 ISO string으로 변환한다.
- 인증/권한 정책은 도입 후 이 계층에서 우선 반영한다.

예시:

```ts
async createPost(input: PostCreateBodyDto): Promise<PostUpdateResponseDto> {
  const post = await this.repository.create(input);
  return toUpdateResponse(post);
}

function toUpdateResponse(post: {
  id: number;
  authorId: number;
  published: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: post.id,
    authorId: post.authorId,
    published: post.published,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    updatedAt: post.updatedAt.toISOString(),
  };
}
```

피해야 할 예:

```ts
async createPost(input: PostCreateBodyDto) {
  return this.repository.create(input); // DB Date, 내부 필드가 그대로 노출될 수 있음
}
```

### 6.4 Repository

Repository는 DB 접근과 Prisma query를 담당합니다.

규칙:

- 필요한 필드만 `select`한다.
- 목록 조회에서는 `content` 같은 무거운 필드를 제외한다.
- relation은 N+1을 피하기 위해 필요한 경우 Prisma relation select로 가져온다.
- Prisma 에러를 HTTP 응답으로 직접 변환하지 않는다.
- 트랜잭션이 필요한 작업은 `$transaction` 안에서 처리한다.

예시:

```ts
const postListSelect: Prisma.PostSelect = {
  id: true,
  title: true,
  published: true,
  author: {
    select: {
      id: true,
      displayName: true,
    },
  },
  createdAt: true,
  viewCount: true,
  likeCount: true,
  replyCount: true,
};
```

피해야 할 예:

```ts
return this.prisma.post.findMany(); // 모든 컬럼과 불필요한 데이터가 노출될 수 있음
```

## 7. DTO와 TypeBox Schema 표준

### 7.1 기본 작성 방식

요청/응답 스키마는 TypeBox로 작성하고, TypeScript 타입은 `Static<typeof Schema>`로 생성합니다.

```ts
import { Type, type Static } from '@sinclair/typebox';

export const PostCreateBodySchema = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 255 }),
    content: Type.Optional(Type.String()),
    published: Type.Optional(Type.Boolean()),
    authorId: Type.Integer({ minimum: 1 }),
  },
  { $id: 'PostCreateRequest', additionalProperties: false },
);

export type PostCreateBodyDto = Static<typeof PostCreateBodySchema>;
```

### 7.2 작성 규칙

- 외부 입력 schema에는 `additionalProperties: false`를 적용한다.
- 문자열 길이, 숫자 범위, 날짜 format을 schema에 명시한다.
- Request DTO와 Response DTO를 분리한다.
- 목록 응답 DTO는 상세 응답 DTO보다 가볍게 만든다.
- `Type.Optional()`은 실제로 생략 가능한 필드에만 사용한다.
- nullable 값은 `Type.Union([Type.String(), Type.Null()])`처럼 명시한다.

예시:

```ts
export const PostUpdateResponseSchema = Type.Object(
  {
    id: Type.Integer(),
    authorId: Type.Integer(),
    published: Type.Boolean(),
    publishedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'PostUpdateResponse', additionalProperties: false },
);
```

### 7.3 Query string 주의

Query string은 URL에서 전달되므로 원본은 문자열입니다.
boolean, number를 사용할 때는 Fastify schema 변환 동작을 고려하고 테스트에서 반드시 검증합니다.

예시:

```ts
export const PostQuerySchema = Type.Object(
  {
    id: Type.Integer(),
    includeDraft: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
```

## 8. 응답 표준

### 8.1 성공 응답

성공 응답은 항상 `success()`를 사용해 표준 래퍼로 반환합니다.

```json
{
  "success": true,
  "body": {
    "id": 1
  }
}
```

Route schema에는 `SuccessResponseSchema()`를 사용합니다.

```ts
response: {
  200: SuccessResponseSchema(PostUpdateResponseSchema),
}
```

### 8.2 실패 응답

실패 응답은 전역 error handler에서 생성합니다.

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "데이터를 찾을 수 없습니다."
}
```

규칙:

- Route 또는 Service에서 실패 응답 객체를 직접 만들지 않는다.
- 내부 details, stack trace, Prisma meta를 클라이언트에 노출하지 않는다.
- 분석용 details는 로그에 남긴다.

## 9. 에러 처리 표준

### 9.1 ErrorCode 관리

공통 에러 코드는 `src/common/errors/error.codes.ts`에서 관리합니다.

분류:

- COMMON / SYSTEM
- AUTHENTICATION / AUTHORIZATION
- VALIDATION / INPUT
- RESOURCE / DOMAIN
- DATABASE
- EXTERNAL / INTEGRATION

새 에러 코드를 추가할 때는 기존 분류 아래에 배치합니다.

```ts
export enum ErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  FILE_COUNT_EXCEEDED = 'FILE_COUNT_EXCEEDED',
}
```

### 9.2 BusinessError 사용

도메인에서 의도적으로 차단해야 하는 흐름은 `BusinessError`를 사용합니다.

예시:

```ts
throw new BusinessError(
  ErrorCode.FILE_COUNT_EXCEEDED,
  '첨부 가능한 파일 개수를 초과했습니다.',
  400,
);
```

### 9.3 Prisma 에러 매핑

Prisma known error는 전역 error handler에서 HTTP 의미로 변환합니다.

| Prisma code | HTTP status | ErrorCode |
| --- | --- | --- |
| `P2002` | `409` | `ALREADY_EXISTS` |
| `P2025` | `404` | `NOT_FOUND` |
| 기타 | `500` | `INTERNAL_SERVER_ERROR` |

Repository에서 Prisma 에러를 잡아 HTTP 응답으로 직접 변환하지 않습니다.
DB 레이어의 예외는 전역 error handler에서 일관되게 처리합니다.

## 10. Prisma와 DB 접근 표준

### 10.1 select 우선 원칙

Repository는 가능한 한 명시적인 `select`를 사용합니다.

좋은 예:

```ts
return this.prisma.post.findMany({
  where,
  orderBy,
  take: take + 1,
  select: postListSelect,
});
```

피해야 할 예:

```ts
return this.prisma.post.findMany({ where });
```

### 10.2 Transaction 사용 기준

아래 조건 중 하나라도 해당하면 `$transaction` 사용을 검토합니다.

- 여러 테이블 변경이 하나의 작업으로 묶여야 한다.
- 조회와 갱신이 같은 일관성 안에서 처리되어야 한다.
- 카운터 증가와 통계 기록이 함께 성공/실패해야 한다.

예시:

```ts
return this.prisma.$transaction(async (tx) => {
  await tx.post.update({
    where: { id: postId, published: true },
    data: { viewCount: { increment: 1 } },
    select: { id: true },
  });

  await new PostViewStatRepository(tx).createPostViewStat(postId);

  return tx.post.findUniqueOrThrow({
    where: { id: postId, published: true },
    select: postDetailSelect,
  });
});
```

### 10.3 권한 조건

현재 인증 계층이 없으므로 일부 API는 `authorId`를 요청 DTO로 받아 소유자 조건에 사용합니다.
이 방식은 임시 정책입니다.

인증 도입 후에는 다음 기준으로 변경합니다.

- 클라이언트가 보낸 `authorId`를 신뢰하지 않는다.
- 인증 컨텍스트의 사용자 ID를 Service 계층에서 사용한다.
- 관리자 권한과 일반 사용자 권한을 명확히 분리한다.

## 11. Pagination 및 조회 성능

### 11.1 Cursor 기반 페이지네이션

대량 목록 조회는 offset보다 keyset cursor 방식을 우선 사용합니다.

기본 규칙:

- `take + 1`개를 조회한다.
- 조회 결과가 `take`보다 크면 `hasNextPage = true`로 판단한다.
- 응답에는 판단용 마지막 레코드를 제외한다.
- 다음 요청에 사용할 `nextCursor`를 반환한다.

예시:

```ts
const posts = await this.repository.selectMany({ filter, ranges, page });
const hasNextPage = posts.length > page.take;
const resultPosts = hasNextPage ? posts.slice(0, -1) : posts;
const lastPost = resultPosts[resultPosts.length - 1];

return {
  posts: resultPosts.map((post) => toPostListResponse(post)),
  hasNextPage,
  ...(hasNextPage && { nextCursor: buildPostCursor(page.sort, lastPost) }),
};
```

### 11.2 정렬 기준

중복 가능한 정렬 컬럼은 반드시 `id`를 tie-breaker로 함께 사용합니다.

| sort | orderBy |
| --- | --- |
| `latest` | `id DESC` |
| `oldest` | `id ASC` |
| `mostViewed` | `viewCount DESC, id DESC` |
| `mostLiked` | `likeCount DESC, id DESC` |
| `mostReplied` | `replyCount DESC, id DESC` |

### 11.3 Keyset 조건 예시

조회수순 정렬에서 다음 페이지 조건은 아래 형태를 사용합니다.

```sql
ORDER BY viewCount DESC, id DESC

WHERE
  viewCount < :cursorValue
  OR (viewCount = :cursorValue AND id < :cursorId)
```

Prisma 예시:

```ts
return {
  OR: [
    { viewCount: { lt: value } },
    {
      viewCount: value,
      id: { lt: id },
    },
  ],
};
```

### 11.4 검색 성능

`contains` + `insensitive` 검색은 PostgreSQL에서 `ILIKE '%keyword%'` 형태가 될 수 있습니다.
선행 wildcard 때문에 일반 인덱스를 활용하기 어렵고 Full Table Scan 위험이 있습니다.

현재 기본 정책:

- `titleOnly` 기본값은 `true`
- 본문 검색은 필요한 경우에만 허용
- 데이터가 커지면 PostgreSQL Full Text Search 또는 외부 검색 엔진을 검토한다.

```ts
const searchCondition = {
  contains: filter.keyword,
  mode: Prisma.QueryMode.insensitive,
};

if (filter.titleOnly ?? true) {
  where.title = searchCondition;
} else {
  where.OR = [{ title: searchCondition }, { content: searchCondition }];
}
```

## 12. 환경변수와 설정

### 12.1 접근 방식

환경변수는 `src/config/env.ts`의 `env` 객체를 통해 접근합니다.
비즈니스 코드에서 `process.env`를 직접 참조하지 않습니다.

좋은 예:

```ts
import { env } from './config/env';

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
  },
});
```

피해야 할 예:

```ts
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL,
  },
});
```

### 12.2 기본값 관리

운영에 영향을 줄 수 있는 값은 `env`에서 기본값을 명시합니다.

- `NODE_ENV`
- `HOST`
- `PORT`
- `SERVICE_NAME`
- `LOG_LEVEL`
- `LOG_PATH`
- `UPLOAD_MAX_FILES`
- `UPLOAD_MAX_FILE_SIZE`
- DB pool 설정

### 12.3 보안 주의

- `.env` 파일은 저장소에 커밋하지 않는다.
- 로그에 request body를 남길 경우 개인정보와 인증정보 마스킹을 검토한다.
- 운영 환경의 DB URL, token, secret은 코드나 문서 예시에 실제 값으로 남기지 않는다.

## 13. 파일 업로드 표준

Multipart 처리는 `@fastify/multipart`를 사용합니다.
제한값은 `env`에서 관리합니다.

```ts
await app.register(multipart, {
  limits: {
    files: env.UPLOAD_MAX_FILES,
    fileSize: env.UPLOAD_MAX_FILE_SIZE,
  },
});
```

권장 기준:

- 실제 파일은 파일 시스템 또는 외부 스토리지에 저장한다.
- DB에는 파일 메타데이터만 저장한다.
- 파일 개수, 크기, 확장자, MIME type 검증 정책을 명확히 둔다.
- 업로드 실패 시 저장된 임시 파일과 DB 메타데이터 정리 정책을 함께 고려한다.

## 14. 테스트 표준

### 14.1 기본 실행

Vitest를 사용합니다.

```bash
npm test
```

`vite.config.ts` 기준:

- environment: `node`
- include: `tests/**/*.test.ts`
- timeout: `10_000`
- fileParallelism: `false`
- coverage provider: `v8`

DB 통합 테스트가 포함되어 있고 테스트 데이터 정리 순서가 중요하므로 파일 단위 병렬 실행은 끕니다.

### 14.2 테스트 종류

| 테스트 | 검증 대상 |
| --- | --- |
| Repository 테스트 | Prisma query, select, DB 제약조건, pagination |
| Service 테스트 | 비즈니스 규칙, DTO 변환, 권한 조건, 예외 흐름 |
| Route 테스트 | HTTP status, request validation, response schema, error handler |

### 14.3 Route 테스트 예시

```ts
it('필수 값이 누락되면 400 VALIDATION_ERROR를 반환해야 한다.', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/posts/',
    payload: {
      authorId,
    },
  });

  const json = res.json();

  expect(res.statusCode).toBe(400);
  expect(json).toHaveProperty('success', false);
  expect(json).toHaveProperty('code', 'VALIDATION_ERROR');
});
```

### 14.4 Service 테스트 예시

```ts
it('게시글 생성 시 응답 DTO 규격을 반환해야 한다.', async () => {
  const post = await service.createPost({
    title: '타이틀',
    authorId,
  });

  expect(post).toHaveProperty('id');
  expect(post).toHaveProperty('authorId', authorId);
  expect(post).toHaveProperty('published');
  expect(post).toHaveProperty('updatedAt');
  expect(Date.parse(post.updatedAt)).not.toBeNaN();
});
```

### 14.5 테스트 데이터 정리

참조 무결성을 고려하여 자식 데이터부터 삭제합니다.

예시:

```ts
afterAll(async () => {
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  await prisma.profile.deleteMany();
});
```

공통 seed 로직은 `tests/modules/{domain}/{domain}.seed.ts`에 둡니다.

## 15. 주석 작성 표준

이 프로젝트는 한국어 JSDoc 주석을 사용합니다.
기준 파일은 `주석작성용.txt`입니다.

### 15.1 기본 원칙

- 코드가 무엇을 하는지보다 왜 그렇게 설계했는지 설명한다.
- 단순한 코드 번역 주석은 작성하지 않는다.
- 복잡한 로직, 성능, 보안, 권한, 트랜잭션, 인덱스 관련 의사결정을 남긴다.
- 기존 코드 로직을 주석 때문에 변경하지 않는다.
- 주석은 길게 쓰기보다 유지보수자가 판단해야 할 맥락을 남긴다.

### 15.2 섹션 주석

```ts
/**
 * =============================================
 * Pagination Utilities
 * =============================================
 */
```

### 15.3 함수 주석

```ts
/**
 * 게시글 목록 조회
 *
 * [Purpose]
 * 검색 조건과 커서 정보를 기반으로 목록 응답 DTO를 생성합니다.
 *
 * [Business Rules]
 * 기본 상태는 공개 게시글이며, titleOnly 기본값은 true입니다.
 *
 * [Implementation Notes]
 * Repository에서 take + 1개를 조회하고 Service에서 hasNextPage를 계산합니다.
 *
 * [Performance]
 * Offset pagination 대신 keyset pagination을 사용해 뒤 페이지 조회 비용을 줄입니다.
 */
```

### 15.4 Inline 주석

좋은 예:

```ts
// 본문 검색은 ILIKE '%keyword%'로 Full Table Scan 비용이 커질 수 있어 제목 검색을 기본값으로 둡니다.
```

피해야 할 예:

```ts
// title 값을 넣는다.
```

## 16. 신규 도메인 모듈 추가 절차

새 도메인을 추가할 때는 아래 순서를 따릅니다.

1. Prisma 모델과 관계를 확인한다.
2. `{domain}.dto.ts`에 요청/응답 Schema와 DTO 타입을 작성한다.
3. `{domain}.repository.ts`에 select, query, transaction을 작성한다.
4. `{domain}.service.ts`에 비즈니스 규칙과 DTO 변환을 작성한다.
5. `{domain}.controller.ts`는 Service 호출만 얇게 연결한다.
6. `{domain}.route.ts`에 schema와 handler를 등록한다.
7. `src/route.ts`에 도메인 route를 등록한다.
8. Repository, Service, Route 테스트를 추가한다.

기본 파일 구조:

```text
src/modules/comment/
  comment.route.ts
  comment.controller.ts
  comment.service.ts
  comment.repository.ts
  comment.dto.ts
```

중앙 route 등록 예시:

```ts
import { commentRoutes } from './modules/comment/comment.route';

export async function routes(app: FastifyInstance) {
  await app.register(commentRoutes, { prefix: '/comments' });
}
```

## 17. 완료 전 체크리스트

새 API 또는 기능을 완료하기 전에 아래 항목을 확인합니다.

- DTO Schema에 필요한 검증 조건이 들어갔는가?
- 외부 입력 Schema에 `additionalProperties: false`를 적용했는가?
- Route response schema가 `SuccessResponseSchema()`를 사용하는가?
- Route가 Prisma를 직접 호출하지 않는가?
- Controller가 request/reply를 Service에 넘기지 않는가?
- Service가 DB Entity를 그대로 반환하지 않는가?
- Date 응답이 ISO string으로 변환되는가?
- Repository가 필요한 필드만 `select`하는가?
- 목록 조회가 cursor pagination 또는 적절한 조회 전략을 사용하는가?
- Prisma 에러가 전역 error handler에서 표준 응답으로 변환되는가?
- 성공 흐름과 실패 흐름 테스트가 모두 있는가?
- 주석은 단순 설명이 아니라 설계 이유를 설명하는가?

## 18. 팀 결정 필요 항목

아래 항목은 표준 확정 전에 팀에서 결정하면 좋습니다.

- `package.json`에 `build`, `lint`, `format`, `typecheck` 스크립트 추가 여부
- 생성 API 성공 응답을 `200`으로 유지할지 `201`로 변경할지 여부
- URL prefix 네이밍 통일
  - 예: `postlikes` vs `post-likes`
  - 예: `viewstats` vs `view-stats`
- 인증 도입 후 `authorId`를 요청 DTO에서 제거할 시점
- 환경변수 검증 라이브러리 또는 TypeBox 기반 검증 도입 여부
- request body 로그 마스킹 정책
- 파일 업로드의 MIME type, 확장자, 저장소 정리 정책
