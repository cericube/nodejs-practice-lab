// tests/module/postlike/postlike.route.test.ts\

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApp } from '../../../src/app';
import { prisma } from '../setup';
import { Post, PostLike, User } from '../../../src/generated/client';

import { seedUsers, seedPosts, seedPostLikes } from '../postlike/postlike.seed';

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

describe('PostLike Routes 좋아요 등록/취소', () => {
  let app: FastifyInstance;
  let postAuthorId: number;
  let likeUserId: number;
  let postId: number[] = [];

  beforeAll(async () => {
    // 테스트용 유저 생성
    const likeUser = await prisma.user.create({
      data: {
        email: 'testlike@test.com',
        phoneNumber: '+821012345178',
        displayName: '좋아요',
      },
    });
    likeUserId = likeUser.id;
    //
    const user = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    postAuthorId = user.id;

    const post = await prisma.post.create({
      data: {
        author: {
          connect: { id: postAuthorId },
        },
        title: '글 제목',
        content: '글 본문 입니다.',
      },
    });
    postId[0] = post.id;

    const post2 = await prisma.post.create({
      data: {
        author: {
          connect: { id: postAuthorId },
        },
        title: '두번 째 글 제목',
        content: '두번 째 글 본문 입니다.',
      },
    });
    postId[1] = post2.id;

    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.postLike.deleteMany();
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  beforeEach(async () => {
    // 각 테스트마다 좋아요 데이터 초기화
    await prisma.postLike.deleteMany();
  });

  it('1.좋아요 등록하면, 성공 응답 객체를 반환한다.', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/postlikes/${postId[0]}/${likeUserId}`,
    });

    expect(response.statusCode).toBe(200);
    const josn = response.json();
    console.log('좋아요 등록 응답: ', josn);
    expect(josn).toHaveProperty('success', true);
    expect(josn).toHaveProperty('body');
    expect(josn.body).toHaveProperty('postId', postId[0]);
    //
    // DB에 좋아요 데이터가 실제로 생성되었는지 검증
    const likeInDb = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId: likeUserId,
          postId: postId[0],
        },
      },
    });
    expect(likeInDb).not.toBeNull();
    expect(likeInDb?.userId).toBe(likeUserId);
    expect(likeInDb?.postId).toBe(postId[0]);
  });

  it('2.좋아요 취소하면, 성공 응답 객체를 반환한다.', async () => {
    // 먼저 좋아요 등록
    await prisma.postLike.create({
      data: {
        user: { connect: { id: likeUserId } },
        post: { connect: { id: postId[0] } },
      },
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/postlikes/${postId[0]}/${likeUserId}`,
    });

    expect(response.statusCode).toBe(200);
    const josn = response.json();
    console.log('좋아요 취소 응답: ', josn);
    expect(josn).toHaveProperty('success', true);
    expect(josn).toHaveProperty('body');
    expect(josn.body).toHaveProperty('postId', postId[0]);
    // DB에 좋아요 데이터가 실제로 삭제되었는지 검증
    const likeInDb = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId: likeUserId,
          postId: postId[0],
        },
      },
    });
    expect(likeInDb).toBeNull();
  });

  //
  it('3.존재하지 않는 좋아요를 취소하면 404 에러를 반환한다.', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/postlikes/${postId[0]}/${likeUserId}`,
    });

    expect(response.statusCode).toBe(404);
    const json = response.json();
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'NOT_FOUND');
  });

  it('4.이미 좋아요한 게시글에 다시 좋아요 등록하면 400 에러를 반환한다.', async () => {
    // 먼저 좋아요 등록
    await prisma.postLike.create({
      data: {
        user: { connect: { id: likeUserId } },
        post: { connect: { id: postId[0] } },
      },
    });

    // 같은 게시글에 다시 좋아요 등록 시도
    const response = await app.inject({
      method: 'POST',
      url: `/api/postlikes/${postId[0]}/${likeUserId}`,
    });

    // HTTP 409 Status Code는 Conflict (충돌)를 의미합니다.
    // 중복 리소스 생성
    expect(response.statusCode).toBe(409);
    const json = response.json();
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'ALREADY_EXISTS');
  });

  it('5.내가 좋아요 하지 않은 게시글에 좋아요 취소 시도하면 404 에러를 반환한다.', async () => {
    // likeUserId가 postId[1]에 좋아요를 누르지 않은 상태에서 취소 시도
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/postlikes/${postId[1]}/${1111}`,
    });

    expect(response.statusCode).toBe(404);
    const json = response.json();
    console.log('좋아요 취소 시도 응답: ', json);
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'NOT_FOUND');
  });
});

