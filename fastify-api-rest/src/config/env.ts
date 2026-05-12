// src/config/env.ts

import 'dotenv/config';
import process from 'process';

// db connectionString에서 schema이름만 추출한다.
// 없느면 기본 public를 반환한다.
function resolveSchemaFromConnectionString(connectionString?: string): string {
  try {
    const url = new URL(connectionString ?? '');
    // Prisma/Postgres connection string에서 schema 파라미터 읽기
    const schema = url.searchParams.get('schema');
    return schema && schema.trim() !== '' ? schema : 'public';
  } catch (err) {
    // connection string이 잘못된 경우 fallback
    return 'public';
  }
}

// 환경 변수를 기본값과 함께 묶어 앱 설정으로 제공한다.
export const env = {
  // 실행 환경 (기본값: development)
  NODE_ENV: process.env.NODE_ENV || 'development',

  // 서버 바인딩 주소/포트 및 로깅
  HOST: process.env.HOST || '0.0.0.0',
  PORT: process.env.PORT ? Number(process.env.PORT) : 3000,
  SERVICE_NAME: process.env.SERVICE_NAME || 'unknown-service',

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_PATH: process.env.LOG_PATH || './logs/app-dev.log',

  // upload
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  // 파일 첨부 갯수 제한(글당)
  UPLOAD_MAX_FILES: Number(process.env.UPLOAD_MAX_FILES) || 5,
  UPLOAD_MAX_FILE_SIZE: Number(process.env.UPLOAD_MAX_FILE_SIZE) || 10485760,

  // DB 연결 문자열 (미설정 시 빈 문자열)
  DATABASE_SCHEMA: resolveSchemaFromConnectionString(process.env.DATABASE_URL),
  DATABASE_URL: process.env.DATABASE_URL,

  // 최대 커넥션 수
  POOL_MAX: process.env.POOL_MAX ? Number(process.env.POOL_MAX) : 10,
  // 최소 유지 커넥션 수
  POOL_MIN: process.env.POOL_MIN ? Number(process.env.POOL_MIN) : 2,
  // 커넥션 최대 사용회수, 사용회수 초과시 새 연결로 교체
  POOL_MAX_USES: process.env.POOL_MAX_USES ? Number(process.env.POOL_MAX_USES) : 7500,
  // 유휴 커넥션 정리 시간 (ms) ,안 쓰면 30초 후 정리
  POOL_IDLE_TIMEOUT_MILLIS: process.env.POOL_IDLE_TIMEOUT_MILLIS
    ? Number(process.env.POOL_IDLE_TIMEOUT_MILLIS)
    : 30_000,
  // 커넥션 최대 수명 (초), 5분마다 새 연결로 교체
  POOL_MAX_LIFETIME_SECONDS: process.env.POOL_MAX_LIFETIME_SECONDS
    ? Number(process.env.POOL_MAX_LIFETIME_SECONDS)
    : 5,
  // 커넥션 획득 대기 시간 (ms)
  POOL_CONNECTION_TIMEOUT_MILLIS: process.env.POOL_CONNECTION_TIMEOUT_MILLIS
    ? Number(process.env.POOL_CONNECTION_TIMEOUT_MILLIS)
    : 5_000,
};
