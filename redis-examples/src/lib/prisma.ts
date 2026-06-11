// dotenv를 즉시 로드하여 .env 파일에 정의된 환경 변수가 process.env에 반영되도록 합니다.
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// .env 파일에 정의된 DATABASE_URL 값을 읽어옵니다.
// 이 값은 데이터베이스 연결 문자열 역할을 합니다.
const connectionString = process.env.DATABASE_URL;

// DATABASE_URL이 없으면 바로 예외를 던져 실행 시점에 원인을 알 수 있게 합니다.
if (!connectionString) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

// Prisma에 전달할 Better SQLite3 어댑터 인스턴스를 생성합니다.
// PrismaClient는 이 어댑터를 통해 실제 SQLite 데이터베이스에 연결합니다.
const adapter = new PrismaBetterSqlite3({
  url: connectionString,
});

// Prisma 클라이언트를 생성하여 애플리케이션에서 재사용할 수 있도록 export 합니다.
// 다른 모듈에서 import { prisma } from './lib/prisma' 형태로 사용합니다.
export const prisma = new PrismaClient({
  adapter,
});
