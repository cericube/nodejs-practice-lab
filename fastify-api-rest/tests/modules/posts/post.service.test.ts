// tests/module/post/post.service.test.ts

import { describe, it, expect, afterAll, beforeAll, beforeEach, afterEach } from 'vitest';
import { PostService } from '../../../src/modules/post/post.service';
import { PostRepository } from '../../../src/modules/post/post.repository';

import { prisma } from '../setup';
import { seedUsers, seedPosts } from './post.seed';
import type { User, Post } from '../../../src/generated/client';

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

describe('PostService : 기본 CRUD', () => {
  let authorId: number;
  //
  beforeAll(async () => {
    // 테스트용 유저 생성
    const user = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    authorId = user.id;
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  //
  beforeEach(async () => {
    await prisma.post.deleteMany();
  });

  let service: PostService = new PostService(new PostRepository(prisma));

  it('1.게시글 생성 시, PostUpdateResponseDto 규격에 맞는 초기 데이터셋을 반환해야 한다.', async () => {
    const post = await service.createPost({
      title: '타이틀',
      authorId: authorId,
    });
    // console.log(post);
    expect(post).toHaveProperty('id');
    expect(post).toHaveProperty('authorId', authorId);
    expect(post).toHaveProperty('published');
    expect(post).toHaveProperty('publishedAt');
    expect(post).toHaveProperty('updatedAt');
    expect(isDateTime(post.updatedAt)).toBe(true);
  });

  it('2.공개 게시글로 생성할 경우, 발행일(publishedAt)이 포함된 데이터 포맷을 반환해야 한다.', async () => {
    const post = await service.createPost({
      title: '타이틀',
      authorId: authorId,
      published: true,
    });
    console.log(post);
    expect(post).toHaveProperty('id');
    expect(post).toHaveProperty('authorId', authorId);
    expect(post).toHaveProperty('published');
    expect(post).toHaveProperty('publishedAt');
    expect(post).toHaveProperty('updatedAt');
    expect(isDateTime(post.updatedAt)).toBe(true);
    expect(post.publishedAt).not.toBeNull();
  });

  it('3.유효하지 않은 참조(authorId)로 생성 시, 데이터 무결성 예외를 던져야 한다.', async () => {
    await expect(
      service.createPost({
        title: '작성자 오류',
        authorId: 100,
      }),
    ).rejects.toThrow();
  });

  it('4.게시글 수정 시, 변경사항이 반영된 PostUpdateResponseDto 포맷을 반환해야 한다.', async () => {
    const post = await service.createPost({
      title: '타이틀',
      authorId: authorId,
    });

    const updated = await service.updatePost(
      {
        id: post.id,
      },
      {
        authorId: post.authorId,
        title: '업데이트 된 타이틀',
        published: true,
      },
    );

    // console.log('글 업데이트 결과 ..');
    // console.log(updated);
    expect(updated).toHaveProperty('id', post.id);
    expect(updated).toHaveProperty('authorId', post.authorId);
    expect(updated).toHaveProperty('published', true);
    expect(updated).toHaveProperty('publishedAt');
    expect(updated).toHaveProperty('updatedAt');
  });

  it('5.요청자와 소유자가 불일치할 경우, 수정 로직을 차단하고 P2025 에러를 발생시켜야 한다.', async () => {
    const post = await service.createPost({
      title: '타이틀',
      authorId: authorId,
    });

    await expect(
      service.updatePost(
        {
          id: post.id,
        },
        {
          authorId: 1111,
          title: '업데이트 된 타이틀',
          published: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'P2025' });
  });

  // it('6.카운터 데이터 갱신 시, 최소한의 식별 정보(id)를 포함한 응답 포맷을 유지해야 한다.', async () => {
  //   const post = await service.createPost({
  //     title: '타이틀',
  //     authorId: authorId,
  //     published: true, // 공개글 이어야지 count를 증가 시킬 수 있다.
  //   });

  //   const updated = await service.updateCounter(
  //     {
  //       id: post.id,
  //     },
  //     {
  //       likeCount: 3, //3 만큼 증가 시킨다.
  //     },
  //   );
  //   expect(updated).toHaveProperty('id', post.id);
  // });
  //

  it('7.게시글 삭제 시, 삭제된 레코드의 최종 상태값을 포함한 응답을 반환해야 한다.', async () => {
    const post = await service.createPost({
      title: '타이틀',
      authorId: authorId,
    });

    const deleted = await service.deletePost({ id: post.id }, {});

    // console.log('>>>>>>>>>>>>>>>>>>>>>');
    // console.log(deleted);

    expect(deleted).toHaveProperty('id', post.id);
    expect(deleted).toHaveProperty('authorId', post.authorId);
    expect(deleted).toHaveProperty('published', false);
    expect(deleted).toHaveProperty('publishedAt', null);
    expect(deleted).toHaveProperty('updatedAt');
  });

  it('8.존재하지 않는 식별자로 삭제 시도 시, 서비스 예외를 발생시켜 비정상 흐름을 차단해야 한다.', async () => {
    const post = await service.createPost({
      title: '타이틀',
      authorId: authorId,
    });

    await expect(service.deletePost({ id: 11 }, {})).rejects.toThrow();
  });

  it('9.상세 조회 시, 관계 데이터(Author) 및 통계 필드가 결합된 상세 스키마를 반환해야 한다.', async () => {
    const post = await service.createPost({
      title: '타이틀',
      authorId: authorId,
      content: ' 내용입니다......................',
      published: true,
    });

    //여기서 viewCount 가 void로 1 증가해야 한다.
    const checkView = await service.getPost({
      id: post.id,
      includeDraft: true,
    });

    const detailPost = await service.getPost({
      id: post.id,
      includeDraft: true,
    });

    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(detailPost);

    expect(detailPost).toHaveProperty('id', post.id);
    expect(detailPost).toHaveProperty('title', '타이틀');
    expect(detailPost).toHaveProperty('content');
    expect(detailPost).toHaveProperty('published', true);
    expect(detailPost).toHaveProperty('author');
    expect(detailPost.author).toHaveProperty('id');
    expect(detailPost.author).toHaveProperty('name');
    //
    expect(detailPost).toHaveProperty('createdAt');
    expect(typeof detailPost.createdAt).toBe('string');
    expect(detailPost).toHaveProperty('updatedAt');
    expect(detailPost).toHaveProperty('viewCount', 2); //조회수 검증
    expect(detailPost).toHaveProperty('likeCount');
    expect(detailPost).toHaveProperty('replyCount');
  });
});

describe('PostService : 다중조회(listPosts)', () => {
  let globalUsers: User[] = [];
  let globalPosts: Post[] = [];
  beforeAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();

    globalUsers = await seedUsers();
    globalPosts = await seedPosts(globalUsers);
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  let service: PostService = new PostService(new PostRepository(prisma));

  it('1.글목록 조회시 PostListResponseDto 포맷으로 결과를 반환 한다. ', async () => {
    const take = 5;
    const posts = await service.listPosts({
      take: take,
    });

    // console.log('Page 1. >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.dir(posts, { depth: null, colors: true });

    expect(posts).toHaveProperty('posts');
    expect(posts.posts.length).toEqual(take); // 기본 take = 10;
    const post = posts.posts[posts.posts.length - 1];
    expect(Object.keys(post)).toHaveLength(8);
    expect(post).toHaveProperty('id');
    expect(post).toHaveProperty('title');
    expect(post).toHaveProperty('published');
    expect(post).toHaveProperty('author');
    expect(post.author).toHaveProperty('id');
    expect(post.author).toHaveProperty('name');
    expect(post).toHaveProperty('viewCount');
    expect(post).toHaveProperty('likeCount');
    expect(post).toHaveProperty('replyCount');

    expect(posts).toHaveProperty('hasNextPage', true);
    expect(posts).toHaveProperty('nextCursor');
    expect(posts.nextCursor).toHaveProperty('id', post.id); // 마지막 post id 값

    //
    const nextPosts = await service.listPosts({
      cursor: {
        id: post.id,
      },
      take: take,
    });
    // console.log('Page 2.>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.dir(nextPosts, { depth: null, colors: true });

    expect(nextPosts).toHaveProperty('posts');
    expect(nextPosts.posts.length).toEqual(take); // 기본 take = 10;
  });
});
