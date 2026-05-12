// tests/module/post/post.route.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApp } from '../../../src/app';
import { prisma } from '../setup';
import { PostUpdateResponseDto } from '../../../src/modules/post/post.dto';
import { seedUsers, seedPosts } from './post.seed';
import type { User, Post } from '../../../src/generated/client';

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

describe('PostRoute 테스트(CRUD) ', () => {
  let app: FastifyInstance;
  let postAuthorId: number;

  beforeAll(async () => {
    // 테스트용 유저 생성
    const user = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    postAuthorId = user.id;
    //
    app = await createApp();
    await app.ready();
  });
  //
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

  it('1.게시글 정보를 올바르게 입력하면, 성공 응답 객체를 반환해야 한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/posts/',
      payload: {
        title: '제 목',
        content: '내용 입니다.',
        authorId: postAuthorId,
        //published: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    //console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    //console.log(json);

    expect(json).toHaveProperty('success', true); //처리결과,
    expect(json).toHaveProperty('body'); //응답 body
    const body = json.body;
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('authorId', postAuthorId);
    expect(body).toHaveProperty('published');
    expect(body).toHaveProperty('updatedAt');
    expect(body).toHaveProperty('published');
    expect(isDateTime(body.updatedAt)).toBe(true);
  });

  it('2.존재하지 않는 작성자 ID로 글을 등록하면, 404 에러와 NOT_FOUND 코드를 반환해야 한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/posts/',
      payload: {
        title: '제목',
        authorId: 111,
      },
    });

    const json = res.json();
    //console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    //console.log(json);
    expect(res.statusCode).toBe(404);
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'NOT_FOUND');
    expect(json).toHaveProperty('message');
  });

  //
  it('3.필수 값인 제목을 누락하여 글을 등록하면, 400 에러와 VALIDATION_ERROR 코드를 반환해야 한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/posts/',
      payload: {
        // title: '제목',
        authorId: postAuthorId,
      },
    });

    const json = res.json();
    //console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    //console.log(json);
    expect(res.statusCode).toBe(400);
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(json).toHaveProperty('message');
  });

  async function getCreatedPost(authorId: number): Promise<PostUpdateResponseDto> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/posts/',
      payload: {
        title: '제 목',
        content: '내용 입니다.',
        authorId: authorId,
      },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json).toHaveProperty('success', true);
    return json.body;
  }

  it('4.게시글 정보 수정시, 성공 응답 객체를 반환해야 한다.', async () => {
    // 사용자 등록
    const created = await getCreatedPost(postAuthorId);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/posts/${created.id}`,
      payload: {
        title: '수정 제목',
        content: '수정된 내용입니다.',
        published: true,
      },
    });
    //

    expect(updated.statusCode).toBe(200);
    const updatedJson = updated.json();
    //console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    //console.log(updated.json());
    //
    expect(updatedJson).toHaveProperty('success', true); //처리결과,
    expect(updatedJson).toHaveProperty('body'); //응답 body
    const body = updatedJson.body;
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('authorId', postAuthorId);
    expect(body).toHaveProperty('published');
    expect(body).toHaveProperty('updatedAt');
    expect(body).toHaveProperty('published');
    expect(isDateTime(body.updatedAt)).toBe(true);
  });

  it('5.존재하지 않는 글 수정 요청시, 404 NOT_FOUND 를 응답한다.', async () => {
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/posts/11`,
      payload: {
        title: '수정 제목',
        content: '수정된 내용입니다.',
        published: true,
      },
    });

    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(updated);
    expect(updated.statusCode).toBe(404);
    const json = updated.json();
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'NOT_FOUND');
  });

  it('6.올바르지 않은 작성자의 글 수정 요청시, 404 NOT_FOUND 를 응답한다.', async () => {
    // 글 등록
    const created = await getCreatedPost(postAuthorId);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/posts/${created.id}`,
      payload: {
        title: '수정 제목',
        content: '수정된 내용입니다.',
        published: true,
        authorId: 1111,
      },
    });

    //console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    //console.log(updated);
    expect(updated.statusCode).toBe(404);
    const json = updated.json();
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'NOT_FOUND');
  });

  it('7.게시글 카운터(view/like/reply)는 기존 값에 누적된다 (incremental update)', async () => {
    // 글 등록
    const created = await getCreatedPost(postAuthorId);

    // 공개글만 count 하니까 공개로 전환해야 한다.
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/posts/${created.id}`,
      payload: {
        published: true,
      },
    });

    // 첫번째 갱신
    const counted1 = await app.inject({
      method: 'PATCH',
      url: `/api/posts/${created.id}/counter`,
      payload: {
        viewCount: 100,
        likeCount: 39,
        replyCount: 10, // test 용
      },
    });

    // 누적 테스트
    const counted = await app.inject({
      method: 'PATCH',
      url: `/api/posts/${created.id}/counter`,
      payload: {
        viewCount: 2,
        likeCount: -4,
        replyCount: 7, // test 용
      },
    });

    expect(counted.statusCode).toBe(200);
    const json = counted.json();
    expect(json).toHaveProperty('success', true);
    expect(json.body).toHaveProperty('id');

    // 결과 확인
    // 조회시 viewCount +1 갱신된다.
    const post = await app.inject({
      method: 'GET',
      url: `/api/posts?id=${json.body.id}&includeDraft=true`, //미공개도 포함해야 오류 아남
    });
    expect(post.statusCode).toBe(200);
    const postJson = post.json();
    expect(postJson).toHaveProperty('success', true);
    expect(postJson).toHaveProperty('body');
    expect(postJson.body).toHaveProperty('viewCount', 103); //100 + 2 , +1(조회시)
    expect(postJson.body).toHaveProperty('likeCount', 35); //39 + -4
    expect(postJson.body).toHaveProperty('replyCount', 17); // 10 + 7
  });

  it('8.게시글 삭제시, 성공 응답 객체를 반환해야 한다.', async () => {
    // 글 등록
    const created = await getCreatedPost(postAuthorId);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/posts/${created.id}`,
    });

    expect(deleted.statusCode).toBe(200);
    const postJson = deleted.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(postJson);

    // 결과 확인
    const post = await app.inject({
      method: 'GET',
      url: `/api/posts?id=${created.id}&includeDraft=true`, //미공개도 포함해야 오류 아남
    });
    expect(post.statusCode).toBe(404); // 없어야 한다.
  });

  it('9.작성자를 지정하여 게시글 삭제시, 성공 응답 객체를 반환해야 한다.', async () => {
    // 글 등록
    const created = await getCreatedPost(postAuthorId);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/posts/${created.id}?authorId=${created.authorId}`,
    });

    expect(deleted.statusCode).toBe(200);
    const postJson = deleted.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(postJson);

    // 결과 확인
    const post = await app.inject({
      method: 'GET',
      url: `/api/posts?id=${created.id}&includeDraft=true`, //미공개도 포함해야 오류 아남
    });
    expect(post.statusCode).toBe(404); // 없어야 한다.
  });

  it('10.올바르지 않은 작성자의 글 수정 요청시, 404 NOT_FOUND 를 응답한다.', async () => {
    // 글 등록
    const created = await getCreatedPost(postAuthorId);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/posts/${created.id}?authorId=1111`,
    });
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(deleted.json());
    expect(deleted.statusCode).toBe(404); // 없어야 한다.
    expect(deleted.json().code).toEqual('NOT_FOUND');
  });

  it('11.게시글 상세 조회를 요청하면,성공 응답 객체를 반환해야 한다', async () => {
    // 글 등록
    const created = await getCreatedPost(postAuthorId);

    const post = await app.inject({
      method: 'GET',
      url: `/api/posts?id=${created.id}&includeDraft=true`, //미공개도 포함해야 오류 아남
    });

    expect(post.statusCode).toBe(200);
    const json = post.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(json);
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('body');
    const body = json.body;
    expect(body).toHaveProperty('id', created.id);
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('content');
    expect(body.content).not.toBeNull();
    expect(body).toHaveProperty('published', false);
    expect(body).toHaveProperty('createdAt');
    expect(body).toHaveProperty('publishedAt', null);
    expect(body).toHaveProperty('viewCount', 0);
    expect(body).toHaveProperty('likeCount', 0);
    expect(body).toHaveProperty('replyCount', 0);
    expect(body).toHaveProperty('author');
    expect(body.author).toHaveProperty('id', created.authorId);
    expect(body.author).toHaveProperty('name', 'tester');
  });
});

describe('PostRoute 다중조회', () => {
  let globalUsers: User[] = [];
  let globalPosts: Post[] = [];

  let app: FastifyInstance;

  beforeAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();

    globalUsers = await seedUsers();
    globalPosts = await seedPosts(globalUsers);
    //
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  // 검색 조건이 많아서 post 를 사용한다.
  it('1.글 목록 조회시, 성공 응답 객체를 반환한다.', async () => {
    const take = 5;

    const result = await app.inject({
      method: 'POST',
      url: '/api/posts/list',
      payload: {
        take: 5,
      },
    });

    expect(result.statusCode).toBe(200);
    const json = result.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.dir(json, { depth: null, colors: true });

    //
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('body');
    expect(json.body).toHaveProperty('hasNextPage', true);
    expect(json.body).toHaveProperty('nextCursor');

    const posts = json.body.posts;
    expect(posts).length(5);

    const post = posts[0];
    expect(post).toHaveProperty('id');
    expect(post).toHaveProperty('title');

    expect(post).toHaveProperty('published');
    expect(post).toHaveProperty('createdAt');
    expect(post).toHaveProperty('viewCount');
    expect(post).toHaveProperty('likeCount');
    expect(post).toHaveProperty('replyCount');
    expect(post).toHaveProperty('author');
    expect(post.author).toHaveProperty('id');
    expect(post.author).toHaveProperty('name');
  });
});
