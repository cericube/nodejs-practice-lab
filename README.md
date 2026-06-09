# Node.js Practice Lab

Node.js와 TypeScript 기반 백엔드 실습을 위한 워크스페이스입니다.
루트는 ESLint, Prettier, TypeScript 같은 공통 개발 도구를 관리하고, 실제 실행 가능한 애플리케이션은 `fastify-api-rest`에 있습니다.

## 프로젝트 개요

`fastify-api-rest`는 Fastify, TypeBox, Prisma, PostgreSQL을 조합해 REST API 서버를 구성하는 실습 프로젝트입니다. 도메인별로 Route, Controller, Service, Repository 계층을 나누고, TypeBox 스키마로 요청 검증과 응답 직렬화를 수행합니다.

주요 구현 범위는 다음과 같습니다.

| 영역      | 내용                                                        |
| --------- | ----------------------------------------------------------- |
| 사용자    | 사용자 생성, 수정, 조회, 목록, 중복 확인, soft delete, 복구 |
| 게시글    | 게시글 생성, 수정, 삭제, 단건 조회, 커서 기반 목록 조회     |
| 댓글      | 댓글 생성, 수정, 삭제, 목록 조회                            |
| 좋아요    | 게시글 좋아요, 좋아요 취소, 사용자별/게시글별 좋아요 목록   |
| 파일      | multipart 업로드, 게시글 첨부, 다운로드, 삭제, 첨부 목록    |
| 조회 통계 | bucket 기반 조회 수 합계, 목록, 인기 게시글 조회            |

## 기술 스택

| 영역                | 기술                     |
| ------------------- | ------------------------ |
| Runtime             | Node.js 20.x             |
| Language            | TypeScript               |
| Module System       | ESM (`"type": "module"`) |
| Web Framework       | Fastify 5                |
| Schema / Validation | TypeBox                  |
| ORM                 | Prisma 7                 |
| Database            | PostgreSQL               |
| Test                | Vitest                   |
| Logger              | Pino, pino-pretty        |
| Package Manager     | npm workspaces           |

## 디렉터리 구조

```text
nodejs-practice-lab/
  package.json               # 루트 워크스페이스 및 공통 개발 도구
  eslint.config.mjs          # ESLint 공통 설정
  .prettierrc                # Prettier 공통 설정
  tsconfig.json              # 루트 TypeScript 설정

  fastify-api-rest/
    package.json             # API 서버 실행/테스트 스크립트
    prisma/
      schema.prisma          # Prisma 모델
      migrations/            # DB 마이그레이션
    src/
      app.ts                 # Fastify 앱 생성, 플러그인/라우트 등록
      server.ts              # 실제 listen() 실행 진입점
      route.ts               # 도메인 라우트 중앙 등록
      common/                # 공통 응답, 에러, 유틸
      config/                # 환경 변수, Prisma 설정
      generated/             # Prisma generated client
      modules/               # 도메인별 API 모듈
      plugins/               # Fastify plugin
      types/                 # Fastify 타입 확장
    tests/                   # Vitest 테스트
    docs/
      DEVELOPMENT_STANDARD.md
```

`dist`, `coverage`, `logs`, `uploads`, `node_modules`, `src/generated`는 빌드/실행/생성 산출물입니다. `src/generated` 변경이 필요하면 `prisma/schema.prisma`를 수정한 뒤 Prisma 생성 절차를 따릅니다.

## 실행 준비

이 저장소는 Windows 개발 환경에서 Node.js 경로를 다음처럼 잡는 것을 기준으로 합니다.

```json
{
  "terminal.integrated.env.windows": {
    "PATH": "D:\\NodejsDevelope\\node-v20.19.5;${env:PATH}"
  }
}
```

의존성은 루트에서 한 번에 설치합니다.

```bash
npm install
```

API 서버는 PostgreSQL 연결이 필요합니다. `fastify-api-rest/.env`에 최소한 `DATABASE_URL`을 설정합니다.

```env
DATABASE_URL="postgresql://user:password@localhost:5432/database?schema=public"
NODE_ENV="development"
HOST="0.0.0.0"
PORT="3000"
LOG_LEVEL="info"
```

