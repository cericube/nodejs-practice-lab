import js from '@eslint/js'; // v9.39.2
import globals from 'globals'; // v17.0.0
import tseslint from 'typescript-eslint'; // v8.52.0
import json from '@eslint/json'; // v0.14.0
import prettier from 'eslint-config-prettier'; // v10.1.8
import { defineConfig } from 'eslint/config'; // eslint v9.39.2

export default defineConfig([
  /**
   * --------------------------------------------------------------------
   * 1. 전역 무시 패턴 설정
   * --------------------------------------------------------------------
   * - 적용 기준:
   *   ESLint v9.39.2 (Flat Config 기본 구조)
   *
   * - ESLint가 검사하지 않아야 할 파일/폴더를 지정합니다.
   * - node_modules, 빌드 산출물, 커버리지 결과물 등은
   *   린트 대상이 아니므로 미리 제외합니다.
   *
   * - Flat Config에서는 ignores 설정을
   *   설정 배열의 가장 앞에 두는 것이 공식적으로 권장됩니다.
   */
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/coverage/**'],
  },

  /**
   * --------------------------------------------------------------------
   * 2. JavaScript / TypeScript Recommended Config 적용
   * --------------------------------------------------------------------
   * - 적용 패키지 및 버전:
   *   - @eslint/js v9.39.2
   *   - typescript-eslint v8.52.0
   *
   * - @eslint/js:
   *   ESLint 공식 JavaScript 권장 규칙 세트입니다.
   *   최신 ECMAScript 문법과 일반적인 코드 품질 규칙을 포함합니다.
   *
   * - typescript-eslint:
   *   TypeScript AST 파싱 및 타입 기반 정적 분석을 수행하며,
   *   TS 전용 권장 규칙을 제공합니다.
   *
   * - tseslint.configs.recommended 는 배열 형태이므로
   *   스프레드 연산자(...)로 풀어서 등록합니다.
   */
  js.configs.recommended,
  ...tseslint.configs.recommended,

  /**
   * --------------------------------------------------------------------
   * 3. JavaScript + TypeScript 공통 Language Options 설정
   * --------------------------------------------------------------------
   * - 적용 기준:
   *   - ESLint v9.39.2 (Flat Config)
   *   - globals v17.0.0
   *
   * - Flat Config에서는 기존 parserOptions 대신
   *   languageOptions 객체를 사용합니다.
   *
   * - ecmaVersion: 'latest'
   *   → 현재 설치된 ESLint가 지원하는 최신 ECMAScript 문법을 활성화합니다.
   *
   * - sourceType: 'module'
   *   → ESM(import/export) 기반 프로젝트 구조를 사용합니다.
   *
   * - globals.node (globals v17.0.0):
   *   → Node.js 런타임에서 제공되는 전역 변수(process, Buffer 등)를
   *     ESLint가 미정의 변수로 오탐하지 않도록 설정합니다.
   */
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  /**
   * --------------------------------------------------------------------
   * 4. JSON 파일 전용 규칙 설정 (@eslint/json 최신 방식)
   * --------------------------------------------------------------------
   * - 적용 패키지 및 버전:
   *   - @eslint/json v0.14.0
   *
   * - JSON 파일은 JavaScript 파서로 해석할 수 없기 때문에
   *   전용 language 설정이 필요합니다.
   *
   * - @eslint/json 최신 버전에서는
   *   parser 대신 language 키워드를 사용합니다.
   *
   *   language: 'json/json'
   *   → JSON 문법을 올바르게 파싱하고 구조 오류를 검증합니다.
   *
   * - json.configs.recommended.rules:
   *   → 잘못된 JSON 문법, 중복 키, 구조 오류 등을 자동 검출합니다.
   */
  {
    files: ['**/*.json'],
    plugins: { json },
    language: 'json/json',
    rules: {
      ...json.configs.recommended.rules,
    },
  },

  /**
   * --------------------------------------------------------------------
   * 5. Prettier와 ESLint 규칙 충돌 방지
   * --------------------------------------------------------------------
   * - 적용 패키지 및 버전:
   *   - prettier v3.7.4
   *   - eslint-config-prettier v10.1.8
   *
   * - eslint-config-prettier는
   *   코드 포맷팅과 충돌하는 ESLint 규칙을 모두 비활성화합니다.
   *
   * - 실제 코드 스타일(들여쓰기, 줄바꿈, 따옴표 등)은
   *   Prettier가 전담하도록 역할을 분리합니다.
   *
   * - 반드시 설정 배열의 가장 마지막에 위치해야
   *   앞에서 정의한 규칙들을 올바르게 덮어쓸 수 있습니다.
   */
  prettier,
]);
