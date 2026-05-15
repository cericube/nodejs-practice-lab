import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../setup';
import { BusinessError } from '../../../src/common/errors/business.error';
import { ErrorCode } from '../../../src/common/errors/error.codes';
import { PostFileRepository } from '../../../src/modules/postfile/postfile.repository';

describe('PostFileRepository', () => {
  let postAuthorId: number;
  let postId: number;
  let postId2: number;
  let repository: PostFileRepository;
  let fileKeySequence = 0;
  const testRunId = Date.now();

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `postfile-repository-${testRunId}@test.com`,
        phoneNumber: `+8210${String(testRunId).slice(-8)}`,
        displayName: 'postfile-repository-tester',
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

    repository = new PostFileRepository(prisma, 2);
  });

  afterAll(async () => {
    await prisma.postFile.deleteMany();
    await prisma.post.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
  });

  beforeEach(async () => {
    await prisma.postFile.deleteMany();
  });

  async function createFileInfos(count: number) {
    const results: { id: number; fileKey: string }[] = [];

    for (let index = 0; index < count; index++) {
      fileKeySequence += 1;

      const result = await repository.createFileInfo({
        fileKey: `postfile-repository-${Date.now()}-${fileKeySequence}`,
        fileName: `test-${fileKeySequence}.txt`,
        contentType: 'text/plain',
        fileSize: 287745789127348n,
        userId: postAuthorId,
      });

      results.push(result);
    }

    return results;
  }

  async function attachFiles(postIdToAttach: number, fileIds: number[]) {
    return repository.attachFilesToPost({
      userId: postAuthorId,
      postId: postIdToAttach,
      fileIds,
    });
  }

  it('1. 파일 정보를 등록하면 id와 fileKey를 반환하고 DB에 메타데이터를 저장한다.', async () => {
    const fileSize = 287745789127348n;
    const fileKey = `postfile-repository-create-${testRunId}`;
    const result = await repository.createFileInfo({
      fileKey,
      fileName: 'test-file.txt',
      contentType: 'text/plain',
      fileSize,
      userId: postAuthorId,
    });

    expect(Object.keys(result).sort()).toEqual(['fileKey', 'id']);
    expect(result.id).toBeTypeOf('number');
    expect(result.fileKey).toBe(fileKey);

    const saved = await prisma.postFile.findUnique({
      where: { id: result.id },
    });

    expect(saved).not.toBeNull();
    expect(saved?.userId).toBe(postAuthorId);
    expect(saved?.postId).toBeNull();
    expect(saved?.fileKey).toBe(fileKey);
    expect(saved?.fileName).toBe('test-file.txt');
    expect(saved?.contentType).toBe('text/plain');
    expect(saved?.fileSize).toBe(fileSize);
    expect(saved?.downloadCount).toBe(0);
  });

  it('2. 다수의 파일 정보를 게시글에 연결한다.', async () => {
    const results = await createFileInfos(2);
    const ids = results.map((item) => item.id);

    const attached = await attachFiles(postId, ids);

    expect(attached).toEqual({ count: 2 });

    const attachedFiles = await prisma.postFile.findMany({
      where: { id: { in: ids } },
    });

    expect(attachedFiles).toHaveLength(2);
    expect(attachedFiles.every((item) => item.postId === postId)).toBe(true);
  });

  it('3. 게시글의 파일 제한 개수를 초과하면 BusinessError를 발생시킨다.', async () => {
    const firstFiles = await createFileInfos(2);
    await attachFiles(
      postId,
      firstFiles.map((item) => item.id),
    );

    const extraFile = await createFileInfos(1);

    let error: unknown;
    try {
      await attachFiles(
        postId,
        extraFile.map((item) => item.id),
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BusinessError);
    expect(error).toMatchObject({
      errorCode: ErrorCode.FILE_COUNT_EXCEEDED,
      statusCode: 400,
    });

    const notAttached = await prisma.postFile.findUnique({
      where: { id: extraFile[0].id },
    });
    expect(notAttached?.postId).toBeNull();
  });

  it('4. 다운로드 카운트를 증가시킨다.', async () => {
    const results = await createFileInfos(1);
    const id = results[0].id;
    await attachFiles(postId, [id]);

    const count = await repository.incrementDownloadCount(id);
    const count2 = await repository.incrementDownloadCount(id);

    expect(count).toEqual({ downloadCount: 1 });
    expect(count2).toEqual({ downloadCount: 2 });
  });

  it('5. 파일 소유자와 fileKey가 일치하면 파일 메타데이터를 삭제한다.', async () => {
    const results = await createFileInfos(2);
    const fileToDelete = results[0];
    const idToKeep = results[1].id;

    const deleted = await repository.deleteFileInfo(postAuthorId, {
      id: fileToDelete.id,
      fileKey: fileToDelete.fileKey,
    });

    expect(deleted).toEqual({
      id: fileToDelete.id,
      fileKey: fileToDelete.fileKey,
      fileName: expect.any(String),
    });
    await expect(
      prisma.postFile.findUnique({
        where: { id: fileToDelete.id },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.postFile.findUnique({
        where: { id: idToKeep },
      }),
    ).resolves.not.toBeNull();
  });

  it('6. fileKey 또는 소유자가 다르면 파일 메타데이터를 삭제하지 않는다.', async () => {
    const [file] = await createFileInfos(1);

    await expect(
      repository.deleteFileInfo(postAuthorId, {
        id: file.id,
        fileKey: 'wrong-file-key',
      }),
    ).rejects.toMatchObject({ code: 'P2025' });

    await expect(
      repository.deleteFileInfo(postAuthorId + 999999, {
        id: file.id,
        fileKey: file.fileKey,
      }),
    ).rejects.toMatchObject({ code: 'P2025' });

    await expect(
      prisma.postFile.findUnique({
        where: { id: file.id },
      }),
    ).resolves.not.toBeNull();
  });

  it('7. 파일 id로 단건 메타데이터를 조회하고 없으면 null을 반환한다.', async () => {
    const results = await createFileInfos(1);
    const id = results[0].id;
    await attachFiles(postId, [id]);

    const fileInfo = await repository.getFileInfoById(id);
    const missingFileInfo = await repository.getFileInfoById(999999999);

    expect(fileInfo).toEqual({
      id,
      postId,
      fileKey: results[0].fileKey,
      fileName: expect.any(String),
      contentType: 'text/plain',
      fileSize: 287745789127348n,
      downloadCount: 0,
      createdAt: expect.any(Date),
    });
    expect(fileInfo).not.toHaveProperty('userId');
    expect(missingFileInfo).toBeNull();
  });

  it('8. 특정 게시글의 파일 목록만 id 오름차순으로 반환한다.', async () => {
    const post1Files = await createFileInfos(2);
    const post2Files = await createFileInfos(1);
    await attachFiles(
      postId,
      post1Files.map((item) => item.id),
    );
    await attachFiles(
      postId2,
      post2Files.map((item) => item.id),
    );

    const fileInfos = await repository.listFileInfosByPostId(postId);

    expect(fileInfos).toHaveLength(2);
    expect(fileInfos.map((item) => item.id)).toEqual(
      post1Files.map((item) => item.id).sort((a, b) => a - b),
    );
    expect(fileInfos.every((item) => item.postId === postId)).toBe(true);
    expect(fileInfos[0]).toEqual({
      id: post1Files[0].id,
      postId,
      fileKey: post1Files[0].fileKey,
      fileName: expect.any(String),
      contentType: 'text/plain',
      fileSize: 287745789127348n,
      downloadCount: 0,
      createdAt: expect.any(Date),
    });
    expect(fileInfos[0]).not.toHaveProperty('userId');
  });

  it('9. 게시글에 연결된 파일이 없으면 빈 배열을 반환한다.', async () => {
    await expect(repository.listFileInfosByPostId(postId)).resolves.toEqual([]);
  });
});
