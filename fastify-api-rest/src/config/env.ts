// src/config/env.ts

import 'dotenv/config';
import process from 'process';

// 환경 변수를 기본값과 함께 묶어 앱 설정으로 제공한다.

const databaseSchema = process.env.DATABASE_SCHEMA || 'public';
const databaseUrl = `${process.env.DATABASE_URL || ''}?schema=${databaseSchema}`;

export const env = {
  // 실행 환경 (기본값: development)
  NODE_ENV: process.env.NODE_ENV || 'development',

  // 서버 바인딩 주소/포트 및 로깅
  HOST: process.env.HOST || '0.0.0.0',
  PORT: process.env.PORT ? Number(process.env.PORT) : 3000,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_PATH: process.env.LOG_PATH || './logs/app-dev.log',

  // DB 연결 문자열 (미설정 시 빈 문자열)
  DATABASE_SCHEMA: databaseSchema,
  DATABASE_URL: databaseUrl,
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX ? Number(process.env.DATABASE_POOL_MAX) : 20,
  DATABASE_POOL_IDLE_TIMEOUT: process.env.DATABASE_POOL_IDLE_TIMEOUT
    ? Number(process.env.DATABASE_POOL_IDLE_TIMEOUT)
    : 30000,
};
