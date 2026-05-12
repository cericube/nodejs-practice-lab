// tests/module/reply/reply.route.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { createApp } from '../../../src/app';
import { prisma } from '../setup';
import { Reply } from '../../../src/generated/client';

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

describe('ReplyRoute 기본(CUD) 테스트', () => {
  let app: FastifyInstance;

  let postAuthorId: number;
  let replyAuthorId: number;
  let postId: number;

  beforeAll(async () => {
    // 댓글 작성자 생성
    const replyUser = await prisma.user.create({
      data: {
        email: 'reply@test.com',
        phoneNumber: '+821012345674',
        displayName: 'replier',
      },
    });
    replyAuthorId = replyUser.id;

    // 글 작성자 생성
    const postUser = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    postAuthorId = postUser.id;

    // 글 생성
    const post = await prisma.post.create({
      data: {
        author: {
          connect: { id: postAuthorId },
        },
        title: '글 제목',
        content: '글 본문 입니다.',
      },
    });
    postId = post.id;

    //
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  //
  beforeEach(async () => {
    await prisma.reply.deleteMany();
  });

  it('1.댓글 입력을 요청하면 성공 응답 객체를 반환한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/replies/',
      payload: {
        postId: postId,
        authorId: replyAuthorId,
        content: '입력한 댓글 입니다.',
      },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(json);

    expect(json).toHaveProperty('success', true); //처리결과,
    expect(json).toHaveProperty('body'); //응답 body
    const body = json.body;

    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('authorId', replyAuthorId);
    expect(body).toHaveProperty('postId', postId);
    expect(body).toHaveProperty('updatedAt');
    expect(isDateTime(body.updatedAt)).toBe(true);
  });

  it('2.content 미 입력시 400에러와 오류 코드를 반환해야 한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/replies/',
      payload: {
        postId: postId,
        authorId: replyAuthorId,
        // content: '',
      },
    });

    expect(res.statusCode).toBe(400); // bad request
    const json = res.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(json);
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('3.content 공백 입력시 400에러와 오류 코드를 반환해야 한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/replies/',
      payload: {
        postId: postId,
        authorId: replyAuthorId,
        content: '',
      },
    });

    expect(res.statusCode).toBe(400); // bad request
    const json = res.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(json);
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('4.등록되지 않은 사용자로 댓글 입력시 404에러와 오류 코드를 반환해야 한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/replies/',
      payload: {
        postId: postId,
        authorId: 11111,
        content: '댓글',
      },
    });

    expect(res.statusCode).toBe(404); // not found
    const json = res.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(json);
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'NOT_FOUND');
  });

  it('5.등록되지 않음 글에 댓글 입력시 404에러와 오류 코드를 반환해야 한다.', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/replies/',
      payload: {
        postId: 1,
        authorId: replyAuthorId,
        content: '댓글',
      },
    });

    expect(res.statusCode).toBe(404); // not found
    const json = res.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(json);
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'NOT_FOUND');
  });

  it('6.댓글을 수정하면 성공응답 객체를 반환한다.', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/replies/',
      payload: {
        postId: postId,
        authorId: replyAuthorId,
        content: '입력한 댓글 입니다.',
      },
    });
    expect(reply.statusCode).toBe(200);
    const jsonReply = reply.json();
    // console.log('111 >>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(jsonReply);
    // 댓글을 수정한다.
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/replies/${jsonReply.body.id}`,
      payload: {
        postId: postId,
        authorId: replyAuthorId,
        content: '수정한 댓글 입니다.',
      },
    });

    expect(updated.statusCode).toBe(200);
    const jsonUpdated = updated.json();
    //
    // 수정 결과도 확인한다.
    const list = await app.inject({
      method: 'POST',
      url: '/api/replies/list',
      payload: {},
    });
    const listJson = list.json();
    const replyOne = listJson.body.replies[0];
    expect(replyOne.id).toEqual(jsonUpdated.body.id);
    expect(replyOne.content).toEqual('수정한 댓글 입니다.');
  });

  it('7.댓글 수정 요청시 내용 미 입력시 에러와 오류코드를 반환한다.', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/replies/',
      payload: {
        postId: postId,
        authorId: replyAuthorId,
        content: '입력한 댓글 입니다.',
      },
    });
    expect(reply.statusCode).toBe(200);
    const jsonReply = reply.json();

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/replies/${jsonReply.body.id}`,
      payload: {
        postId: postId,
        authorId: replyAuthorId,
        //content: '',
      },
    });

    expect(updated.statusCode).toBe(400); // bad request
    const jsonUpdated = updated.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(updated.json());
    expect(jsonUpdated).toHaveProperty('success', false);
    expect(jsonUpdated).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('8.존재하지 않는 사용자가 댓글 수정시 404오류 반환 한다.', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/replies/',
      payload: {
        postId: postId,
        authorId: replyAuthorId,
        content: '입력한 댓글 입니다.',
      },
    });
    expect(reply.statusCode).toBe(200);
    const jsonReply = reply.json();

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/replies/${jsonReply.body.id}`,
      payload: {
        postId: postId,
        authorId: 1111,
        content: '수정 댓글',
      },
    });

    expect(updated.statusCode).toBe(404); // not found
    const jsonUpdated = updated.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(updated.json());
    expect(jsonUpdated).toHaveProperty('success', false);
    expect(jsonUpdated).toHaveProperty('code', 'NOT_FOUND');
  });
});

/**
 * 테스트 데이터 생성
 * → 정렬 / 필터 / pagination 테스트용
 */
async function seedReplies(postId: number, authorId: number, count: number) {
  const replies = [];
  const baseTime = new Date('2026-02-01T00:00:00.000Z').getTime();
  const ONE_HOUR = 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const saltTitle = Math.random() < 0.5 ? '수학댓글' : '국어 댓글';

    const createdAt = new Date(baseTime + i * ONE_HOUR);
    const reply = await prisma.reply.create({
      data: {
        postId: postId,
        authorId: authorId,
        content: `댓글-${saltTitle}-${i}`,
        createdAt: createdAt,
      },
    });
    replies.push(reply);
  }
  return replies;
}

describe('ReplyRoute 다중조회', () => {
  let postAuthorId: number;
  let replyAuthorId: number;
  let postId: number;
  let replies: Reply[] = [];

  let app: FastifyInstance;

  beforeAll(async () => {
    // 댓글 작성자 생성
    const replyUser = await prisma.user.create({
      data: {
        email: 'reply@test.com',
        phoneNumber: '+821012345674',
        displayName: 'replier',
      },
    });
    replyAuthorId = replyUser.id;

    // 글 작성자 생성
    const postUser = await prisma.user.create({
      data: {
        email: 'test@test.com',
        phoneNumber: '+821012345678',
        displayName: 'tester',
      },
    });
    postAuthorId = postUser.id;

    const post = await prisma.post.create({
      data: {
        author: {
          connect: { id: postAuthorId },
        },
        title: '글 제목',
        content: '글 본문 입니다.',
      },
    });
    postId = post.id;

    replies = await seedReplies(postId, replyAuthorId, 26);

    //
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  it('1.목록 조회시 성공응답 겍체를 반환한다.', async () => {
    const take = 5;
    const replies = await app.inject({
      method: 'POST',
      url: '/api/replies/list',
      payload: {
        take: take,
      },
    });
    expect(replies.statusCode).toBe(200);
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(replies.json());
    const json = replies.json();
    expect(json).toHaveProperty('success', true);
    expect(json.body.replies).toHaveLength(take);

    const reply = json.body.replies[0];

    expect(reply).toHaveProperty('id');
    expect(reply).toHaveProperty('postId'); // 글 id
    expect(reply).toHaveProperty('content');
    expect(reply).toHaveProperty('createdAt');
    expect(reply).toHaveProperty('author');
    expect(reply.author).toHaveProperty('id'); //댓글 작성자id
    expect(reply.author).toHaveProperty('displayName');

    expect(json.body).toHaveProperty('hasNextPage');
    if (json.body.hasNextPage) {
      expect(json.body).toHaveProperty('nextCursor');
    }
  });

  it('2.조회 결과 데이터가 없어도 성공응답 겍체를 반환한다', async () => {
    const take = 5;
    const replies = await app.inject({
      method: 'POST',
      url: '/api/replies/list',
      payload: {
        authorId: 111,
        take: take,
      },
    });
    expect(replies.statusCode).toBe(200);
    const json = replies.json();

    expect(json).toHaveProperty('success', true);
    expect(json.body).toHaveProperty('replies');
    expect(json.body.replies).toHaveLength(0);
    expect(json.body).toHaveProperty('hasNextPage', false);
  });

  it('3.조회시 오류가 발생하면 에러응답 객체를 반환한다.', async () => {
    const take = -5;
    const replies = await app.inject({
      method: 'POST',
      url: '/api/replies/list',
      payload: {
        authorId: 111,
        take: take,
      },
    });
    const json = replies.json();
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(json);

    expect(replies.statusCode).toBe(400); //bad request
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code');
  });
});
