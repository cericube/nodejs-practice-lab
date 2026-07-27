import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { SearchZSetservice } from '../../src/services/search-zset.service.js';
import '../setup.js';

describe('SearchZSetservice', () => {
  const service = new SearchZSetservice();

  it('검색어를 정규화해 점수를 누적한다', async () => {
    await expect(service.increaseSearchKeywordScore(' Redis ', 2)).resolves.toBe(2);
    await expect(service.increaseSearchKeywordScore('redis', 3)).resolves.toBe(5);
    await expect(service.getKeywordScore(' REDIS ')).resolves.toBe(5);
  });

  it('빈 검색어의 점수 증가는 거부하고 조회 결과는 기본값을 반환한다', async () => {
    await expect(service.increaseSearchKeywordScore('   ')).rejects.toThrow(
      '검색어가 비어 있습니다.',
    );
    await expect(service.getKeywordScore('   ')).resolves.toBe(0);
    await expect(service.getKeywordRank('   ')).resolves.toBeNull();
  });

  it('점수가 높은 순서로 인기 검색어와 순위를 반환한다', async () => {
    await service.increaseSearchKeywordScore('node', 3);
    await service.increaseSearchKeywordScore('redis', 10);
    await service.increaseSearchKeywordScore('typescript', 5);

    await expect(service.getPopularKeywords(2)).resolves.toEqual([
      { keyword: 'redis', score: 10, rank: 1 },
      { keyword: 'typescript', score: 5, rank: 2 },
    ]);
    await expect(service.getKeywordRank('node')).resolves.toBe(3);
    await expect(service.getKeywordRank('missing')).resolves.toBeNull();
  });

  it('검색어를 제거하고 랭킹 전체를 초기화한다', async () => {
    await service.increaseSearchKeywordScore('redis', 2);
    await service.removeKeyword(' REDIS ');
    await expect(service.getKeywordScore('redis')).resolves.toBe(0);

    await service.increaseSearchKeywordScore('node', 1);
    await service.clearSearchRanking();
    await expect(redis.exists(RedisKey.zset.searchRanking())).resolves.toBe(0);
  });
});
