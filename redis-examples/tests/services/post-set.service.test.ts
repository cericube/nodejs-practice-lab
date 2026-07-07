import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { RedisKey } from '../../src/redis/redis-key.js';
import { PostSetService } from '../../src/services/post-set.service.js';
import '../setup.js';

async function createUser(name = 'Post Set Tester') {
  return prisma.user.create({
    data: {
      email: `post-set-user-${Date.now()}-${Math.random()}@example.com`,
      name,
    },
  });
}

async function createPost(authorId: number, title = 'Redis Set 좋아요 테스트') {
  return prisma.post.create({
    data: {
      title,
      content: '게시글 좋아요 Set 테스트',
      authorId,
      status: 'PUBLISHED',
    },
  });
}

describe('PostSetService', () => {
  const postSetService = new PostSetService();

  it('게시글 좋아요를 추가하고 중복 좋아요는 한 번만 집계한다', async () => {
    const user = await createUser();
    const post = await createPost(user.id);

    const first = await postSetService.likePost(post.id, user.id);
    const duplicated = await postSetService.likePost(post.id, user.id);

    expect(first).toEqual({
      postId: post.id,
      userId: user.id,
      liked: true,
      likeCount: 1,
    });
    expect(duplicated.likeCount).toBe(1);
    await expect(postSetService.isPostLikedByUser(post.id, user.id)).resolves.toBe(true);
  });

  it('여러 사용자의 좋아요 수와 요약 목록을 조회한다', async () => {
    const author = await createUser('Post Author');
    const firstUser = await createUser('First Liker');
    const secondUser = await createUser('Second Liker');
    const post = await createPost(author.id);

    await postSetService.likePost(post.id, firstUser.id);
    await postSetService.likePost(post.id, secondUser.id);

    await expect(postSetService.getPostLikeCount(post.id)).resolves.toBe(2);

    const summary = await postSetService.getPostLikeSummary(post.id);

    expect(summary.postId).toBe(post.id);
    expect(summary.likeCount).toBe(2);
    expect(summary.likedUserIds.sort((a, b) => a - b)).toEqual(
      [firstUser.id, secondUser.id].sort((a, b) => a - b),
    );
  });

  it('좋아요를 취소하고 게시글 좋아요 Set을 삭제한다', async () => {
    const user = await createUser();
    const post = await createPost(user.id);
    const key = RedisKey.set.postLikes(post.id);

    await postSetService.likePost(post.id, user.id);

    const unliked = await postSetService.unlikePost(post.id, user.id);

    expect(unliked).toEqual({
      postId: post.id,
      userId: user.id,
      liked: false,
      likeCount: 0,
    });
    await expect(postSetService.isPostLikedByUser(post.id, user.id)).resolves.toBe(false);

    await postSetService.likePost(post.id, user.id);
    await postSetService.deletePostLikes(post.id);

    await expect(redis.exists(key)).resolves.toBe(0);
  });

  it('존재하지 않는 게시글이나 사용자의 좋아요 추가는 예외를 던진다', async () => {
    const user = await createUser();
    const post = await createPost(user.id);

    await expect(postSetService.likePost(999999, user.id)).rejects.toThrow();
    await expect(postSetService.likePost(post.id, 999999)).rejects.toThrow();
  });
});