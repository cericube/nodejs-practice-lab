// src/services/search-list.service.ts

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

/**
 * 최근 검색어 목록 조회 시 반환하는 검색어 데이터입니다.
 *
 * Redis List가 이미 최신순을 유지하므로 별도의 order 값은 내려주지 않습니다.
 */
export type RecentSearchKeywordOutput = {
  keyword: string;
};

/**
 * 검색어 저장 전에 앞뒤 공백을 제거합니다.
 *
 * 1. 사용자가 입력한 원본 검색어를 받습니다.
 * 2. Redis에 저장하기 전에 trim으로 앞뒤 공백을 제거합니다.
 */
function normalizeKeyword(keyword: string): string {
  return keyword.trim();
}

export class SearchListService {
  /**
   * 사용자의 최근 검색어를 Redis List에 기록합니다.
   *
   * 1. 검색어 앞뒤 공백을 제거합니다.
   * 2. 빈 검색어는 저장하지 않습니다.
   * 3. 같은 검색어가 이미 있으면 먼저 제거해서 중복을 방지합니다.
   * 4. 새 검색어를 List 앞쪽에 넣어 최신순을 유지합니다.
   * 5. 지정한 개수만 남기고 오래된 검색어는 잘라냅니다.
   *
   * 실습 포인트:
   * Redis List는 입력 순서를 유지하므로 최근 검색어처럼 순서가 중요한 기록에 적합합니다.
   *
   * 참고:
   * 같은 검색어를 다시 검색하면 기존 위치의 값을 제거한 뒤 맨 앞으로 옮기는 방식으로 최신 기록을 갱신합니다.
   */
  async addRecentSearchKeyword(userId: number, keyword: string, limit = 10): Promise<void> {
    const normalizedKeyword = normalizeKeyword(keyword);

    if (!normalizedKeyword) {
      return;
    }

    const key = RedisKey.list.searchRecent(userId);

    // LREM은 List 안에서 지정한 값을 제거합니다. count 0은 모든 위치의 일치 값을 지운다는 뜻입니다.
    await redis.lRem(key, 0, normalizedKeyword);

    // LPUSH는 값을 List 왼쪽에 추가합니다. 여기서는 왼쪽을 최신 검색어 위치로 사용합니다.
    await redis.lPush(key, normalizedKeyword);

    // LTRIM은 지정한 인덱스 범위만 남깁니다. 0부터 limit - 1까지만 유지해 List 길이를 제한합니다.
    await redis.lTrim(key, 0, limit - 1);
  }

  /**
   * Redis List에서 최근 검색어 목록을 최신순으로 조회합니다.
   *
   * 1. 사용자별 최근 검색어 List key를 만듭니다.
   * 2. Redis List의 앞쪽부터 limit개만 읽습니다.
   * 3. 조회한 문자열 목록을 응답 객체 배열로 변환합니다.
   *
   * 실습 포인트:
   * LRANGE는 List의 일부 구간을 조회할 때 사용합니다.
   *
   * 참고:
   * Redis List가 이미 순서를 보장하므로 order 같은 별도 순번 필드는 만들지 않습니다.
   */
  async getRecentSearchKeywords(userId: number, limit = 10): Promise<RecentSearchKeywordOutput[]> {
    const key = RedisKey.list.searchRecent(userId);

    // LRANGE는 시작 인덱스부터 끝 인덱스까지의 값을 가져옵니다. 0부터 읽으면 최신 검색어부터 조회됩니다.
    const keywords = await redis.lRange(key, 0, limit - 1);

    return keywords.map((keyword) => ({
      keyword,
    }));
  }

  /**
   * 사용자의 최근 검색어 목록에서 특정 검색어를 삭제합니다.
   *
   * 1. 검색어 앞뒤 공백을 제거합니다.
   * 2. 빈 검색어이면 Redis 명령을 실행하지 않습니다.
   * 3. 사용자별 최근 검색어 List에서 해당 검색어를 제거합니다.
   *
   * 실습 포인트:
   * LREM은 List에 들어 있는 특정 값을 삭제할 때 사용합니다.
   */
  async deleteRecentSearchKeyword(userId: number, keyword: string): Promise<void> {
    const normalizedKeyword = normalizeKeyword(keyword);

    if (!normalizedKeyword) {
      return;
    }

    const key = RedisKey.list.searchRecent(userId);

    // LREM은 List 안의 특정 검색어를 제거합니다. count 0을 사용해 중복 값이 남지 않게 모두 삭제합니다.
    await redis.lRem(key, 0, normalizedKeyword);
  }

  /**
   * 사용자의 최근 검색어 Redis List를 삭제합니다.
   *
   * 1. 사용자별 최근 검색어 List key를 만듭니다.
   * 2. Redis에서 해당 key 자체를 삭제합니다.
   *
   * 실습 포인트:
   * DEL은 key를 삭제하는 명령입니다. 최근 검색어 전체 초기화처럼 List 전체가 필요 없을 때 사용합니다.
   */
  async clearRecentSearchKeywords(userId: number): Promise<void> {
    const key = RedisKey.list.searchRecent(userId);

    // DEL은 key와 그 안의 데이터를 함께 삭제합니다. key가 없어도 에러 없이 0건 삭제로 처리됩니다.
    await redis.del(key);
  }
}
