import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import '../setup.js';

describe('Redis Connection', () => {
  it('Redis에 값을 저장하고 조회할 수 있다', async () => {
    await redis.set('greeting', 'Hello, Redis!');

    const value = await redis.get('greeting');

    expect(value).toBe('Hello, Redis!');
  });
});
