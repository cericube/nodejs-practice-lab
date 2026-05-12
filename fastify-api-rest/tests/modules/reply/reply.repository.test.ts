// tests/module/reply/reply.repository.test.ts

import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { ReplyRepository } from '../../../src/modules/reply/reply.repository';
import { prisma } from '../setup';
import { Prisma, Reply } from '../../../src/generated/client';

function isDateTime(value: string) {
  return !Number.isNaN(Date.parse(value));
}

describe('ReplyRepository.create', () => {
  let authorId: number;
  let postId: number;

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

    const post = await prisma.post.create({
      data: {
        author: {
          connect: { id: authorId },
        },
        title: '글 제목',
        content: '글 본문 입니다.',
      },
    });
    postId = post.id;
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

  let repo: ReplyRepository = new ReplyRepository(prisma);

  it('1.유효한 입력으로 댓글을 생성하면 댓글 데이터를 반환한다.', async () => {
    const reply = await repo.create({
      postId: postId,
      authorId: authorId,
      content: '댓글1',
    });
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(reply);
    expect(reply).toBeDefined();
    expect(reply.id).toBeDefined();
    expect(reply).toHaveProperty('postId', postId);
    expect(reply).toHaveProperty('authorId', authorId);
    expect(reply.updatedAt).toBeDefined();
  });

  it('2.존재하지 않는 authorId로 댓글 생성시 에러가 발생한다.', async () => {
    try {
      const reply = await repo.create({
        postId: postId,
        authorId: 3333,
        content: '댓글2',
      });
    } catch (error) {
      // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
      // console.log(error);
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); //No 'User' record  was found
      }
    }
  });

  it('3.존재하지 않는 PostId로 댓글 생성시 에러가 발생한다.', async () => {
    try {
      const reply = await repo.create({
        postId: 11,
        authorId: authorId,
        content: '댓글2',
      });
    } catch (error) {
      // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
      // console.log(error);
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); //No 'Post' record  was found
      }
    }
  });
});

describe('ReplyRepository.update/delete', () => {
  let authorId: number;
  let postId: number;
  let replyId: number;

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

    const post = await prisma.post.create({
      data: {
        author: {
          connect: { id: authorId },
        },
        title: '글 제목',
        content: '글 본문 입니다.',
      },
    });
    postId = post.id;

    const reply = await repo.create({
      postId: postId,
      authorId: authorId,
      content: '댓글1',
    });
    replyId = reply.id;
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  //
  // beforeEach(async () => {
  //   // await prisma.reply.deleteMany();
  // });

  let repo: ReplyRepository = new ReplyRepository(prisma);

  it('1.유효한 입력으로 댓글을 수정하면 댓글 데이터를 반환한다.', async () => {
    const updated = await repo.update({
      id: replyId,
      authorId: authorId,
      content: '수정댓글',
    });
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(updated);
    expect(updated).toBeDefined();
    expect(updated.id).toBeDefined();
    expect(updated).toHaveProperty('postId', postId);
    expect(updated).toHaveProperty('authorId', authorId);
    expect(updated.updatedAt).toBeDefined();

    const check = await prisma.reply.findUnique({
      where: { id: updated.id },
    });
    expect(check?.content).toEqual('수정댓글');
  });

  it('2.댓글 작성자가 아닌 사람이 글 수정을 하면 에러가 발생한다.', async () => {
    try {
      const updated = await repo.update({
        id: replyId,
        authorId: 32134,
        content: '수정댓글',
      });
    } catch (error) {
      // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
      // console.log(error);
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); //No record was found for an update.
      }
    }
  });

  it('3.존재하지 않는 댓글 삭제시 에러가 발생한다.', async () => {
    try {
      const reply = await repo.delete({
        id: 3333,
        // authorId 없는 경우도 체크한다.
      });
    } catch (error) {
      // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
      // console.log(error);
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); //No record was found for an update.
      }
    }
  });

  it('4.authorId 입력시, 글 작성자가 아니면 삭제시 에러가 발생한다.', async () => {
    try {
      const reply = await repo.delete({
        id: replyId,
        authorId: 2222,
      });
    } catch (error) {
      // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
      // console.log(error);
      expect(error).toBeDefined();
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        expect(error.code).toBe('P2025'); //No record was found for an update.
      }
    }
  });

  it('5.authorId없이 삭제(관리자, 글작성자)시 삭제 결과 정보를 반환한다.', async () => {
    const deleted = await repo.delete({
      id: replyId,
    });

    expect(deleted).toBeDefined();
    expect(deleted.id).toBeDefined();
    expect(deleted).toHaveProperty('postId', postId);
    expect(deleted).toHaveProperty('authorId', authorId);
    expect(deleted.updatedAt).toBeDefined();

    const check = await prisma.reply.findUnique({
      where: { id: deleted.id },
    });
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(check);
    expect(check).toBeNull();
  });
});

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

