import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { env } from '../../../src/config/env';

import { createApp } from '../../../src/app';
import { prisma } from '../setup';
import { readdir, rm } from 'fs/promises';
import path from 'path';

describe('PostFile Rounte', () => {
  let app: FastifyInstance;
  let postAuthorId: number;
  let postId: number[] = [];

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
    await prisma.postFile.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();

    await clearUploadsDir(env.UPLOAD_DIR); // 업로드 파일 삭제
  });

  beforeEach(async () => {
    // 각 테스트마다 좋아요 데이터 초기화
    await prisma.postFile.deleteMany();
  });

  async function clearUploadsDir(uploadDir: string) {
    const entries = await readdir(uploadDir, { withFileTypes: true });

    await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(uploadDir, entry.name);

        return rm(fullPath, {
          recursive: true, // 폴더까지 삭제 가능
          force: true, // 없어도 에러 안 남
        });
      }),
    );
  }
});
