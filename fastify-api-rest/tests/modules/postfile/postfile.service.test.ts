import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { PostFileService } from '../../../src/modules/postfile/postfile.service';
import { PostFileRepository } from '../../../src/modules/postfile/postfile.repository';
import { PostRepository } from '../../../src/modules/post/post.repository';
import { prisma } from '../setup';
import type { MultipartFile } from '@fastify/multipart';
import { Readable } from 'stream';
import { access, mkdir, readFile, rm } from 'fs/promises';
import path from 'path';
import { env } from '../../../src/config/env';
import { ErrorCode } from '../../../src/common/errors/error.codes';

describe('PostFileService 파일 등록/삭제', () => {
  let postAuthorId: number;
  let otherUserId: number;
  let postId: number;
  let postId2: number;
  let service: PostFileService;
  let fileRepository: PostFileRepository;
  const testRunId = Date.now();

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `postfile-service-${testRunId}@test.com`,
        phoneNumber: `+8210${String(testRunId).slice(-8)}`,
        displayName: 'postfile-service-tester',
      },
    });
    postAuthorId = user.id;

    const otherUser = await prisma.user.create({
      data: {
        email: `postfile-service-other-${testRunId}@test.com`,
        phoneNumber: `+8211${String(testRunId).slice(-8)}`,
        displayName: 'postfile-service-other',
      },
    });
    otherUserId = otherUser.id;

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

    fileRepository = new PostFileRepository(prisma, 2);
    service = new PostFileService(fileRepository, new PostRepository(prisma));
  });

  afterAll(async () => {
    await prisma.postFile.deleteMany();
    await prisma.post.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
    await clearUploadsDir();
  });

  beforeEach(async () => {
    await prisma.postFile.deleteMany();
    await clearUploadsDir();
  });

  async function clearUploadsDir() {
    await rm(env.UPLOAD_DIR, {
      recursive: true,
      force: true,
    });
    await mkdir(env.UPLOAD_DIR, { recursive: true });
  }

  function makeMultipartFile(
    content: Buffer | string,
    filename: string = 'sample.txt',
    mimetype: string = 'text/plain',
  ): MultipartFile {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return {
      filename,
      mimetype,
      encoding: '7bit',
      fieldname: 'file',
      file: Readable.from(buffer),
      fields: {},
    } as MultipartFile;
  }

  async function uploadTestFile(
    content: Buffer | string,
    filename = 'sample.txt',
    mimetype = 'text/plain',
    userId = postAuthorId,
  ) {
    return service.uploadFile(makeMultipartFile(content, filename, mimetype), { userId });
  }

  async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  function serviceWithPostAuthor(authorId: number | null) {
    return new PostFileService(fileRepository, {
      selectOne: async () => (authorId === null ? null : { authorId }),
    } as unknown as PostRepository);
  }

  function expectBusinessError(
    promise: Promise<unknown>,
    errorCode: ErrorCode,
    statusCode: number,
  ) {
    return expect(promise).rejects.toMatchObject({
      errorCode,
      statusCode,
    });
  }

  it('1. 파일을 실제 디스크에 저장하고 DB 메타데이터도 저장해야 한다.', async () => {
    const content = '파일업로드 테스트용 파일 내용.입니다. @#$ hello upload test';

    const result = await uploadTestFile(content, 'hello.txt', 'text/plain');

    expect(Object.keys(result).sort()).toEqual(['fileKey', 'id']);
    expect(result.id).toBeTypeOf('number');
    expect(result.fileKey).toBeTruthy();

    const savedInDb = await prisma.postFile.findUnique({
      where: { id: result.id },
    });

    expect(savedInDb).not.toBeNull();
    expect(savedInDb?.postId).toBeNull();
    expect(savedInDb?.userId).toBe(postAuthorId);
    expect(savedInDb?.fileKey).toBe(result.fileKey);
    expect(savedInDb?.fileName).toBe('hello.txt');
    expect(savedInDb?.contentType).toBe('text/plain');
    expect(savedInDb?.fileSize.toString()).toBe(Buffer.byteLength(content).toString());
    expect(savedInDb?.downloadCount).toBe(0);

    const savedFilePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);
    const diskContent = await readFile(savedFilePath, 'utf-8');
    expect(diskContent).toBe(content);
  });

  it('2. 빈 파일도 업로드 할 수 있다.', async () => {
    const result = await uploadTestFile('', 'empty.txt', 'text/plain');

    const savedInDb = await prisma.postFile.findUnique({
      where: { id: result.id },
    });
    expect(savedInDb?.fileSize).toBe(0n);

    const savedFilePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);
    const diskContent = await readFile(savedFilePath, 'utf-8');
    expect(diskContent).toBe('');
  });

  it('3. 다운로드시 저장 파일의 스트림과 메타정보를 반환한다.', async () => {
    const content = '<<< 다운로드 테스트 파일내용 입니다. >>> ';
    const result = await uploadTestFile(content, 'download.txt', 'text/plain');

    const { stream, meta } = await service.downloadFile({
      id: result.id,
      fileKey: result.fileKey,
    });

    expect(meta).toEqual({
      fileName: 'download.txt',
      contentType: 'text/plain',
      fileSize: Buffer.byteLength(content).toString(),
    });

    const downloadedBuffer = await streamToBuffer(stream);
    expect(downloadedBuffer.toString()).toBe(content);
  });

  it('4. 다운로드시 downloadCount가 증가해야 한다.', async () => {
    const content = '<<< 다운로드 테스트 파일내용 입니다. >>> ';
    const result = await uploadTestFile(content, 'download.txt', 'text/plain');

    const { stream } = await service.downloadFile({
      id: result.id,
      fileKey: result.fileKey,
    });
    await streamToBuffer(stream);

    await expect
      .poll(async () => {
        const saved = await prisma.postFile.findUnique({
          where: { id: result.id },
        });
        return saved?.downloadCount;
      })
      .toBe(1);
  });

  it('5. 다운로드시 파일 정보가 없으면 NOT_FOUND 오류를 발생한다.', async () => {
    await expectBusinessError(
      service.downloadFile({ id: 999999, fileKey: 'missing-file-key' }),
      ErrorCode.NOT_FOUND,
      404,
    );
  });

  it('6. 다운로드시 fileKey가 일치하지 않으면 NOT_FOUND 오류를 발생한다.', async () => {
    const result = await uploadTestFile('파일 키 불일치 테스트', 'download.txt', 'text/plain');

    await expectBusinessError(
      service.downloadFile({ id: result.id, fileKey: 'wrong-file-key' }),
      ErrorCode.NOT_FOUND,
      404,
    );
  });

  it('7. 다운로드시 실제 파일이 없으면 NOT_FOUND 오류를 발생한다.', async () => {
    const result = await uploadTestFile(
      '<<< 다운로드 테스트 파일내용 입니다. >>> ',
      'download.txt',
    );
    const filePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);
    await rm(filePath, { force: true });

    await expectBusinessError(
      service.downloadFile({ id: result.id, fileKey: result.fileKey }),
      ErrorCode.NOT_FOUND,
      404,
    );
  });

  it('8. 삭제시 DB 레코드와 실제 파일을 삭제해야 한다.', async () => {
    const result = await uploadTestFile('<<< 삭제 테스트 파일내용 입니다. >>> ', 'delete.txt');
    const filePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);

    await expect(access(filePath)).resolves.toBeUndefined();

    const deleted = await service.deleteFile(
      { userId: postAuthorId },
      { id: result.id, fileKey: result.fileKey },
    );

    expect(deleted).toEqual({
      id: result.id,
      fileKey: result.fileKey,
    });
    await expect(access(filePath)).rejects.toBeTruthy();
    await expect(
      prisma.postFile.findUnique({
        where: { id: result.id },
      }),
    ).resolves.toBeNull();
  });

  it('9. 실제 파일이 없어도 DB 삭제는 성공해야 한다.', async () => {
    const result = await uploadTestFile('<<< 삭제 테스트 파일내용 입니다. >>> ', 'delete.txt');
    const filePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);
    await rm(filePath, { force: true });

    const deleted = await service.deleteFile(
      { userId: postAuthorId },
      { id: result.id, fileKey: result.fileKey },
    );

    expect(deleted).toEqual({
      id: result.id,
      fileKey: result.fileKey,
    });
    await expect(
      prisma.postFile.findUnique({
        where: { id: result.id },
      }),
    ).resolves.toBeNull();
  });

  it('10. 삭제 대상이 없으면 NOT_FOUND 오류를 발생한다.', async () => {
    await expectBusinessError(
      service.deleteFile({ userId: postAuthorId }, { id: 999999, fileKey: 'missing-file-key' }),
      ErrorCode.NOT_FOUND,
      404,
    );
  });

  it('11. 파일 소유자가 다르면 NOT_FOUND 오류를 발생한다.', async () => {
    const result = await uploadTestFile('소유자 검증 테스트', 'owner.txt');

    await expectBusinessError(
      service.deleteFile({ userId: otherUserId }, { id: result.id, fileKey: result.fileKey }),
      ErrorCode.NOT_FOUND,
      404,
    );
  });

  it('12. 업로드된 파일들을 게시글에 연결한다.', async () => {
    const one = await uploadTestFile('1번 파일', 'one.txt');
    const two = await uploadTestFile('2번 파일', 'two.txt');
    const attachService = serviceWithPostAuthor(postAuthorId);

    const result = await attachService.attachFileToPost(
      { userId: postAuthorId, postId },
      { fileIds: [one.id, two.id] },
    );

    expect(result).toEqual({ count: 2 });

    const attached = await prisma.postFile.findMany({
      where: { id: { in: [one.id, two.id] } },
      orderBy: { id: 'asc' },
    });
    expect(attached.map((file) => file.postId)).toEqual([postId, postId]);
  });

  it('13. 게시글 작성자가 아니면 파일 연결을 차단한다.', async () => {
    const result = await uploadTestFile('권한 테스트', 'forbidden.txt', 'text/plain', otherUserId);
    const attachService = serviceWithPostAuthor(postAuthorId);

    await expectBusinessError(
      attachService.attachFileToPost({ userId: otherUserId, postId }, { fileIds: [result.id] }),
      ErrorCode.FORBIDDEN,
      403,
    );
  });

  it('14. 파일 허용 개수를 초과하여 연결하면 FILE_COUNT_EXCEEDED 오류를 발생한다.', async () => {
    const attachService = serviceWithPostAuthor(postAuthorId);
    const firstFiles = [
      await uploadTestFile('1번 파일', 'one.txt'),
      await uploadTestFile('2번 파일', 'two.txt'),
    ];
    await attachService.attachFileToPost(
      { userId: postAuthorId, postId },
      { fileIds: firstFiles.map((file) => file.id) },
    );

    const extraFile = await uploadTestFile('3번 파일', 'three.txt');

    await expectBusinessError(
      attachService.attachFileToPost({ userId: postAuthorId, postId }, { fileIds: [extraFile.id] }),
      ErrorCode.FILE_COUNT_EXCEEDED,
      400,
    );
  });

  it('15. 해당 게시글의 파일 목록만 반환한다.', async () => {
    const post1Files = [
      await uploadTestFile('1번 파일', 'one.txt'),
      await uploadTestFile('2번 파일', 'two.txt'),
    ];
    const post2File = await uploadTestFile('3번 파일', 'three.txt');

    await fileRepository.attachFilesToPost({
      userId: postAuthorId,
      postId,
      fileIds: post1Files.map((file) => file.id),
    });
    await fileRepository.attachFilesToPost({
      userId: postAuthorId,
      postId: postId2,
      fileIds: [post2File.id],
    });

    const result = await service.listFilesByPostId({ postId });

    expect(result.files).toHaveLength(2);
    expect(result.files.map((file) => file.id)).toEqual(post1Files.map((file) => file.id));
    expect(result.files.every((file) => file.postId === postId)).toBe(true);
    expect(result.files[0]).toEqual({
      id: post1Files[0].id,
      postId,
      fileKey: post1Files[0].fileKey,
      fileName: 'one.txt',
      contentType: 'text/plain',
      fileSize: Buffer.byteLength('1번 파일').toString(),
      downloadCount: 0,
      createdAt: expect.any(String),
    });
    expect(Date.parse(result.files[0].createdAt)).not.toBeNaN();
  });

  it('16. 파일이 없으면 빈 배열을 반환한다.', async () => {
    await expect(service.listFilesByPostId({ postId })).resolves.toEqual({ files: [] });
  });
});
