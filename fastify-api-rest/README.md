# Fastify API REST

Fastify, TypeBox, Prisma, PostgreSQL을 사용해 REST API 서버를 구현하는 실습 프로젝트입니다.
이 문서는 `fastify-api-rest` 프로젝트의 초기화, 환경 설정, 패키지 설치, 실행, 테스트, 소스 구조를 설명합니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Runtime | Node.js 20.x |
| Language | TypeScript |
| Module System | ESM (`"type": "module"`) |
| Web Framework | Fastify 5 |
| Schema / Validation | TypeBox |
| ORM | Prisma 7 |
| Database | PostgreSQL |
| Test | Vitest |
| Logger | Pino, pino-pretty |
| Package Manager | npm workspaces |

## 프로젝트 구조

```text
fastify-api-rest/
  README.md
  package.json              # API 서버 의존성 및 실행 스크립트
  package-lock.json
  tsconfig.json             # 루트 tsconfig 상속, API 소스 범위 지정
  vite.config.ts            # Vitest 설정 및 coverage 설정
  prisma.config.ts          # Prisma CLI 설정
  .env                      # 로컬 개발 환경 변수
  .env.test                 # 테스트 환경 변수

  prisma/
    schema.prisma           # Prisma 모델 및 generator 설정
    migrations/             # DB migration 이력

  src/
    app.ts                  # Fastify 앱 생성, 플러그인/라우트/에러 핸들러 등록
    server.ts               # listen() 실행 진입점
    route.ts                # 도메인 라우트 중앙 등록
    common/                 # 공통 에러, 응답, 유틸
    config/                 # 환경 변수, Prisma 연결 설정
    generated/              # Prisma Client 생성 결과
    modules/                # 도메인별 API 모듈
    plugins/                # Fastify 플러그인
    types/                  # Fastify 타입 확장

  tests/
    modules/                # 도메인별 테스트
    modules/setup.ts        # 테스트 공통 설정

  docs/
    DEVELOPMENT_STANDARD.md # 개발 표준 문서
```

## 구현 도메인

| 도메인 | 주요 기능 |
| --- | --- |
| User | 사용자 생성, 수정, 조회, 목록, 중복 확인, soft delete, 복구 |
| Post | 게시글 생성, 수정, 삭제, 단건 조회, 커서 기반 목록 조회 |
| Reply | 댓글 생성, 수정, 삭제, 목록 조회 |
| PostLike | 게시글 좋아요, 좋아요 취소, 사용자별/게시글별 좋아요 목록 |
| PostFile | multipart 파일 업로드, 게시글 첨부, 다운로드, 삭제, 첨부 목록 |
| PostViewStat | bucket 기반 조회 수 집계, 통계 목록, 인기 게시글 조회 |

## 초기화

루트에서 전체 워크스페이스 의존성을 설치하는 방법을 권장합니다.

```bash
cd D:\NodejsDevelope\workspace\nodejs-practice-lab
npm install
```

이 프로젝트만 별도로 작업할 때는 하위 프로젝트에서 설치할 수도 있습니다.

```bash
cd D:\NodejsDevelope\workspace\nodejs-practice-lab\fastify-api-rest
npm install
```

## 패키지 구성

### Dependencies

| 패키지 | 용도 |
| --- | --- |
| `fastify` | HTTP 서버 프레임워크 |
| `@fastify/type-provider-typebox` | Fastify와 TypeBox 타입 provider 연결 |
| `@fastify/multipart` | multipart 파일 업로드 처리 |
| `@sinclair/typebox` | 요청/응답 schema 및 타입 정의 |
| `@prisma/client` | Prisma Client 런타임 |
| `@prisma/adapter-pg` | Prisma PostgreSQL adapter |
| `pg` | PostgreSQL 드라이버 |
| `fastify-plugin` | Fastify plugin 래핑 |
| `sql-formatter` | SQL 로그 포맷 보조 |

### Dev Dependencies

| 패키지 | 용도 |
| --- | --- |
| `prisma` | Prisma CLI |
| `vitest` | 테스트 러너 |
| `@vitest/coverage-v8` | V8 기반 coverage |
| `@vitest/ui` | Vitest UI/HTML 리포터 사용 시 활용 |
| `pino-pretty` | 개발 환경 로그 출력 포맷 |
| `@types/pg` | pg 타입 정의 |

## 환경 변수 설정

`fastify-api-rest/.env` 파일을 생성하거나 수정합니다.

