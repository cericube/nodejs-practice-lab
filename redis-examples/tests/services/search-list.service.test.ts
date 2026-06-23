import { describe, expect, it } from 'vitest';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { SearchListService } from '../../src/services/search-list.service.js';
import '../setup.js';

describe('SearchListService', () => {
  const searchListService = new SearchListService();

  it('최근 검색어를 앞뒤 공백 제거 후 최신순으로 저장한다', async () => {
    const userId = 1;

    await searchListService.addRecentSearchKeyword(userId, '  Redis  ');
    await searchListService.addRecentSearchKeyword(userId, 'Node.js');

    await expect(searchListService.getRecentSearchKeywords(userId)).resolves.toEqual([
      { keyword: 'Node.js' },
      { keyword: 'Redis' },
    ]);
  });

  it('빈 검색어는 저장하지 않는다', async () => {
    const userId = 1;
    const key = RedisKey.list.searchRecent(userId);

    await searchListService.addRecentSearchKeyword(userId, '   ');

    await expect(redis.exists(key)).resolves.toBe(0);
  });

  it('이미 있는 검색어를 다시 저장하면 중복 없이 맨 앞으로 이동한다', async () => {
    const userId = 1;

    await searchListService.addRecentSearchKeyword(userId, 'Redis');
    await searchListService.addRecentSearchKeyword(userId, 'Node.js');
    await searchListService.addRecentSearchKeyword(userId, 'Redis');

    await expect(searchListService.getRecentSearchKeywords(userId)).resolves.toEqual([
      { keyword: 'Redis' },
      { keyword: 'Node.js' },
    ]);
  });

  it('limit 개수만 남기고 오래된 검색어를 제거한다', async () => {
    const userId = 1;

    await searchListService.addRecentSearchKeyword(userId, 'Redis', 2);
    await searchListService.addRecentSearchKeyword(userId, 'Node.js', 2);
    await searchListService.addRecentSearchKeyword(userId, 'Vitest', 2);

    await expect(searchListService.getRecentSearchKeywords(userId, 10)).resolves.toEqual([
      { keyword: 'Vitest' },
      { keyword: 'Node.js' },
    ]);
  });

  it('특정 최근 검색어를 삭제한다', async () => {
    const userId = 1;

    await searchListService.addRecentSearchKeyword(userId, 'Redis');
    await searchListService.addRecentSearchKeyword(userId, 'Node.js');

    await searchListService.deleteRecentSearchKeyword(userId, ' Redis ');

    await expect(searchListService.getRecentSearchKeywords(userId)).resolves.toEqual([
      { keyword: 'Node.js' },
    ]);
  });

  it('빈 검색어 삭제 요청은 Redis 명령을 실행하지 않는다', async () => {
    const userId = 1;

    await searchListService.addRecentSearchKeyword(userId, 'Redis');
    await searchListService.deleteRecentSearchKeyword(userId, '   ');

    await expect(searchListService.getRecentSearchKeywords(userId)).resolves.toEqual([
      { keyword: 'Redis' },
    ]);
  });

  it('사용자의 최근 검색어 목록을 전체 삭제한다', async () => {
    const userId = 1;
    const key = RedisKey.list.searchRecent(userId);

    await searchListService.addRecentSearchKeyword(userId, 'Redis');

    await searchListService.clearRecentSearchKeywords(userId);

    await expect(redis.exists(key)).resolves.toBe(0);
    await expect(searchListService.getRecentSearchKeywords(userId)).resolves.toEqual([]);
  });
});