파일 업로드와 DB 커넥션 풀은 다음 환경 변수로 조정할 수 있습니다.

| 변수                   | 기본값               | 설명                     |
| ---------------------- | -------------------- | ------------------------ |
| `UPLOAD_DIR`           | `./uploads`          | 업로드 파일 저장 경로    |
| `UPLOAD_MAX_FILES`     | `5`                  | 요청당 최대 파일 수      |
| `UPLOAD_MAX_FILE_SIZE` | `10485760`           | 파일당 최대 크기         |
| `POOL_MAX`             | `10`                 | 최대 DB 커넥션 수        |
| `POOL_MIN`             | `2`                  | 최소 유지 DB 커넥션 수   |
| `LOG_PATH`             | `./logs/app-dev.log` | 운영 모드 파일 로그 경로 |

## 실행 방법

개발 서버는 `fastify-api-rest` 워크스페이스에서 실행합니다.

```bash
cd fastify-api-rest
npm run dev
```

기본 설정에서는 다음 주소로 서버가 기동됩니다.

```text
http://localhost:3000
```

모든 API는 `src/app.ts`에서 `/api` prefix로 등록됩니다.

## 테스트

테스트는 Vitest로 실행합니다.

```bash
cd fastify-api-rest
npm test
```

테스트 설정은 `fastify-api-rest/vite.config.ts`에 있으며, `tests/**/*.test.ts`를 대상으로 합니다. DB 통합 테스트가 포함되어 있어 파일 단위 병렬 실행은 꺼져 있습니다.

커버리지 리포트는 테스트 실행 후 `fastify-api-rest/coverage`에 생성됩니다.

## Prisma

Prisma schema는 `fastify-api-rest/prisma/schema.prisma`에 있습니다.

현재 모델은 다음 도메인을 기준으로 구성되어 있습니다.

| 모델           | 역할                                       |
| -------------- | ------------------------------------------ |
| `User`         | 사용자 계정, soft delete                   |
| `Profile`      | 사용자 확장 정보 및 아바타 메타데이터      |
| `Post`         | 게시글 본문과 조회/좋아요/댓글 캐시 카운트 |
| `Reply`        | 게시글 댓글                                |
| `PostLike`     | 사용자와 게시글의 명시적 다대다 좋아요     |
| `PostFile`     | 게시글 첨부 파일 메타데이터                |
| `PostViewStat` | 시간 bucket 기반 게시글 조회 통계          |

대표 명령은 API 프로젝트 안에서 실행합니다.

```bash
cd fastify-api-rest
npx prisma generate
npx prisma migrate dev
```

## API Prefix

`src/route.ts`에서 도메인 라우트가 중앙 등록됩니다.

| Prefix           | 모듈                 |
| ---------------- | -------------------- |
| `/api/users`     | 사용자               |
| `/api/posts`     | 게시글               |
| `/api/files`     | 파일 업로드/다운로드 |
| `/api/replies`   | 댓글                 |
| `/api/postlikes` | 게시글 좋아요        |
| `/api/viewstats` | 게시글 조회 통계     |

공통 응답은 `success(data)` 형태로 감싸며, 전역 에러 처리는 `src/common/errors/error.handler.ts`에서 담당합니다.

## 개발 규칙

새 기능은 기존 모듈 구조를 따릅니다.

```text
src/modules/{domain}/
  {domain}.route.ts        # HTTP route, schema 연결
  {domain}.controller.ts   # 요청 DTO를 서비스 호출로 변환
  {domain}.service.ts      # 비즈니스 로직
  {domain}.repository.ts   # Prisma 데이터 접근
  {domain}.dto.ts          # TypeBox schema와 타입
```

더 자세한 개발 기준은 `fastify-api-rest/docs/DEVELOPMENT_STANDARD.md`를 우선 참고합니다.

## 루트 명령

루트에서는 전체 워크스페이스에 공통 도구를 실행합니다.

```bash
npm run lint
npm run format
```

서버 실행과 테스트는 실제 애플리케이션이 있는 `fastify-api-rest`에서 수행합니다.
