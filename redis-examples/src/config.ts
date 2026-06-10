import 'dotenv/config';
import process from 'process';

export const config = {
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
};
