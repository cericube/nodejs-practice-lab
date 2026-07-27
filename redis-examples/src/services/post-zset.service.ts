// src/services/post-zset.service.ts

import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';
import type { Prisma } from '../generated/prisma/client';

/**
 * 인기 게시글 조회 시 공통으로 사용할 Prisma select 옵션
 *
 * 1. 랭킹 결과에 표시할 게시글 필드만 가져옵니다.
 * 2. Redis Sorted Set에는 postId만 저장하고, 상세 정보는 DB에서 조회합니다.
 * 3. Redis는 랭킹 인덱스 역할, DB는 원본 데이터 저장소 역할을 합니다.
 */
// 타입 지정 (Type Annotation):
const PopularPostSelect: Prisma.PostSelect = {
  id: true,
  title: true,
  content: true,
  authorId: true,
  status: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
};

export type PopularPostOutput = {
  id: number;
  title: string;
  content: string;
  authorId: number;
  status: string;
  viewCount: number;
  rankingScore: number;
  rank: number;
  createdAt: string;
  updatedAt: string;
};

function toPopularPostOutput(
  post: {
    id: number;
    title: string;
    content: string;
    authorId: number;
    status: string;
    viewCount: number;
    createdAt: Date;
    updatedAt: Date;
  },
  rankingScore: number,
  rank: number,
): PopularPostOutput {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    authorId: post.authorId,
    status: post.status,
    viewCount: post.viewCount,
    rankingScore,
    rank,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

export class PostZSetService {
  /**
   * 게시글 인기 점수 증가
   *
   * 1. 인기 게시글 랭킹 Sorted Set key를 가져옵니다.
   * 2. postId를 member로 사용합니다.
   * 3. ZINCRBY로 score를 증가시킵니다.
   *
   * 실습 포인트:
   * Sorted Set은 같은 member를 중복 저장하지 않습니다.
   * 같은 postId에 대해 ZINCRBY를 여러 번 호출하면 member가 여러 개 생기는 것이 아니라 score만 증가합니다.
   */
  async increasePostRankingScore(postId: number, score = 1): Promise<number> {
    const key = RedisKey.zset.postRanking();
    const member = String(postId);

    // 게시글 인기 랭킹에서 게시글의 점수를 증가시킵니다.
    // 게시글이 없으면 추가하고, 있으면 점수를 누적한 뒤 최종 점수를 반환합니다.
    const newScore = await redis.zIncrBy(key, score, member);

    return newScore;
  }

  /**
   * 게시글 현재 랭킹 점수 조회
   *
   * 1. postId를 member로 사용합니다.
   * 2. ZSCORE로 현재 score를 조회합니다.
   * 3. score가 없으면 아직 랭킹에 없는 게시글로 보고 0을 반환합니다.
   */
  async getPostRankingScore(postId: number): Promise<number> {
    const key = RedisKey.zset.postRanking();
    const member = String(postId);

    // 게시글 인기 랭킹에서 게시글의 현재 점수를 조회합니다.
    // 게시글이 랭킹에 없으면 null을 반환합니다.
    const score = await redis.zScore(key, member);

    return score ?? 0;
  }

  /**
   * 게시글 현재 순위 조회
   *
   * 1. score가 높은 순서 기준으로 순위를 조회합니다.
   * 2. Redis ZREVRANK는 0부터 시작하는 순위를 반환합니다.
   * 3. 서비스 밖에서는 1위부터 보여주는 것이 자연스러우므로 +1 처리합니다.
   */
  async getPostRank(postId: number): Promise<number | null> {
    const key = RedisKey.zset.postRanking();
    const member = String(postId);

    // 게시글 인기 랭킹에서 점수가 높은 순서의 현재 위치를 조회합니다.
    // 0부터 시작하는 순위를 반환하며, 게시글이 랭킹에 없으면 null을 반환합니다.
    const zeroBasedRank = await redis.zRevRank(key, member);

    if (zeroBasedRank === null) {
      return null;
    }

    return zeroBasedRank + 1;
  }

  /**
   * 인기 게시글 TOP N 조회
   *
   * 1. Redis Sorted Set에서 score가 높은 게시글 ID를 가져옵니다.
   * 2. Redis에는 postId와 score만 있으므로 게시글 상세 정보는 DB에서 조회합니다.
   * 3. Redis 랭킹 순서를 유지해서 결과를 반환합니다.
   *
   * 실습 포인트:
   * Redis Sorted Set은 랭킹 인덱스 역할에 집중시키고,
   * 게시글 제목/본문 같은 원본 데이터는 DB에서 가져옵니다.
   */
  async getPopularPosts(limit = 10): Promise<PopularPostOutput[]> {
    const key = RedisKey.zset.postRanking();
    // 게시글 인기 랭킹에서 상위 게시글을 점수와 함께 조회합니다.
    // REV 옵션으로 점수가 높은 순서의 지정 범위를 반환하며, 게시글이 없으면 빈 배열을 반환합니다.
    const rankingItems = await redis.zRangeWithScores(key, 0, limit - 1, {
      REV: true,
    });

    if (rankingItems.length === 0) {
      return [];
    }

    const postIds = rankingItems.map((item) => Number(item.value));

    const posts = await prisma.post.findMany({
      where: {
        id: {
          in: postIds,
        },
      },
      select: PopularPostSelect,
    });

    const postMap = new Map(posts.map((post) => [post.id, post]));

    return rankingItems
      .map((item, index) => {
        const postId = Number(item.value);
        const post = postMap.get(postId);

        if (!post) {
          return null;
        }

        return toPopularPostOutput(post, item.score, index + 1);
      })
      .filter((post): post is PopularPostOutput => post !== null);
  }

  /**
   * 특정 게시글을 랭킹에서 제거
   *
   * 1. 삭제되었거나 비공개 처리된 게시글은 랭킹에서 제거할 수 있습니다.
   * 2. ZREM은 Sorted Set에서 특정 member를 삭제합니다.
   */
  async removePostFromRanking(postId: number): Promise<void> {
    const key = RedisKey.zset.postRanking();
    const member = String(postId);

    // 게시글 인기 랭킹에서 지정한 게시글을 제거합니다.
    // 게시글과 점수를 함께 제거하고 제거한 수를 반환하며, 게시글이 없으면 0을 반환합니다.
    await redis.zRem(key, member);
  }

  /**
   * 게시글 랭킹 전체 초기화
   *
   * 테스트 코드나 운영성 작업에서 사용할 수 있습니다.
   */
  async clearPostRanking(): Promise<void> {
    const key = RedisKey.zset.postRanking();

    // 게시글 인기 랭킹 데이터를 초기화합니다.
    // 데이터를 삭제하고 삭제한 키 수를 반환하며, 저장된 데이터가 없으면 0을 반환합니다.
    await redis.del(key);
  }
}
