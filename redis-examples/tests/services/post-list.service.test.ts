import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { PostListService } from '../../src/services/post-list.service.js';
import '../setup.js';

async function createUser() {
  return prisma.user.create({
    data: {
      email: `post-list-user-${Date.now()}-${Math.random()}@example.com`,
      name: 'Post List Tester',
    },
  });
}

async function createPost(authorId: number, title = 'Redis List 실습') {
  return prisma.post.create({
    data: {
      title,
      content: '최근 본 게시글 테스트',
      authorId,
      status: 'PUBLISHED',
    },
  });
}

describe('PostListService', () => {
  const postListService = new PostListService();

  it('게시글 조회 시 최근 본 게시글 목록에 기록한다', async () => {
    const user = await createUser();
    const post = await createPost(user.id);

    const detail = await postListService.getPostAndAddRecentViewedPost(user.id, post.id);

    expect(detail).toMatchObject({
      id: post.id,
      title: 'Redis List 실습',
      authorId: user.id,
      status: 'PUBLISHED',
    });
    await expect(postListService.getRecentViewedPostIds(user.id)).resolves.toEqual([post.id]);
  });

  it('없는 게시글 조회 시 최근 본 게시글 목록에 기록하지 않는다', async () => {
    const user = await createUser();
    const missingPostId = 999999;

    const detail = await postListService.getPostAndAddRecentViewedPost(user.id, missingPostId);

    expect(detail).toBeNull();
    await expect(postListService.getRecentViewedPostIds(user.id)).resolves.toEqual([]);
  });

  it('최근 본 게시글은 마지막으로 조회한 순서대로 반환한다', async () => {
    const user = await createUser();
    const firstPost = await createPost(user.id, '첫 번째 게시글');
    const secondPost = await createPost(user.id, '두 번째 게시글');

    await postListService.getPostAndAddRecentViewedPost(user.id, firstPost.id);
    await postListService.getPostAndAddRecentViewedPost(user.id, secondPost.id);

    const recentPosts = await postListService.getRecentViewedPosts(user.id);

    expect(recentPosts.map((post) => post.id)).toEqual([secondPost.id, firstPost.id]);
  });
});
