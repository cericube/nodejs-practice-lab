import { createClient } from 'redis';
import { config } from './config';

export const redis = createClient({
  url: config.redisUrl,
});

redis.on('error', (error) => {
  console.error('[Redis] Client Error:', error);
});

redis.on('connect', () => {
  console.log('[Redis] Connecting...');
});

redis.on('ready', () => {
  console.log('[Redis] Ready');
});

redis.on('end', () => {
  console.log('[Redis] Connection closed');
});

export async function connect() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function close() {
  if (redis.isOpen) {
    await redis.close();
  }
}
