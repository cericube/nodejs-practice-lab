import { redis } from './redis.client';

async function main() {
  try {
    await redis.connect();

    await redis.set('greeting', 'Hello, Redis!');
    const value = await redis.get('greeting');
    console.log('Value from Redis:', value);
  } catch (error) {
    console.error('Error in main:', error);
  } finally {
    await redis.close();
  }
}

main();
