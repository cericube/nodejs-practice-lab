import { describe, it, expect } from 'vitest';

import '../src/config';
describe('config', () => {
  it('should load redisUrl from environment variable', () => {
    expect(process.env.REDIS_URL).toBe('redis://:mypassword@localhost:6379');
  });
});
