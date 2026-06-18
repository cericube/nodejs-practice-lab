import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { PostService } from '../../src/services/post.service.js';
import '../setup.js';

async function createUser() {
  return prisma.user.create({
    data: {
      email: `post-user-${Date.now()}-${Math.random()}@example.com`,
      name: 'Post Tester',
    },
  });
}

describe('PostService', () => {
  const postService = new PostService();

  it('게시글을 생성하고 DB에서 단건 조회한다', async () => {
    const user = await createUser();

    const post = await postService.createPost({
      title: 'Redis String 실습',
      content: '조회수 카운터 테스트',
      authorId: user.id,
      status: 'PUBLISHED',
    });

    const found = await postService.getPostById(post.id);

    expect(found).toMatchObject({
      id: post.id,
      title: 'Redis String 실습',
      content: '조회수 카운터 테스트',
      authorId: user.id,
      status: 'PUBLISHED',
      viewCount: 0,
    });
  });

  it('status가 없으면 DRAFT로 게시글을 생성한다', async () => {
    const user = await createUser();

    const post = await postService.createPost({
      title: 'Draft Post',
      content: 'status 기본값 테스트',
      authorId: user.id,
    });

    expect(post.status).toBe('DRAFT');
  });

  it('Redis String 조회수를 원자적으로 증가시키고 조회한다', async () => {
    const postId = 100;

    await expect(postService.increaseViewCount(postId)).resolves.toBe(1);
    await expect(postService.increaseViewCount(postId)).resolves.toBe(2);
    await expect(postService.getRedisViewCount(postId)).resolves.toBe(2);
  });

  it('게시글 상세 조회 시 Redis 조회수를 증가시켜 함께 반환한다', async () => {
    const user = await createUser();
    const post = await postService.createPost({
      title: 'Detail Post',
      content: '상세 조회 테스트',
      authorId: user.id,
    });

    const detail = await postService.getPostDetailAndIncreaseViewCount(post.id);

    expect(detail).toMatchObject({
      id: post.id,
      title: 'Detail Post',
      redisViewCount: 1,
    });
    await expect(postService.getRedisViewCount(post.id)).resolves.toBe(1);
  });

  it('없는 게시글 상세 조회는 null을 반환하고 조회수를 증가시키지 않는다', async () => {
    const missingPostId = 999999;

    const detail = await postService.getPostDetailAndIncreaseViewCount(missingPostId);

    expect(detail).toBeNull();
    await expect(postService.getRedisViewCount(missingPostId)).resolves.toBe(0);
  });

  it('Redis 조회수를 DB viewCount에 반영하고 Redis key를 삭제한다', async () => {
    const user = await createUser();
    const post = await postService.createPost({
      title: 'Sync Post',
      content: 'DB 동기화 테스트',
      authorId: user.id,
    });
    const key = RedisKey.string.postViewCount(post.id);

    await postService.increaseViewCount(post.id);
    await postService.increaseViewCount(post.id);
    await postService.increaseViewCount(post.id);

    const synced = await postService.syncViewCountToDatabase(post.id);

    expect(synced?.viewCount).toBe(3);
    // 동기화 후 Redis key가 삭제되어 조회수가 초기화됩니다.
    await expect(redis.get(key)).resolves.toBeNull();

    // DB에 동기화된 조회수를 다시 조회해 확인합니다.
    const found = await postService.getPostById(post.id);
    expect(found?.viewCount).toBe(3);
  });

  it('Redis에 쌓인 조회수가 없으면 DB를 업데이트하지 않고 null을 반환한다', async () => {
    const user = await createUser();
    const post = await postService.createPost({
      title: 'No View Count',
      content: '동기화할 조회수가 없는 테스트',
      authorId: user.id,
    });

    const result = await postService.syncViewCountToDatabase(post.id);

    expect(result).toBeNull();
  });
});
