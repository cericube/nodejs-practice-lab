// src/module/postfile/postfile.service.ts

import type { PostFileRepository } from './postfile.repository';
import { pipeline } from 'stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { createReadStream, createWriteStream } from 'fs';
import { access, constants, mkdir, unlink } from 'fs/promises'; // fs/promises 사용
import { Transform } from 'stream';
import { randomUUID } from 'crypto';
import path from 'path';

import type {
  PostFileDownloadMetaDto,
  PostFileIdParamsDto,
  PostFileListResponseDto,
  PostFilePostIdParamsDto,
  PostFileResponseDto,
} from './postfile.dto';
import { env } from '../../config/env';
import { BusinessError } from '../../common/errors/business.error';
import { ErrorCode } from '../../common/errors/error.codes';
import { Prisma } from '../../generated/client';

/**
 * PostFileService
 * 파일 업로드/다운로드/삭제를 담당하는 서비스 계층
 *
 * [역할]
 * - Controller ↔ Repository 사이에서 비즈니스 로직 수행
 * - 파일 시스템(File System)과 DB 메타데이터를 함께 관리
 * - 내부 데이터(Entity)를 API 응답 스펙(DTO)으로 변환
 *
 * [핵심 책임]
 * - 파일 저장 및 스트림 처리
 * - 파일 메타데이터 관리
 * - 데이터 정합성 유지 (FS ↔ DB)
 * - 예외 발생 시 롤백(파일 cleanup)
 */
export class PostFileService {
  constructor(private readonly repository: PostFileRepository) {}

