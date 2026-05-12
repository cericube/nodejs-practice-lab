import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { prisma } from '../setup';
import { PostFileRepository } from '../../../src/modules/postfile/postfile.repository';

describe('PostFileRepository', () => {
  let postAuthorId: number;
  let postId: number;
  let postId2: number;

  beforeAll(async () => {
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
    postId = post.id;
    //
    const post2 = await prisma.post.create({
      data: {
        author: {
          connect: { id: postAuthorId },
        },
        title: '글 제목2',
        content: '글 본문2 입니다.',
      },
    });
    postId2 = post2.id;
  });

  afterAll(async () => {
    // 글 삭제 후, 사용자 삭제해야 한다. (참조 무결성 유지)
    await prisma.postFile.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();
  });

  beforeEach(async () => {
    // 각 테스트마다 좋아요 데이터 초기화
    await prisma.postFile.deleteMany();
  });

  let repository: PostFileRepository = new PostFileRepository(prisma, 2);

  async function createFileInfo(count: number) {
    const rs: { id: number; fileKey: string }[] = [];
    for (let x = 0; x < count; x++) {
      const result = await repository.createFileInfo({
        fileKey: `aaaa-${x}-2-22-2-22222`,
        fileName: `test${x}-file.txt`,
        contentType: 'text/plain',
        fileSize: 287745789127348n,
      });
      rs.push(result);
    }
    return rs;
  }

  it('1.파일 정보를 등록하면 id와 fileKey를 반환한다.', async () => {
    const result = await repository.createFileInfo({
      fileKey: 'aaaaaaaa-2-22-2-22222',
      fileName: 'test-filer.txt',
      contentType: 'text/plain',
      fileSize: 287745789127348n,
    });

    console.log('파일 업로드 정보 등록 >>  ', result);
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('fileKey');
    expect(result.id).toBeTypeOf('number');
    expect(result.fileKey).toBeTruthy();
  });

  it('2.다수의 파일정보를 게시글에 연결한다.', async () => {
    const results = await createFileInfo(5);
    // [
    //   { id: 134, fileKey: 'aaaa-0-2-22-2-22222' },
    //   { id: 135, fileKey: 'aaaa-1-2-22-2-22222' },
    //   { id: 136, fileKey: 'aaaa-2-2-22-2-22222' },
    //   { id: 137, fileKey: 'aaaa-3-2-22-2-22222' },
    //   { id: 138, fileKey: 'aaaa-4-2-22-2-22222' }
    // ]
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    console.log(results);
    const data = results.slice(0, 2);
    const ids = data.map((item) => item.id);
    console.log(ids);
    const attached = await repository.attachFilesToPost(postId, ids);
    console.log('연결 갯수 >>>>> ', attached);
    expect(attached).toHaveProperty('count', 2);

    //
    const attachedFiles = await prisma.postFile.findMany({
      where: { id: { in: ids } },
    });
    console.log('게시글 연결 결과 점검용 >>> ', attachedFiles);
    expect(attachedFiles).toHaveLength(2);
    // 모든 파일정보가 게신글 ID에 연결되어야 한다.
    const isValid = attachedFiles.every((item) => item.postId === postId);
    expect(isValid).toEqual(true);
  });

  it('3.다운로드 카운트를 증가시킨다.', async () => {
    const results = await createFileInfo(5);
    const data = results.slice(0, 2);
    const ids = data.map((item) => item.id);
    console.log(ids);
    const attached = await repository.attachFilesToPost(postId, ids);
    console.log('연결 갯수 >>>>> ', attached);
    expect(attached).toHaveProperty('count', 2);

    const count = await repository.incrementDownloadCount(ids[0]);
    expect(count).toHaveProperty('downloadCount', 1);

    const count2 = await repository.incrementDownloadCount(ids[0]);
    expect(count2).toHaveProperty('downloadCount', 2);
  });

  it.only('4.다수의 파일 정보를 삭제한다.', async () => {
    const results = await createFileInfo(5);
    const data = results.slice(0, 2);
    const ids = data.map((item) => item.id);
    console.log(ids);
    const attached = await repository.attachFilesToPost(postId, ids);
    console.log('연결 갯수 >>>>> ', attached);
    expect(attached).toHaveProperty('count', 2);

    const deleted = await repository.deleteFileInfos(ids);
  });
});
