import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import { PostFileService } from '../../../src/modules/postfile/postfile.service';
import { PostFileRepository } from '../../../src/modules/postfile/postfile.repository';
import { prisma } from '../setup';
import { MultipartFile } from '@fastify/multipart';
import { Readable } from 'stream';
import { access, readdir, readFile, rm } from 'fs/promises';
import path from 'path';
import { env } from '../../../src/config/env';
import { ErrorCode } from '../../../src/common/errors/error.codes';
import { BusinessError } from '../../../src/common/errors/business.error';

describe('PostFileService 파일 등록/삭제', () => {
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

  function makeMultipartFile(
    content: Buffer | string,
    filename: string = 'sample.txt',
    mimetype: string = 'text/plain',
  ): MultipartFile {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return {
      filename,
      mimetype,
      encoding: '7bit', //7비트 ASCII (기본값, 변환 없음)
      fieldname: 'file',
      file: Readable.from(buffer),
      fields: {},
    } as MultipartFile;
  }

  async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  let service: PostFileService = new PostFileService(new PostFileRepository(prisma, 2));

  it('1.파일을 실제 디스크에 저장하고 DB 메타데이터도 저장해야 한다.', async () => {
    const content = '파일업로드 테스트용 파일 내용.입니다. @#$ hello upload test';
    const file = makeMultipartFile(content, 'hello.txt', 'text/plain');

    const result = await service.uploadFile(file, { id: postId });
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    console.log(result);

    expect(result.id).toBeTypeOf('number');
    expect(result.postId).toBe(postId);
    expect(result.fileKey).toBeTruthy();
    expect(result.fileName).toBe('hello.txt');
    expect(result.contentType).toBe('text/plain');
    expect(result.fileSize).toBe(Buffer.byteLength(content).toString()); //문자열 확인
    expect(result.downloadCount).toBe(0);
    // DB 저장내용 확인
    const savedInDb = await prisma.postFile.findUnique({
      where: { id: result.id },
    });

    expect(savedInDb).not.toBeNull();
    expect(savedInDb?.postId).toBe(postId);
    expect(savedInDb?.fileKey).toBe(result.fileKey);
    expect(savedInDb?.fileName).toBe('hello.txt');
    expect(savedInDb?.contentType).toBe('text/plain');
    expect(savedInDb?.fileSize.toString()).toBe(Buffer.byteLength(content).toString());

    //파일 검사
    const savedFilePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);
    const diskContent = await readFile(savedFilePath, 'utf-8');
    console.log('업로드한 파일 내용 >>', diskContent);
    expect(diskContent).toBe(content);
  });

  it('2.빈 파일도 업로드 할 수 있다.', async () => {
    const file = makeMultipartFile('', 'empty.txt', 'text/plain');

    const result = await service.uploadFile(file, { id: postId });

    expect(result.fileSize).toBe('0');

    const savedFilePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);
    const diskContent = await readFile(savedFilePath, 'utf-8');
    expect(diskContent).toBe('');
  });

  it('3.다운로드시 저장 파일의 스트림과 메타정보를 반환한다.', async () => {
    const content = '<<< 다운로드 테스트 파일내용 입니다. >>> ';
    const file = makeMultipartFile(content, 'download.txt', 'text/plain');
    const result = await service.uploadFile(file, { id: postId });

    //다운로드.
    const { stream, meta } = await service.downloadFile({ id: result.id });
    console.log('다운로드 >> ', meta);
    expect(meta.fileName).toBe('download.txt');
    expect(meta.contentType).toBe('text/plain');
    expect(meta.fileSize).toBe(Buffer.byteLength(content).toString());

    const downloadedBuffer = await streamToBuffer(stream);
    expect(downloadedBuffer.toString()).toBe(content);
  });

  it('4.다운로드시 downloadCount가 증가해야 한다.', async () => {
    const content = '<<< 다운로드 테스트 파일내용 입니다. >>> ';
    const file = makeMultipartFile(content, 'download.txt', 'text/plain');
    const result = await service.uploadFile(file, { id: postId });

    //다운로드.
    const { stream, meta } = await service.downloadFile({ id: result.id });
    console.log('다운로드 >> ', meta);
    //
    const saved = await prisma.postFile.findUnique({
      where: { id: result.id },
    });

    console.log('저장데이터 확인 >> ', saved);
    expect(saved?.downloadCount).toBe(1);
  });

  it('5.다운로드시 파일 정보가 없으면 NOT_FOUND오류를 발생한다.', async () => {
    try {
      const result = await service.downloadFile({ id: 999999 });
      throw Error('BusinessError가 발생해야 합니다.');
    } catch (error) {
      console.log(error);
      if (error instanceof BusinessError) {
        expect(error.errorCode).toBe(ErrorCode.NOT_FOUND);
        expect(error.statusCode).toBe(404);
      } else {
        throw Error('BusinessError가 발생해야 합니다.');
      }
    }
  });

  it('6.다운로드시 실제 파일이 없으면 NOT_FOUND 오류를 발생한다.', async () => {
    const content = '<<< 다운로드 테스트 파일내용 입니다. >>> ';
    const file = makeMultipartFile(content, 'download.txt', 'text/plain');
    const result = await service.uploadFile(file, { id: postId });

    //
    const filePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);
    await rm(filePath, { force: true });

    //다운로드.
    try {
      const { stream, meta } = await service.downloadFile({ id: result.id });
      console.log('다운로드 >> ', meta);
      throw Error('BusinessError가 발생해야 합니다.');
    } catch (error) {
      console.log(error);
      if (error instanceof BusinessError) {
        expect(error.errorCode).toBe(ErrorCode.NOT_FOUND);
        expect(error.statusCode).toBe(404);
      } else {
        throw Error('BusinessError가 발생해야 합니다.');
      }
    }
  });

  it('7.삭제시 DB레코드와 실제 파일을 삭제해야 한다.', async () => {
    const content = '<<< 삭제 테스트 파일내용 입니다. >>> ';
    const file = makeMultipartFile(content, 'delete.txt', 'text/plain');
    const result = await service.uploadFile(file, { id: postId });
    //
    const filePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);

    //이 파일 경로에 실제 파일이 존재해서 access가 성공해야 한다
    await expect(access(filePath)).resolves.toBeUndefined();

    //삭제 수행
    const deleted = await service.deleteFile({ id: result.id });

    expect(deleted.id).toBe(result.id);
    expect(deleted.fileKey).toBe(result.fileKey);
    expect(deleted.fileName).toBe('delete.txt');
    //
    expect(deleted.id).toBe(result.id);
    expect(deleted.fileKey).toBe(result.fileKey);
    expect(deleted.fileName).toBe('delete.txt');

    //access(filePath)가 실패(reject) 해야 한다
    await expect(access(filePath)).rejects.toBeTruthy();
  });

  it('7.실제 파일이 없어도, db 삭제는 성공해야 한다.', async () => {
    const content = '<<< 삭제 테스트 파일내용 입니다. >>> ';
    const file = makeMultipartFile(content, 'delete.txt', 'text/plain');
    const result = await service.uploadFile(file, { id: postId });
    //
    const filePath = path.join(env.UPLOAD_DIR, `${result.fileKey}.txt`);
    await rm(filePath, { force: true });
    //삭제 확인
    //access(filePath)가 실패(reject) 해야 한다
    await expect(access(filePath)).rejects.toBeTruthy();

    // 파일 삭제
    const deleted = await service.deleteFile({ id: result.id });
    expect(deleted.id).toBe(result.id);

    // db 레코드 확인
    const dbRow = await prisma.postFile.findUnique({
      where: { id: result.id },
    });
    expect(dbRow).toBeNull();
  });

  it('8.삭제 대상이 없으면 NOT_FOUND 오류를 발생한다.', async () => {
    try {
      const result = await service.deleteFile({ id: 999999 });
      throw Error('BusinessError가 발생해야 합니다.');
    } catch (error) {
      console.log(error);
      if (error instanceof BusinessError) {
        expect(error.errorCode).toBe(ErrorCode.NOT_FOUND);
        expect(error.statusCode).toBe(404);
      } else {
        throw Error('BusinessError가 발생해야 합니다.');
      }
    }
  });

  it('9.파일을 허용갯수를 초과하여 등록시 FILE_COUNT_EXCEEDED 오류를 발생한다.', async () => {
    // new PostFileService(new PostFileRepository(prisma, 2));
    // 허용 갯수 : 2개 임
    const content = '파일업로드 테스트용 파일 내용.입니다. @#$ hello upload test';
    const file = makeMultipartFile(content, 'hello.txt', 'text/plain');

    const one = await service.uploadFile(file, { id: postId });
    console.log('1번 파일 업로드: ', one);

    const two = await service.uploadFile(file, { id: postId });
    console.log('2번 파일 업로드: ', two);

    try {
      const three = await service.uploadFile(file, { id: postId });
      console.log('3번 파일 업로드: ', three);
      throw Error('BusinessError가 발생해야 합니다.');
    } catch (error) {
      console.log(error);
      if (error instanceof BusinessError) {
        expect(error.errorCode).toBe(ErrorCode.FILE_COUNT_EXCEEDED);
        expect(error.statusCode).toBe(400);
      } else {
        throw Error('BusinessError가 발생해야 합니다.');
      }
    }
  });

  it('10.해당 게시글의 파일 목록만 반환한다.', async () => {
    const content = '파일업로드 테스트용 파일 내용.입니다. @#$ hello upload test';
    const file = makeMultipartFile(content, 'hello.txt', 'text/plain');

    const one = await service.uploadFile(file, { id: postId });
    console.log('1번 파일 업로드: ', one);

    const two = await service.uploadFile(file, { id: postId });
    console.log('2번 파일 업로드: ', two);

    const three = await service.uploadFile(file, { id: postId2 });
    console.log('3번 파일 업로드: ', three);

    const result = await service.listFilesByPostId({ id: postId });
    expect(result.files).toHaveLength(2);
    expect(result.files.every((f) => f.postId === postId)).toBe(true);
    expect(result.files[0]).toHaveProperty('id');
    expect(result.files[0]).toHaveProperty('postId', postId);
    expect(result.files[0]).toHaveProperty('fileKey');
    expect(result.files[0]).toHaveProperty('fileName');
    expect(result.files[0]).toHaveProperty('contentType');
    expect(result.files[0]).toHaveProperty('fileSize');
    expect(result.files[0]).toHaveProperty('downloadCount', 0);
    expect(result.files[0]).toHaveProperty('createdAt');
  });

  it('11.파일이 없으면 빈 배열을 반환한다.', async () => {
    const result = await service.listFilesByPostId({ id: postId });
    console.log('빈 목록 >> ', result);
    expect(result).toEqual({ files: [] });
  });
});
