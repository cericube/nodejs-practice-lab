# 🧱 Node.js Practice Lab (Fastify + Prisma)

이 저장소는 **Node.js / TypeScript 기반 백엔드 실습을 위한 모노레포**입니다.
루트에는 공통 개발 도구를 두고, 실제 애플리케이션은
**Fastify + Prisma 기반 REST API 프로젝트**로 구성되어 있습니다.

---

## 1. 프로젝트 초기화 및 패키지 설치

이 프로젝트는 **npm workspaces 기반 모노레포** 구조를 사용합니다.

- 루트: 공통 개발 도구 관리 (실행 코드 없음)
- 서브 프로젝트: `fastify-api-rest` (실제 서버 실행)

---

### 1.1 프로젝트 폴더 생성

```bash
mkdir nodejs-practice-lab
cd nodejs-practice-lab
mkdir fastify-api-rest
```

---

### 1.2 루트 프로젝트 초기화 (공통 개발 도구)

```bash
npm init -y
```

루트에는 **ESLint / Prettier / TypeScript 등 공통 도구만 설치**합니다.

```bash
npm install -D \
  typescript \
  @types/node \
  tsx \
  eslint \
  @eslint/js \
  @eslint/json \
  globals \
  prettier \
  eslint-config-prettier \
  typescript-eslint
```

---

### 1.3 fastify-api-rest 서브 프로젝트 초기화

```bash
cd fastify-api-rest
npm init -y
```

#### 런타임 의존성 설치

```bash
npm install \
  fastify \
  @fastify/type-provider-typebox \
  @sinclair/typebox \
  @prisma/client \
  pg
```

#### 개발 전용 의존성 설치

```bash
npm install -D \
  prisma \
  pino-pretty \
  vitest \
  @vitest/ui \
  @vitest/coverage-v8 \
  @types/pg
```

---

### 1.4 Prisma 초기화 (최초 1회)

```bash
npx prisma init
```

다음 파일이 생성됩니다.

- `.env`
- `prisma/schema.prisma`

---

### 1.5 워크스페이스 설정

루트 `package.json`에 워크스페이스를 선언합니다.

```json
{
  "name": "nodejs-practice-lab",
  "private": true,
  "type": "module",
  "workspaces": ["fastify-api-rest"],
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

이후에는 루트에서 **한 번만** 설치하면 됩니다.

```bash
cd ..
npm install
```

---

## 2. 전체 디렉터리 구조

```text
nodejs-practice-lab/
├── node_modules/
├── package.json              # 루트 (공통 개발 도구)
├── eslint.config.mjs
├── .prettierrc
│
└── fastify-api-rest/          # Fastify REST API 실습 프로젝트
    ├── package.json
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    ├── src/
    │   ├── server.ts
    │   ├── app.ts
    │   ├── plugins/
    │   ├── routes/
    │   └── modules/
    └── tsconfig.json
```

---

## 3. Root 프로젝트 설명

### 3.1 루트 package.json

루트는 **코드 실행용이 아니라 공통 개발 도구 관리용**입니다.

```json
{
  "name": "nodejs-practice-lab",
  "private": true,
  "type": "module",
  "workspaces": ["fastify-api-rest"],
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

#### 역할

- ESLint / Prettier **전역 규칙 통합**
- TypeScript, tsx **공통 버전 고정**
- 워크스페이스 기반 **의존성 관리**

---

## 4. Fastify REST API 프로젝트

### 4.1 fastify-api-rest/package.json

```json
{
  "name": "fastify-api-rest",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch ./src/server.ts"
  }
}
```

### 사용 기술 스택

| 영역        | 기술          |
| ----------- | ------------- |
| HTTP Server | Fastify v5    |
| Schema      | TypeBox       |
| ORM         | Prisma 7      |
| DB Driver   | pg            |
| Runtime     | Node.js (ESM) |
| Dev Server  | tsx           |
| Logger      | pino          |

---

## 5. 실행 방법

### 5.1 개발 서버 실행

```bash
cd fastify-api-rest
npm run dev
```

- `src/server.ts`가 실행됩니다.
- Fastify 개발 서버가 기동됩니다.

---

## 6. TypeScript & ESM 정책

- 모든 프로젝트는 `"type": "module"` 기반
- Node.js ESM + `tsx` 조합
- CommonJS 사용하지 않음
- 상대 경로 import 시 확장자 없이 사용 가능 (`tsx` 처리)

---

## 7. ESLint / Prettier 정책

- **루트에서만 설정**
- 모든 워크스페이스에 자동 적용
- Fastify + TypeScript 실무 기준

```bash
# 전체 린트
npm run lint

# 전체 포맷
npm run format
```

---

## 8. 이 레포의 목적

이 레포는 다음을 목표로 합니다.

- Fastify v5 실전 구조 학습
- TypeBox 기반 Schema-first REST API 설계
- Prisma 7 실무 패턴 정리
- 모노레포 + 워크스페이스 운영 경험
- 이후 GraphQL / Auth / Test / Observability 확장 기반

---

## 9. 권장 작업 방식

> ⚠️ **항상 서브 프로젝트(`fastify-api-rest`) 디렉터리에서 실행**

```bash
cd fastify-api-rest
npm run dev
```

루트는 **도구 관리 전용**이며 서버를 실행하지 않습니다.