```env
NODE_ENV="development"
HOST="0.0.0.0"
PORT="3000"
SERVICE_NAME="fastify-api-rest"
LOG_LEVEL="info"
LOG_PATH="./logs/app-dev.log"

DATABASE_URL="postgresql://user:password@localhost:5432/database?schema=public"

UPLOAD_DIR="./uploads"
UPLOAD_MAX_FILES="5"
UPLOAD_MAX_FILE_SIZE="10485760"

POOL_MAX="10"
POOL_MIN="2"
POOL_MAX_USES="7500"
POOL_IDLE_TIMEOUT_MILLIS="30000"
POOL_MAX_LIFETIME_SECONDS="5"
POOL_CONNECTION_TIMEOUT_MILLIS="5000"
```

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 실행 환경 |
| `HOST` | `0.0.0.0` | 서버 바인딩 주소 |
| `PORT` | `3000` | 서버 포트 |
| `SERVICE_NAME` | `unknown-service` | 서비스 이름 |
| `LOG_LEVEL` | `info` | 로그 레벨 |
| `LOG_PATH` | `./logs/app-dev.log` | 로그 파일 경로 |
| `DATABASE_URL` | 없음 | PostgreSQL 연결 문자열 |
| `UPLOAD_DIR` | `./uploads` | 업로드 파일 저장 경로 |
| `UPLOAD_MAX_FILES` | `5` | 요청당 최대 파일 수 |
| `UPLOAD_MAX_FILE_SIZE` | `10485760` | 파일당 최대 크기 |
| `POOL_MAX` | `10` | 최대 DB 커넥션 수 |
| `POOL_MIN` | `2` | 최소 유지 DB 커넥션 수 |
| `POOL_MAX_USES` | `7500` | 커넥션 최대 사용 횟수 |
| `POOL_IDLE_TIMEOUT_MILLIS` | `30000` | 유휴 커넥션 정리 시간 |
| `POOL_MAX_LIFETIME_SECONDS` | `5` | 커넥션 최대 수명 |
| `POOL_CONNECTION_TIMEOUT_MILLIS` | `5000` | 커넥션 획득 대기 시간 |

`DATABASE_SCHEMA`는 `DATABASE_URL`의 `schema` query parameter에서 자동 추출되며, 없으면 `public`을 사용합니다.

## Prisma 설정

Prisma schema는 `prisma/schema.prisma`에 있습니다.
Prisma Client는 `src/generated`로 생성되도록 설정되어 있습니다.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated"
}
```

대표 명령:

```bash
cd fastify-api-rest
npx prisma generate
npx prisma migrate dev
```

운영 또는 이미 적용된 migration 기준으로 DB를 맞출 때는 다음 명령을 사용합니다.

```bash
npx prisma migrate deploy
```

## Prisma 모델

| 모델 | 역할 |
| --- | --- |
| `User` | 사용자 계정, 로그인 식별 필드, soft delete |
| `Profile` | 사용자 확장 정보와 아바타 메타데이터 |
| `Post` | 게시글 본문, 공개 여부, 조회/좋아요/댓글 캐시 카운트 |
| `Reply` | 게시글 댓글 |
| `PostLike` | 사용자와 게시글의 명시적 다대다 좋아요 |
| `PostFile` | 업로드 파일 메타데이터와 게시글 연결 |
| `PostViewStat` | 시간 bucket 기반 게시글 조회 통계 |

## 실행

개발 서버 실행:

```bash
cd fastify-api-rest
npm run dev
```

기본 접속 주소:

```text
http://localhost:3000
```

`src/app.ts`에서 전체 API가 `/api` prefix로 등록되고, `src/route.ts`에서 도메인별 prefix가 추가됩니다.

## API Prefix

| Prefix | 모듈 |
| --- | --- |
| `/api/users` | 사용자 |
| `/api/posts` | 게시글 |
| `/api/files` | 파일 업로드/다운로드 |
| `/api/replies` | 댓글 |
| `/api/postlikes` | 게시글 좋아요 |
| `/api/viewstats` | 게시글 조회 통계 |

## 테스트

테스트 실행:

```bash
cd fastify-api-rest
npm test
```

Vitest 설정은 `vite.config.ts`에 있습니다.

| 설정 | 값 |
| --- | --- |
| 테스트 환경 | `node` |
| 테스트 대상 | `tests/**/*.test.ts` |
| 타임아웃 | `10000ms` |
| 파일 병렬 실행 | `false` |
| 커버리지 provider | `v8` |
| 커버리지 리포트 | `text`, `json`, `html` |
| 리포트 경로 | `coverage/` |

DB 통합 테스트가 포함되어 있으므로 테스트 전 `.env.test`와 테스트 DB 상태를 확인합니다.

## 소스 구조 규칙

도메인 모듈은 다음 계층을 기준으로 작성합니다.

```text
src/modules/{domain}/
  {domain}.route.ts        # HTTP route, schema 연결
  {domain}.controller.ts   # 요청 DTO를 서비스 호출로 변환
  {domain}.service.ts      # 비즈니스 로직
  {domain}.repository.ts   # Prisma 데이터 접근
  {domain}.dto.ts          # TypeBox schema와 타입
```

새 도메인을 추가할 때는 `src/modules/{domain}`을 만들고 `src/route.ts`에 route를 등록합니다.

## 공통 처리

| 경로 | 역할 |
| --- | --- |
| `src/common/errors` | 비즈니스 에러, 에러 코드, 전역 에러 핸들러 |
| `src/common/response` | 성공 응답 포맷 |
| `src/common/utils` | 공통 유틸 |
| `src/plugins/prisma.plugin.ts` | Fastify 인스턴스에 Prisma 연결 등록 |
| `src/types/fastify.d.ts` | Fastify 타입 확장 |

## 개발 참고 문서

상세한 개발 기준은 다음 문서를 우선 참고합니다.

```text
docs/DEVELOPMENT_STANDARD.md
```

## 주요 산출물

| 경로 | 설명 |
| --- | --- |
| `dist/` | TypeScript 빌드 결과 |
| `coverage/` | 테스트 커버리지 리포트 |
| `logs/` | 애플리케이션 로그 |
| `uploads/` | 업로드 파일 저장 경로 |
| `src/generated/` | Prisma Client 생성 결과 |

`src/generated`는 직접 수정하지 않고 `prisma/schema.prisma` 수정 후 `npx prisma generate`로 갱신합니다.
