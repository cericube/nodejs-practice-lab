import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { PostZSetService } from '../../src/services/post-zset.service.js';
import '../setup.js';

async function createUser() {
  return prisma.user.create({
    data: {
      email: `post-zset-${Date.now()}-${Math.random()}@example.com`,
      name: 'Post Ranking User',
    },
  });
}

async function createPost(authorId: number, title: string) {
  return prisma.post.create({
    data: {
      authorId,
      title,
      content: `${title} content`,
      status: 'PUBLISHED',
    },
  });
}

describe('PostZSetService', () => {
  const service = new PostZSetService();

  it('게시글 랭킹 점수를 누적하고 현재 점수와 순위를 조회한다', async () => {
    const user = await createUser();
    const first = await createPost(user.id, 'First');
    const second = await createPost(user.id, 'Second');

    await service.increasePostRankingScore(first.id, 2);
    await expect(service.increasePostRankingScore(first.id, 3)).resolves.toBe(5);
    await service.increasePostRankingScore(second.id, 10);

    await expect(service.getPostRankingScore(first.id)).resolves.toBe(5);
    await expect(service.getPostRank(first.id)).resolves.toBe(2);
    await expect(service.getPostRank(999999)).resolves.toBeNull();
  });

  it('점수가 높은 순서로 DB 게시글 정보를 결합해 반환한다', async () => {
    const user = await createUser();
    const low = await createPost(user.id, 'Low');
    const high = await createPost(user.id, 'High');
    await service.increasePostRankingScore(low.id, 1);
    await service.increasePostRankingScore(high.id, 5);

    const posts = await service.getPopularPosts(2);

    expect(posts.map((post) => post.id)).toEqual([high.id, low.id]);
    expect(posts[0]).toMatchObject({
      title: 'High',
      rankingScore: 5,
      rank: 1,
    });
    expect(posts[0].createdAt).toEqual(expect.any(String));
  });

  it('DB에 없는 랭킹 항목은 결과에서 제외한다', async () => {
    await service.increasePostRankingScore(999999, 10);

    await expect(service.getPopularPosts()).resolves.toEqual([]);
  });

  it('게시글을 랭킹에서 제거하고 전체 랭킹을 초기화한다', async () => {
    const user = await createUser();
    const post = await createPost(user.id, 'Remove');
    await service.increasePostRankingScore(post.id, 1);

    await service.removePostFromRanking(post.id);
    await expect(service.getPostRankingScore(post.id)).resolves.toBe(0);

    await service.increasePostRankingScore(post.id, 1);
    await service.clearPostRanking();
    await expect(redis.exists(RedisKey.zset.postRanking())).resolves.toBe(0);
  });
});