  /**
   * 파일 업로드
   *
   * [처리 흐름]
   * 1. 저장 파일명 생성 (UUID 기반, 충돌 방지)
   * 2. 업로드 디렉토리 존재 보장
   * 3. 스트림 기반 파일 저장 (메모리 사용 최소화)
   * 4. 파일 크기 계산 (Transform Stream 활용)
   * 5. DB에 메타데이터 저장
   *
   * [에러 처리 전략]
   * - 파일 저장 중 실패 시 → 이미 생성된 파일 삭제 (Cleanup)
   * - BusinessError는 그대로 전파
   * - 그 외 에러는 내부 서버 에러로 래핑
   */
  async uploadFile(
    file: MultipartFile,
    postId: PostFilePostIdParamsDto,
  ): Promise<PostFileResponseDto> {
    // 파일 저장
    const fileKey = randomUUID();
    const ext = path.extname(file.filename);
    const storedFileName = `${fileKey}${ext}`;
    const filePath = path.join(env.UPLOAD_DIR, storedFileName);

    // 1. 업로드 디렉토리 확인 (서버 시작 시 이미 처리되어 있다면 생략 가능)
    await mkdir(env.UPLOAD_DIR, { recursive: true });

    /**
     * 파일 사이즈 계산용 Transform Stream
     * - 스트림을 그대로 흘리면서 chunk 단위로 크기 누적
     * - 대용량 파일에서도 메모리 효율 유지
     */
    let totalSize = 0;
    const counter = new Transform({
      transform(chunk, enc, cb) {
        totalSize += chunk.length;
        cb(null, chunk);
      },
    });

    try {
      //2. 파일 저장 (Stream Pipeline)
      // - backpressure 자동 처리
      // - 에러 발생 시 Promise reject
      await pipeline(file.file, counter, createWriteStream(filePath));

      //3. DB에 파일 메타 정보 저장
      const fileinfo = await this.repository.createFileInfo(postId.id, {
        fileKey: fileKey,
        fileName: file.filename,
        contentType: file.mimetype,
        fileSize: BigInt(totalSize),
      });
      return toResponse(fileinfo);
    } catch (err) {
      // 4. 에러 발생 시 생성된 파일 삭제 (Cleanup)
      try {
        await unlink(filePath);
      } catch (unlinkErr) {
        // 파일이 아예 안 만들어졌을 경우를 대비한 무시
      }

      // TypeScript(JavaScript)는 Java처럼 catch (ExceptionType e) 형태의
      // 다중 catch 블록을 지원하지 않습니다
      // 이미 BusinessError라면 그대로 던지고, 아니라면 래핑
      if (err instanceof BusinessError) throw err;

      throw new BusinessError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        '파일 저장 중 오류가 발생했습니다.',
        500,
      );
    }
  }

  /**
   * 파일 다운로드
   *
   * [처리 흐름]
   * 1. DB에서 파일 메타 조회
   * 2. 파일 경로 구성 (fileKey 기반)
   * 3. 실제 파일 존재 여부 확인
   * 4. ReadStream 생성 및 반환
   *
   * [설계 포인트]
   * - 파일 자체는 스트림으로 전달 (메모리 로딩 방지)
   * - 메타데이터는 별도 DTO로 반환
   */
  async downloadFile(
    fileId: PostFileIdParamsDto,
  ): Promise<{ stream: NodeJS.ReadableStream; meta: PostFileDownloadMetaDto }> {
    // 1. DB 조회
    const file = await this.repository.getFileInfoById(fileId.id);
    if (!file) {
      throw new BusinessError(ErrorCode.NOT_FOUND, '파일을 찾을 수 없습니다.', 404);
    }

    // 2. 파일 경로 구성
    const ext = path.extname(file.fileName); // 저장 시 확장자 따로 관리하면 더 좋음
    const filePath = path.join(env.UPLOAD_DIR, `${file.fileKey}${ext}`);

    // 3. 실제 파일 존재 여부 확인
    try {
      await access(filePath, constants.R_OK);
    } catch {
      throw new BusinessError(ErrorCode.NOT_FOUND, '파일이 서버에 존재하지 않습니다.', 404);
    }

    // 4. 스트림 생성
    // 웹 서버에서는 HTTP 응답 객체(res)가 데이터를 다 보내고 나면,
    // 연결된 스트림들을 알아서 정리(Cleanup)합니다.
    const stream = createReadStream(filePath);

    // 5. 다운로드 카운트 증가 (비동기 처리, 응답 지연 방지)
    this.repository.incrementDownloadCount(fileId.id).catch((err) => {
      // 다운로드 카운트 업데이트 실패는 로그로 남기고 무시 (비즈니스 로직에 영향 주지 않음)
      console.error(`Failed to increment download count for fileId ${fileId.id}:`, err);
    });

    return {
      stream,
      meta: {
        fileName: file.fileName,
        contentType: file.contentType,
        fileSize: file.fileSize.toString(), // bigint → string 변환
      },
    };
  }

  /**
   * 파일 삭제 (Single-step Deletion)
   *
   * [처리 흐름]
   * 1. DB 레코드 즉시 삭제: Prisma .delete()를 활용해 조회와 삭제를 동시에 수행
   * 2. 삭제 데이터 기반 경로 구성: DB에서 반환된 fileKey와 fileName을 사용
   * 3. 물리 파일 삭제 시도: 파일 시스템(FS)에서 실제 파일 제거
   * 4. 결과 반환: 삭제된 파일 정보를 DTO로 변환하여 응답
   *
   * [정합성 및 예외 전략]
   * - DB 우선주의: DB 레코드가 성공적으로 삭제된 경우에만 파일 삭제를 시도하여 '유령 레코드' 방지
   * - 결함 허용(Fault Tolerance): FS 삭제 실패(이미 없음, 권한 등)는 사용자 응답을 차단하지 않음
   * - 사후 정리: FS에 남은 '주인 없는 파일(Zombie Files)'은 별도의 스캐빈저(Batch) 프로세스에서 관리
   * - 스캐빈저(Scavenger) : 직역하면 '쓰레기 더미를 뒤지는 사람'
   */
  async deleteFile(fileId: PostFileIdParamsDto): Promise<PostFileResponseDto> {
    try {
      // 1. DB 레코드 삭제 시도 (조회와 삭제를 한 번에!)
      // Prisma의 .delete()는 레코드가 없으면 P2025 에러를 던집니다.
      const deletedFile = await this.repository.deleteFileInfo(fileId.id);

      // 2. 파일 경로 구성
      const ext = path.extname(deletedFile.fileName);
      const filePath = path.join(env.UPLOAD_DIR, `${deletedFile.fileKey}${ext}`);

      // 3. 실제 파일 삭제
      try {
        await unlink(filePath);
      } catch (err: any) {
        // 삭제 실패시 무시
        // DB와 파일 시스템을 대조하여 주인 없는 파일 삭제 작업을 별도로 수행하는 정책 적용
      }

      return toResponse(deletedFile);
    } catch (err) {
      // Prisma: 삭제할 대상이 없는 경우 (404 처리)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new BusinessError(ErrorCode.NOT_FOUND, '파일을 찾을 수 없습니다.', 404);
      }

      // 그 외 예상치 못한 에러
      throw new BusinessError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        '파일 삭제 중 예기치 못한 오류가 발생했습니다.',
        500,
      );
    }
  }

  /**
   * 게시글 기준 파일 목록 조회
   *
   * [데이터 처리]
   * - Repository에서 조회한 Entity 목록을 DTO로 변환
   * - 클라이언트에는 필요한 필드만 노출
   */
  async listFilesByPostId(postId: PostFilePostIdParamsDto): Promise<PostFileListResponseDto> {
    const files = await this.repository.listFileInfosByPostId(postId.id);
    return {
      files: files.map(toResponse),
    };
  }
}

function toResponse(file: {
  id: number;
  postId: number;
  fileKey: string;
  fileName: string;
  contentType: string;
  fileSize: bigint;
  downloadCount: number;
  createdAt: Date;
}): PostFileResponseDto {
  return {
    id: file.id,
    postId: file.postId,
    fileKey: file.fileKey,
    fileName: file.fileName,
    contentType: file.contentType,
    // bigint → number 변환은 정밀도 손실 위험이 있어서 문자열로 내려주는 게 안전한 설계입니다.
    fileSize: file.fileSize.toString(), // bigint → string 변환
    downloadCount: file.downloadCount,
    createdAt: file.createdAt.toISOString(),
  };
}
