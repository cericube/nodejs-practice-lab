import { describe, expect, it } from 'vitest';
import { PostService } from '../../src/service/post.service.js';
import '../setup';

describe('PostService', () => {
  const postService = new PostService();

  it('1. 게시글을 생성할 수 있다', async () => {
    const post = await postService.createPost({
      title: 'Redis String 캐싱 실습',
      content: '게시글 상세 데이터를 Redis String으로 캐싱합니다.',
      author: 'kim',
      status: 'PUBLISHED',
    });

    expect(post.id).toBeGreaterThan(0);
    expect(post.title).toBe('Redis String 캐싱 실습');
    expect(post.author).toBe('kim');
    expect(post.status).toBe('PUBLISHED');
    expect(post.viewCount).toBe(0);
  });

  it('2. 게시글 ID로 단건 조회할 수 있다', async () => {
    const createdPost = await postService.createPost({
      title: 'Redis Hash 실습',
      content: '게시글 요약 정보를 Redis Hash로 저장합니다.',
      author: 'kim',
      status: 'PUBLISHED',
    });

    const foundPost = await postService.getPostById(createdPost.id);

    expect(foundPost).not.toBeNull();
    expect(foundPost?.id).toBe(createdPost.id);
    expect(foundPost?.title).toBe('Redis Hash 실습');
  });

  it('3. 게시글 목록을 조회할 수 있다', async () => {
    await postService.createPost({
      title: '첫 번째 게시글',
      content: '내용 1',
      author: 'kim',
    });

    await postService.createPost({
      title: '두 번째 게시글',
      content: '내용 2',
      author: 'kim',
    });

    const posts = await postService.getPosts();

    expect(posts).toHaveLength(2);
    expect(posts[0].title).toBe('두 번째 게시글');
    expect(posts[1].title).toBe('첫 번째 게시글');
  });

  it('4. 게시글을 수정할 수 있다', async () => {
    const createdPost = await postService.createPost({
      title: '수정 전 제목',
      content: '수정 전 내용',
      author: 'kim',
    });

    const updatedPost = await postService.updatePost(createdPost.id, {
      title: '수정 후 제목',
      content: '수정 후 내용',
      status: 'PUBLISHED',
    });

    expect(updatedPost.title).toBe('수정 후 제목');
    expect(updatedPost.content).toBe('수정 후 내용');
    expect(updatedPost.status).toBe('PUBLISHED');
  });

  it('5. 게시글을 삭제할 수 있다', async () => {
    const createdPost = await postService.createPost({
      title: '삭제할 게시글',
      content: '삭제 테스트',
      author: 'kim',
    });

    await postService.deletePost(createdPost.id);

    const foundPost = await postService.getPostById(createdPost.id);

    expect(foundPost).toBeNull();
  });
});
