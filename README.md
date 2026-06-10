# Node.js Practice Lab

Node.js와 TypeScript 기반 백엔드 개발을 연습하기 위한 워크스페이스입니다.
루트 프로젝트는 공통 개발 도구와 하위 실습 프로젝트를 관리하고, 실제 REST API 서버 구현은 `fastify-api-rest` 하위 프로젝트에 분리되어 있습니다.

## 프로젝트 구성

```text
nodejs-practice-lab/
  README.md                 # 워크스페이스 전체 안내 문서
  package.json              # npm workspaces 및 공통 개발 스크립트
  package-lock.json         # 루트 의존성 lock 파일
  tsconfig.json             # 공통 TypeScript 설정
  eslint.config.mjs         # 공통 ESLint 설정
  .prettierrc               # 공통 Prettier 설정
  .vscode/                  # VS Code 개발 환경 설정

  fastify-api-rest/         # Fastify REST API 실습 프로젝트
    README.md               # API 프로젝트 전용 안내 문서
    package.json            # API 서버 실행/테스트 스크립트
    prisma/                 # Prisma schema 및 migrations
    src/                    # Fastify API 서버 소스
    tests/                  # Vitest 테스트
    docs/                   # 개발 표준 문서

  redis-examples/           # Redis 예제 실습 영역
    package.json
```

## 프로젝트 역할 분리

| 경로 | 역할 |
| --- | --- |
| `./` | 워크스페이스 루트, 공통 개발 도구, TypeScript/ESLint/Prettier 설정 관리 |
| `./fastify-api-rest` | Fastify, TypeBox, Prisma, PostgreSQL 기반 REST API 서버 |
| `./redis-examples` | Redis 예제 실습을 위한 별도 영역 |

루트 README는 저장소 전체 구조와 공통 작업 방법만 설명합니다.
Fastify 서버의 실행, DB 설정, Prisma, API 구조는 `fastify-api-rest/README.md`에서 관리합니다.

## 개발 환경

이 워크스페이스는 Windows 환경에서 Node.js 20.x를 사용하는 것을 기준으로 합니다.
VS Code 터미널에서는 다음처럼 Node.js 경로를 먼저 잡아 사용할 수 있습니다.

```json
{
  "terminal.integrated.env.windows": {
    "PATH": "D:\\NodejsDevelope\\node-v20.19.5;${env:PATH}"
  }
}
```

확인 명령:

```bash
node -v
npm -v
```

## 루트 프로젝트 초기화

새 환경에서 저장소를 받은 뒤 루트에서 의존성을 설치합니다.

```bash
cd D:\NodejsDevelope\workspace\nodejs-practice-lab
npm install
```

루트 `package.json`은 npm workspaces를 사용하며 현재 `fastify-api-rest`가 워크스페이스로 등록되어 있습니다.

```json
{
  "workspaces": ["fastify-api-rest"]
}
```

따라서 루트에서 `npm install`을 실행하면 루트 공통 개발 도구와 `fastify-api-rest` 의존성이 함께 설치됩니다.

## 루트 패키지 구성

루트에는 실행 서버가 아니라 공통 개발 도구가 설치되어 있습니다.

| 구분 | 패키지 |
| --- | --- |
| TypeScript | `typescript`, `tsx`, `@types/node` |
| Lint | `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`, `globals` |
| Format | `prettier` |

## 루트 명령

```bash
npm run lint
npm run format
```

| 명령 | 설명 |
| --- | --- |
| `npm run lint` | 전체 워크스페이스 ESLint 검사 |
| `npm run format` | 전체 워크스페이스 Prettier 포맷 적용 |

API 서버 실행과 테스트는 `fastify-api-rest` 프로젝트에서 수행합니다.

```bash
cd fastify-api-rest
npm run dev
npm test
```

## TypeScript 공통 설정

루트 `tsconfig.json`은 하위 프로젝트가 상속할 공통 TypeScript 정책입니다.

주요 설정:

| 옵션 | 값 | 설명 |
| --- | --- | --- |
| `target` | `ES2022` | Node.js 20.x 환경에 맞춘 출력 문법 |
| `module` | `ESNext` | ESM import/export 사용 |
| `moduleResolution` | `bundler` | tsx, Vite 계열 도구에 적합한 모듈 해석 |
| `strict` | `true` | 엄격한 타입 검사 활성화 |
| `isolatedModules` | `true` | 파일별 독립 모듈 처리 |

루트는 공통 설정 저장소 역할이므로 `include`는 `dummy.ts`만 포함하여 입력 파일 없음 오류를 피합니다.
실제 API 서버 소스는 `fastify-api-rest/tsconfig.json`에서 별도로 지정합니다.

## 하위 프로젝트 시작 가이드

### Fastify REST API

```bash
cd fastify-api-rest
npm install
npm run dev
```

자세한 설정과 실행 방법은 [fastify-api-rest/README.md](./fastify-api-rest/README.md)를 참고합니다.

### Redis Examples

```bash
cd redis-examples
npm install
```

현재 `redis-examples`는 예제 실습 영역만 준비되어 있으며, 실행 스크립트는 아직 구성되어 있지 않습니다.

## 산출물과 관리 대상

다음 경로는 설치, 빌드, 테스트, 실행 과정에서 생성되는 산출물입니다.

| 경로 | 설명 |
| --- | --- |
| `node_modules/` | npm 패키지 설치 결과 |
| `fastify-api-rest/dist/` | TypeScript 빌드 결과 |
| `fastify-api-rest/coverage/` | Vitest 커버리지 리포트 |
| `fastify-api-rest/logs/` | 애플리케이션 로그 |
| `fastify-api-rest/uploads/` | 파일 업로드 저장 경로 |
| `fastify-api-rest/src/generated/` | Prisma Client 생성 결과 |

Prisma 관련 변경은 `fastify-api-rest/prisma/schema.prisma`를 먼저 수정한 뒤 API 프로젝트에서 Prisma 생성 명령을 실행합니다.
