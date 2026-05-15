/**
 * PostFile Route 테스트 스위트
 *
 * 이 파일은 서비스/레포지토리를 직접 호출하지 않고 Fastify `app.inject()`로
 * 실제 HTTP 라우트에 가까운 방식으로 요청을 보냅니다.
 *
 * 검증 범위:
 * - multipart/form-data 파일 업로드
 * - 업로드된 파일을 게시글에 연결
 * - 다운로드 응답 body/header 확인
 * - 삭제 시 DB 레코드와 디스크 파일 정리 확인
 * - 게시글별 첨부파일 목록 조회
 * - 라우트 스키마 validation/error response 확인
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { env } from '../../../src/config/env';

import { createApp } from '../../../src/app';
import { prisma } from '../setup';
import { access, mkdir, readdir, readFile, rm } from 'fs/promises';
import path from 'path';

describe('PostFile Route', () => {
  // beforeAll에서 한 번 생성한 테스트 fixture를 각 테스트가 공유합니다.
  // postFile 데이터와 업로드 디렉토리는 beforeEach에서 매번 비워 테스트 간 영향을 차단합니다.
  let app: FastifyInstance; // Fastify 애플리케이션 인스턴스
  let postAuthorId: number; // 게시글 작성자 ID
  let otherUserId: number; // 다른 사용자 ID (권한 테스트용)
  let postId: number[] = []; // 게시글 ID 배열
  const testRunId = Date.now(); // 테스트 실행 고유 ID (중복 방지)

  /**
   * 모든 테스트 실행 전 한 번만 실행
   * - 테스트용 사용자 2명 생성
   * - 게시글 2개 생성
   * - Fastify 앱 초기화
   */
  beforeAll(async () => {
    // 테스트용 주 유저 생성
    const user = await prisma.user.create({
      data: {
        email: `postfile-route-${testRunId}@test.com`,
        phoneNumber: `+8210${String(testRunId).slice(-8)}`,
        displayName: 'postfile-route-tester',
      },
    });
    postAuthorId = user.id;

    // 권한 테스트용 다른 유저 생성
    const otherUser = await prisma.user.create({
      data: {
        email: `postfile-route-other-${testRunId}@test.com`,
        phoneNumber: `+8211${String(testRunId).slice(-8)}`,
        displayName: 'postfile-route-other',
      },
    });
    otherUserId = otherUser.id;

    // 주 유저의 첫 번째 게시글 생성
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

    // 주 유저의 두 번째 게시글 생성
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

    // Fastify 앱 생성 및 준비
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    // 참조 무결성을 위해 자식 테이블(postFile/post)을 먼저 지우고 user/profile을 정리합니다.
    await prisma.postFile.deleteMany();
    await prisma.post.deleteMany();
    await prisma.user.deleteMany();
    await prisma.profile.deleteMany();

    await clearUploadsDir(); // 업로드 파일 삭제
    await app.close();
  });

  beforeEach(async () => {
    // 파일 테스트는 DB와 파일 시스템을 함께 사용하므로 두 저장소를 모두 초기화합니다.
    await prisma.postFile.deleteMany();
    await clearUploadsDir();
  });

  /**
   * env.UPLOAD_DIR 내부만 비웁니다.
   *
   * 서비스는 실제 디스크에 파일을 쓰므로, 테스트가 실패하더라도 다음 테스트에
   * 이전 파일이 남아 영향을 주지 않도록 매번 업로드 디렉토리를 정리합니다.
   */
  async function clearUploadsDir() {
    await mkdir(env.UPLOAD_DIR, { recursive: true });
    const entries = await readdir(env.UPLOAD_DIR, { withFileTypes: true });

    await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(env.UPLOAD_DIR, entry.name);

        return rm(fullPath, {
          recursive: true, // 폴더까지 삭제 가능
          force: true, // 없어도 에러 안 남
        });
      }),
    );
  }

  /**
   * Fastify inject에 전달할 multipart/form-data 요청 본문을 직접 만듭니다.
   *
   * 브라우저의 FormData를 사용할 수 없는 Node 테스트 환경이므로 boundary와
   * Content-Disposition 헤더를 수동으로 구성합니다. route의 request.files()가
   * 실제 업로드 요청처럼 파일 스트림을 읽을 수 있어야 합니다.
   */
  function multipartPayload(
    fieldName: string,
    filename: string,
    contentType: string,
    content: string | Buffer,
  ) {
    const boundary = `----vitest-postfile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const body = Buffer.concat([
      Buffer.from(
        [
          `--${boundary}`,
          `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"`,
          `Content-Type: ${contentType}`,
          '',
          '',
        ].join('\r\n'),
      ),
      Buffer.isBuffer(content) ? content : Buffer.from(content),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    return {
      body,
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  /**
   * 파일 업로드 route 호출을 공통화한 헬퍼입니다.
   *
   * 반환값은 후속 테스트에서 attach/download/delete 요청에 필요한 최소 식별자입니다.
   * 업로드 API는 여러 파일을 받을 수 있어 응답 body가 배열이므로 첫 번째 항목을 반환합니다.
   */
  async function uploadFile(
    content = '라우트 파일 업로드 테스트',
    filename = 'route-upload.txt',
    contentType = 'text/plain',
    userId = postAuthorId,
  ) {
    const multipart = multipartPayload('file', filename, contentType, content);

    const res = await app.inject({
      method: 'POST',
      url: `/api/files/${userId}`,
      headers: {
        'content-type': multipart.contentType,
      },
      payload: multipart.body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json).toHaveProperty('success', true);
    expect(json.body).toHaveLength(1);

    return json.body[0] as { id: number; fileKey: string };
  }

  it('1. 파일 업로드 요청시 파일을 저장하고 성공 응답을 반환해야 한다.', async () => {
    const content = '파일 업로드 route 테스트 내용입니다.';

    const uploaded = await uploadFile(content, 'hello-route.txt', 'text/plain');

    expect(uploaded.id).toBeTypeOf('number');
    expect(uploaded.fileKey).toBeTruthy();

    // 라우트 응답뿐 아니라 DB에 저장된 메타데이터까지 확인합니다.
    // 업로드 직후에는 아직 게시글에 첨부되지 않았으므로 postId가 null이어야 합니다.
    const savedInDb = await prisma.postFile.findUnique({
      where: { id: uploaded.id },
    });
    expect(savedInDb).not.toBeNull();
    expect(savedInDb?.userId).toBe(postAuthorId);
    expect(savedInDb?.postId).toBeNull();
    expect(savedInDb?.fileName).toBe('hello-route.txt');
    expect(savedInDb?.contentType).toBe('text/plain');
    expect(savedInDb?.fileSize.toString()).toBe(Buffer.byteLength(content).toString());

    // 서비스 저장 규칙: 실제 파일명은 `${fileKey}${원본확장자}` 형태입니다.
    // DB만 저장되고 디스크 쓰기가 누락되는 회귀를 잡기 위해 파일 내용까지 읽어 봅니다.
    const savedFilePath = path.join(env.UPLOAD_DIR, `${uploaded.fileKey}.txt`);
    await expect(readFile(savedFilePath, 'utf-8')).resolves.toBe(content);
  });

  it('2. 업로드된 파일들을 게시글에 연결하면 count를 반환해야 한다.', async () => {
    const one = await uploadFile('1번 파일', 'one.txt');
    const two = await uploadFile('2번 파일', 'two.txt');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/files/attach/${postAuthorId}/${postId[0]}`,
      payload: {
        fileIds: [one.id, two.id],
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json).toEqual({
      success: true,
      body: { count: 2 },
    });

    // 응답 count만으로는 실제 연결 대상이 맞는지 알 수 없으므로 DB의 postId를 직접 확인합니다.
    const attached = await prisma.postFile.findMany({
      where: { id: { in: [one.id, two.id] } },
      orderBy: { id: 'asc' },
    });
    expect(attached.map((file) => file.postId)).toEqual([postId[0], postId[0]]);
  });

  it('3. 게시글 작성자가 아니면 파일 연결 요청에 403 FORBIDDEN을 반환해야 한다.', async () => {
    const uploaded = await uploadFile(
      '권한 없는 연결 테스트',
      'forbidden.txt',
      'text/plain',
      otherUserId,
    );

    // 파일 소유자가 otherUser여도, 대상 게시글의 작성자가 아니면 attach는 금지되어야 합니다.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/files/attach/${otherUserId}/${postId[0]}`,
      payload: {
        fileIds: [uploaded.id],
      },
    });

    expect(res.statusCode).toBe(403);
    const json = res.json();
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'FORBIDDEN');
  });

  it('4. 파일 다운로드 요청시 원본 파일과 다운로드 헤더를 반환해야 한다.', async () => {
    const content = '다운로드 route 테스트 내용입니다.';
    const uploaded = await uploadFile(content, 'download-route.txt', 'text/plain');

    const res = await app.inject({
      method: 'GET',
      url: `/api/files/download/${uploaded.id}?fileKey=${uploaded.fileKey}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('download-route.txt');
    expect(res.headers['content-length']).toBe(Buffer.byteLength(content).toString());
    expect(res.body).toBe(content);

    // downloadCount 증가는 다운로드 응답 이후 비동기로 처리되므로 poll로 최종 반영을 기다립니다.
    await expect
      .poll(async () => {
        const saved = await prisma.postFile.findUnique({
          where: { id: uploaded.id },
        });
        return saved?.downloadCount;
      })
      .toBe(1);
  });

  it('5. fileKey가 일치하지 않는 다운로드 요청은 404 NOT_FOUND를 반환해야 한다.', async () => {
    const uploaded = await uploadFile('다운로드 오류 테스트', 'download-error.txt');

    // id만 알고 fileKey가 다르면 같은 파일로 인정하지 않아야 합니다.
    // 파일 URL 추측이나 잘못된 접근을 NOT_FOUND로 숨기는 계약을 검증합니다.
    const res = await app.inject({
      method: 'GET',
      url: `/api/files/download/${uploaded.id}?fileKey=wrong-file-key`,
    });

    expect(res.statusCode).toBe(404);
    const json = res.json();
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'NOT_FOUND');
  });

  it('6. 파일 삭제 요청시 DB 레코드와 실제 파일을 삭제해야 한다.', async () => {
    const uploaded = await uploadFile('삭제 route 테스트 내용입니다.', 'delete-route.txt');
    const savedFilePath = path.join(env.UPLOAD_DIR, `${uploaded.fileKey}.txt`);
    // 삭제 전 실제 파일이 존재하는지 먼저 확인해야 삭제 검증이 의미를 가집니다.
    await expect(access(savedFilePath)).resolves.toBeUndefined();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/files/${postAuthorId}?id=${uploaded.id}&fileKey=${uploaded.fileKey}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      body: uploaded,
    });
    // 삭제 후에는 파일 시스템과 DB 양쪽에서 모두 사라져야 합니다.
    await expect(access(savedFilePath)).rejects.toBeTruthy();
    await expect(prisma.postFile.findUnique({ where: { id: uploaded.id } })).resolves.toBeNull();
  });

  it('7. 게시글에 첨부된 파일 목록만 반환해야 한다.', async () => {
    // 두 게시글에 파일을 나눠 연결한 뒤, postId[0] 조회 결과가 섞이지 않는지 확인합니다.
    const post1Files = [
      await uploadFile('1번 파일', 'one.txt'),
      await uploadFile('2번 파일', 'two.txt'),
    ];
    const post2File = await uploadFile('3번 파일', 'three.txt');

    await app.inject({
      method: 'PATCH',
      url: `/api/files/attach/${postAuthorId}/${postId[0]}`,
      payload: {
        fileIds: post1Files.map((file) => file.id),
      },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/files/attach/${postAuthorId}/${postId[1]}`,
      payload: {
        fileIds: [post2File.id],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/files/list/${postId[0]}`,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json).toHaveProperty('success', true);
    expect(json.body.files).toHaveLength(2);
    expect(json.body.files.map((file: { id: number }) => file.id)).toEqual(
      // 라우트는 repository의 id asc 정렬 결과를 그대로 내려주므로 업로드 순서를 기대합니다.
      post1Files.map((file) => file.id),
    );
    expect(json.body.files[0]).toEqual({
      id: post1Files[0].id,
      postId: postId[0],
      fileKey: post1Files[0].fileKey,
      fileName: 'one.txt',
      contentType: 'text/plain',
      fileSize: Buffer.byteLength('1번 파일').toString(),
      downloadCount: 0,
      createdAt: expect.any(String),
    });
    // createdAt은 문자열 포맷으로 직렬화되지만, 실제 날짜로 파싱 가능해야 합니다.
    expect(Date.parse(json.body.files[0].createdAt)).not.toBeNaN();
  });

  it('8. 잘못된 파라미터 요청은 400 VALIDATION_ERROR를 반환해야 한다.', async () => {
    // postId path param은 Type.Integer()이므로 숫자로 변환할 수 없는 값은 라우트 진입 전 차단됩니다.
    const res = await app.inject({
      method: 'GET',
      url: '/api/files/list/not-number',
    });

    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json).toHaveProperty('success', false);
    expect(json).toHaveProperty('code', 'VALIDATION_ERROR');
  });
});
