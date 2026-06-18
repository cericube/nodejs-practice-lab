// src/services/post.service.ts
import { prisma } from '../lib/prisma.js';

import { redis } from '../lib/redis.js';
import { RedisKey } from '../redis/redis-key.js';

export type CreatePostInput = {
  title: string;
  content: string;
  authorId: number;
  status?: string;
};

export class PostService {
  /**
   * 게시글 생성
   *
   * 1. 전달받은 title/content/authorId로 DB에 게시글을 생성합니다.
   * 2. status가 없으면 기본값으로 DRAFT를 사용합니다.
   *
   * 실습 포인트:
   * 게시글 본문 데이터는 Redis가 아니라 DB에 저장하고,
   * Redis는 조회수처럼 자주 바뀌는 값의 임시 저장소로 사용합니다.
   */
  async createPost(input: CreatePostInput) {
    return prisma.post.create({
      data: {
        title: input.title,
        content: input.content,
        authorId: input.authorId,
        status: input.status ?? 'DRAFT',
      },
    });
  }

  /**
   * DB에서 게시글 단건 조회
   *
   * 1. postId로 Post 테이블에서 게시글 1개를 조회합니다.
   * 2. 게시글이 없으면 null을 반환합니다.
   *
   * findUnique는 findUniqueOrThrow와 달리 데이터가 없어도 예외를 던지지 않습니다.
   */
  async getPostById(postId: number) {
    return prisma.post.findUnique({
      where: {
        id: postId,
      },
    });
  }

  /**
   * Redis String 기반 조회수 증가
   *
   * 1. 게시글별 조회수 Redis key를 만듭니다.
   * 2. Redis INCR 명령으로 조회수를 1 증가시킵니다.
   * 3. 증가 후의 값을 반환합니다.
   *
   * INCR 명령은 Redis에서 원자적으로 처리됩니다.
   * 동시에 여러 요청이 들어와도 증가 값이 깨지지 않습니다.
   */
  async increaseViewCount(postId: number): Promise<number> {
    // 게시글별 조회수 카운터 key입니다.
    // 예: string:post-view-count:1
    const key = RedisKey.string.postViewCount(postId);

    return redis.incr(key);
  }

  /**
   * Redis에 저장된 조회수 조회
   *
   * 1. 게시글별 조회수 Redis key를 만듭니다.
   * 2. Redis String 값을 조회합니다.
   * 3. 값이 없으면 아직 조회수가 증가하지 않은 상태로 보고 0을 반환합니다.
   */
  async getRedisViewCount(postId: number): Promise<number> {
    const key = RedisKey.string.postViewCount(postId);
    const value = await redis.get(key);

    // Redis get 결과는 문자열 또는 null입니다.
    // 조회수 계산에 사용하기 위해 number로 변환합니다.
    return value ? Number(value) : 0;
  }

  /**
   * 게시글 조회 + 조회수 증가
   *
   * 1. DB에서 게시글 상세 정보를 조회합니다.
   * 2. 게시글이 없으면 null을 반환합니다.
   * 3. 게시글이 있으면 Redis 조회수 카운터를 1 증가시킵니다.
   * 4. DB 게시글 정보와 Redis 조회수를 함께 반환합니다.
   *
   * 실습 포인트:
   * 상세 조회 요청마다 DB의 viewCount를 바로 update하지 않고,
   * Redis에 먼저 빠르게 누적한 뒤 나중에 DB로 반영합니다.
   */
  async getPostDetailAndIncreaseViewCount(postId: number) {
    const post = await this.getPostById(postId);

    if (!post) {
      return null;
    }

    const redisViewCount = await this.increaseViewCount(postId);

    // redisViewCount는 DB viewCount가 아니라 Redis에 임시로 쌓인 조회수입니다.
    return {
      ...post,
      redisViewCount,
    };
  }

  /**
   * Redis 조회수를 DB에 반영합니다.
   *
   * 1. Redis에서 게시글 조회수 값을 가져오면서 동시에 삭제합니다.
   * 2. Redis에 쌓인 조회수가 없으면 DB를 업데이트하지 않고 null을 반환합니다.
   * 3. Redis 조회수를 DB의 viewCount에 increment로 더합니다.
   * 4. DB update가 실패하면 Redis에 조회수를 다시 복구합니다.
   *
   * 실습 포인트:
   * GETDEL은 값을 읽고 삭제하는 작업을 한 번에 수행합니다.
   * GET 후 DEL을 따로 호출하는 것보다 조회수 유실 위험을 줄일 수 있습니다.
   */
  async syncViewCountToDatabase(postId: number) {
    const key = RedisKey.string.postViewCount(postId);

    // GETDEL은 Redis 값을 가져오면서 key를 삭제합니다.
    // value는 문자열 또는 null이므로 숫자로 변환해 사용합니다.
    const value = await redis.getDel(key);
    const redisViewCount = value ? Number(value) : 0;

    if (redisViewCount <= 0) {
      return null;
    }

    try {
      return await prisma.post.update({
        where: {
          id: postId,
        },
        data: {
          viewCount: {
            increment: redisViewCount,
          },
        },
      });
    } catch (error) {
      // DB 반영에 실패하면 GETDEL로 삭제했던 조회수를 Redis에 다시 더합니다.
      // 이렇게 하지 않으면 실패한 조회수 증가분이 사라질 수 있습니다.
      await redis.incrBy(key, redisViewCount);
      throw error;
    }
  }
}
