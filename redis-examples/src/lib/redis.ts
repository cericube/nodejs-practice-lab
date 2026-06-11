import 'dotenv/config';
import { createClient } from 'redis';

// 환경 변수에서 Redis 연결 URL을 읽어옵니다.
const redisUrl = process.env.REDIS_URL;

// REDIS_URL이 정의되어 있지 않으면 애플리케이션 실행을 중단합니다.
if (!redisUrl) {
  throw new Error('REDIS_URL is not defined');
}

// Redis 클라이언트를 생성합니다. URL을 통해 Redis 서버에 연결하도록 설정합니다.
export const redis = createClient({
  url: redisUrl,
});

// Redis 클라이언트에서 발생하는 에러를 콘솔에 출력합니다.
redis.on('error', (error) => {
  console.error('[Redis Error]', error);
});

// Redis 연결을 초기화하는 함수입니다.
// 이미 연결되어 있지 않으면 connect()를 호출하여 서버에 연결합니다.
export async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }

  return redis;
}

// Redis 연결을 종료하는 함수입니다.
// 연결이 열려 있는 경우 quit()를 호출하여 안전하게 연결을 끊습니다.
export async function disconnectRedis() {
  if (redis.isOpen) {
    await redis.quit();
  }
}