describe('PostLike Routes 목록 조회', () => {
  let app: FastifyInstance;
  let users: User[];
  let posts: Post[];
  let likes: PostLike[];

  beforeAll(async () => {
    users = await seedUsers();
    posts = await seedPosts(users);
    likes = await seedPostLikes(users, posts);

    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.postLike.deleteMany();
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  it('1.사용자가 좋아요한 게시글 목록을 조회하면, 성공 응답 객체를 반환한다.', async () => {
    const userId = users[0].id;
    const response = await app.inject({
      method: 'GET',
      url: `/api/postlikes/${userId}/posts?take=3&sort=oldest`, // 페이지네이션 옵션 예시`
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    console.log('사용자가 좋아요한 게시글 목록 응답: ', JSON.stringify(json, null, 2));
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('body');
    expect(Array.isArray(json.body.posts)).toBe(true);

    expect(json.body).toHaveProperty('hasNextPage');
    expect(typeof json.body.hasNextPage).toBe('boolean');

    if (json.body.hasNextPage) {
      expect(json.body).toHaveProperty('nextCursor');
      expect(json.body.nextCursor).toHaveProperty('createdAt');
      expect(isDateTime(json.body.nextCursor.createdAt)).toBe(true);
      expect(json.body.nextCursor).toHaveProperty('value');
      expect(typeof json.body.nextCursor.value).toBe('number');
    } else {
      expect(json.body).not.toHaveProperty('nextCursor');
    }

    const posts = json.body.posts;
    expect(posts.length).toBeLessThanOrEqual(3); // take=3 옵션에 따른 검증
    posts.forEach((item: any) => {
      expect(item).toHaveProperty('post');
      expect(item.post).toHaveProperty('id');
      expect(item.post).toHaveProperty('title');
      expect(item.post).toHaveProperty('published');
      expect(item).toHaveProperty('createdAt');
      // createdAt이 ISO 8601 형식의 날짜 문자열인지 검증
      expect(isDateTime(item.createdAt)).toBe(true);
    });
  });

  it('2.존재하지 않는 사용자의 좋아요한 게시글 목록 조회시, 빈 글 목록을 반환한다.', async () => {
    const nonExistentUserId = 1; // 존재하지 않는 사용자 ID
    const response = await app.inject({
      method: 'GET',
      url: `/api/postlikes/${nonExistentUserId}/posts?take=3&sort=oldest`,
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<');
    // console.log(json);

    console.log('존재하지 않는 사용자의 좋아요한 게시글 목록 조회 응답: ', json);
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('body');
    expect(json.body).toHaveProperty('posts');
    expect(Array.isArray(json.body.posts)).toBe(true);
    expect(json.body.posts.length).toBe(0); // 좋아요한 게시글이 없으므로 빈 배열이어야 함

    expect(json.body).toHaveProperty('hasNextPage');
    expect(typeof json.body.hasNextPage).toBe('boolean');
    expect(json.body.hasNextPage).toBe(false); // 페이지네이션이 필요 없으므로 false여야 함

    expect(json.body).not.toHaveProperty('nextCursor'); // nextCursor는 없어야 함
  });

  it('3.사용자가 좋아요한 게시글 목록 조회시, 페이지네이션이 정상 동작한다.', async () => {
    const take = 3; // 한 페이지에 3개씩 조회
    const userId = users[0].id;
    const response = await app.inject({
      method: 'GET',
      url: `/api/postlikes/${userId}/posts?take=${take}&sort=oldest`, // 페이지네이션 옵션 예시`
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    console.log('사용자가 좋아요한 게시글 목록 페이지네이션 응답: ', JSON.stringify(json, null, 2));
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('body');
    expect(Array.isArray(json.body.posts)).toBe(true);

    expect(json.body).toHaveProperty('hasNextPage');
    expect(typeof json.body.hasNextPage).toBe('boolean');

    if (json.body.hasNextPage) {
      let hasNextPage = json.body.hasNextPage;
      let cursorCreateAt = json.body.nextCursor.createdAt;
      let cursorValue = json.body.nextCursor.value;

      while (hasNextPage) {
        const res = await app.inject({
          method: 'GET',
          url:
            `/api/postlikes/${userId}/posts?take=${take}` +
            `&sort=oldest` +
            `&createdAt=${cursorCreateAt}` +
            `&value=${cursorValue}`, // 페이지네이션 옵션 예시`
        });
        expect(res.statusCode).toBe(200);
        const nextJson = res.json();
        console.log('다음 페이지 응답: ', JSON.stringify(nextJson, null, 2));
        hasNextPage = nextJson.body.hasNextPage;
        if (hasNextPage) {
          cursorCreateAt = nextJson.body.nextCursor.createdAt;
          cursorValue = nextJson.body.nextCursor.value;
        } else {
          expect(nextJson.body).not.toHaveProperty('nextCursor'); // 마지막 페이지에는 nextCursor 없어야 함
        }
      }
    }
  });

  it('4.게시글에 좋아요한 사용자 목록을 조회하면, 성공 응답 객체를 반환한다.', async () => {
    const take = 3; // 한 페이지에 3개씩 조회
    const postId = posts[0].id;
    const response = await app.inject({
      method: 'GET',
      url: `/api/postlikes/${postId}/users?take=${take}&sort=latest`, // 페이지네이션 옵션 예시`
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    console.log('첫 페이지 응답: ', JSON.stringify(json, null, 2));
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('body');
    expect(Array.isArray(json.body.users)).toBe(true);
    expect(json.body).toHaveProperty('hasNextPage');
    expect(typeof json.body.hasNextPage).toBe('boolean');

    if (json.body.hasNextPage) {
      let hasNextPage = json.body.hasNextPage;
      let cursorCreateAt = json.body.nextCursor.createdAt;
      let cursorValue = json.body.nextCursor.value;

      while (hasNextPage) {
        const res = await app.inject({
          method: 'GET',
          url:
            `/api/postlikes/${postId}/users?take=${take}` +
            `&sort=latest` +
            `&createdAt=${cursorCreateAt}` +
            `&value=${cursorValue}`, // 페이지네이션 옵션 예시`
        });
        expect(res.statusCode).toBe(200);
        const nextJson = res.json();
        console.log('다음 페이지 응답: ', JSON.stringify(nextJson, null, 2));
        hasNextPage = nextJson.body.hasNextPage;
        if (hasNextPage) {
          cursorCreateAt = nextJson.body.nextCursor.createdAt;
          cursorValue = nextJson.body.nextCursor.value;
        } else {
          expect(nextJson.body).not.toHaveProperty('nextCursor'); // 마지막 페이지에는 nextCursor 없어야 함
        }
      }
    }
  });
});