function assertSorted<T>(arr: T[], cmp: (a: T, b: T) => number) {
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i];
    const b = arr[i + 1];
    const r = cmp(a, b); //(a, b) => b.id - a.id
    //
    // 원하는 sort 가 아니면 에러
    if (r > 0) {
      throw new Error(`Not sorted at index ${i}`);
    }
  }
}

describe('ReplyRepository.selectMany', () => {
  let authorId: number;
  let postId: number;
  let replies: Reply[] = [];

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

    const post = await prisma.post.create({
      data: {
        author: {
          connect: { id: authorId },
        },
        title: '글 제목',
        content: '글 본문 입니다.',
      },
    });
    postId = post.id;

    replies = await seedReplies(postId, authorId, 26);
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.reply.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  let repo: ReplyRepository = new ReplyRepository(prisma);

  it('1.조건이 없으면 최신순으로 take+1를 조회한다.', async () => {
    const replies = await repo.selectMany({});
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(replies);
    expect(replies.length).toEqual(11); // take 기본값 = 10;
    assertSorted(replies, (a, b) => b.id - a.id);
    // 결과 구조 확인
    const reply = replies[0];
    expect(Object.keys(reply)).toHaveLength(5);
    expect(reply).toHaveProperty('id');
    expect(reply).toHaveProperty('postId', postId);
    expect(reply).toHaveProperty('author');
    expect(reply.author).toHaveProperty('id', authorId);
    expect(reply.author).toHaveProperty('displayName');
    expect(reply.createdAt).toBeDefined();
  });

  it('2.take=5로, sort=latest 로 조회하면 id 오름차순으로 take+1개를 반환한다.', async () => {
    const replies = await repo.selectMany({
      page: {
        take: 5,
        sort: 'oldest',
      },
    });
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    // console.log(replies);
    expect(replies).toHaveLength(6);
    assertSorted(replies, (a, b) => a.id - b.id);
  });

  it('3.다음 페이지는 cursor 이후 데이터부터 take+1 반환하며 마지막 페이지는 잔여 개수만 반환한다.', async () => {
    const replies = await repo.selectMany({
      page: {
        take: 10,
        sort: 'latest',
      },
    });
    //
    expect(replies).toHaveLength(11);
    assertSorted(replies, (a, b) => b.id - a.id);
    //
    // 정상 take는 10개 이므로 10번째가 cursor id임.
    const cursorId = replies[10 - 1].id;

    const pagedReplies = await repo.selectMany({
      page: {
        take: 10,
        sort: 'latest',
        cursor: { id: cursorId },
      },
    });
    // console.log('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');
    // console.log(pagedReplies);
    expect(pagedReplies).toHaveLength(11);
    // replies의 take+1 ID 부터 읽어와야 한다.
    expect(pagedReplies[0].id).toEqual(replies[10].id);

    // 마지막은 6개이어야 함
    const nextCursorId = pagedReplies[10 - 1].id;
    const lastReplies = await repo.selectMany({
      page: {
        take: 10,
        sort: 'latest',
        cursor: { id: nextCursorId },
      },
    });
    // console.log('************************');
    // console.log(lastReplies);
    // 마지막 페이지임
    expect(lastReplies).toHaveLength(6);
  });

  it('4.authorId 검색시 authorId가 작성한 댓글만 조회한다.', async () => {
    const user2 = await prisma.user.create({
      data: {
        email: 'tes2t@test.com',
        phoneNumber: '+821012345178',
        displayName: 'tester2',
      },
    });
    // 다른 사용자 id로 글 추가
    const reply = await repo.create({
      postId: postId,
      authorId: user2.id,
      content: '댓글 추가',
    });
    //모두 같은 ID인지 확인, false이어야 한다.
    const all = await prisma.reply.findMany({});
    const firstAuthorId = all[0].authorId;
    const hasDifferentAuthorId = all.every((r) => r.authorId !== firstAuthorId);
    expect(hasDifferentAuthorId).toBe(false);

    const replies = await repo.selectMany({
      filter: {
        authorId: authorId,
      },
    });
    assertSorted(replies, (a, b) => b.id - a.id);
    const filtered = replies.filter((r) => r.author.id === authorId);
    expect(filtered.length).toEqual(replies.length);
  });

  it('5.[수학]을 포함하는 댓글만 조회한다.', async () => {
    const replies = await repo.selectMany({
      filter: {
        keyword: '수학',
        authorId: authorId,
      },
      page: {
        take: 10,
        sort: 'latest',
      },
    });

    replies.forEach((reply) => {
      expect(reply.content).toContain('수학');
    });
    assertSorted(replies, (a, b) => b.id - a.id); // 내림차순
  });
});
