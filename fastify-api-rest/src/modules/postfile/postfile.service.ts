// src/modules/postfile/postfile.service.ts

import type { PostFileRepository } from './postfile.repository';
import { pipeline } from 'stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { createReadStream, createWriteStream } from 'fs';
import { access, constants, mkdir, unlink } from 'fs/promises'; // Promise 기반 파일 시스템 API를 사용합니다.
import { Transform } from 'stream';
import { randomUUID } from 'crypto';
import path from 'path';

import type {
  PostFileUserIdDto,
  PostFileDownloadMetaDto,
  PostFileListResponseDto,
  PostFileResponseDto,
  PostFileBaseParamsDto,
  PostFilePostIdDto,
  PostFilesBodyDto,
  PostFileAttachParamsDto,
} from './postfile.dto';
import { env } from '../../config/env';
import { BusinessError } from '../../common/errors/business.error';
import { ErrorCode } from '../../common/errors/error.codes';
import { Prisma } from '../../generated/client';
import type { PostRepository } from '../post/post.repository';

/**
 * 게시글 첨부파일의 애플리케이션 흐름을 담당합니다.
 *
 * 실제 파일은 서버 업로드 디렉토리에 저장하고, DB에는 파일명/크기/MIME 타입/fileKey 같은
 * 메타데이터만 저장합니다. Repository는 DB 작업에 집중하고, 이 서비스는 파일 시스템 작업,
 * 권한 검증, 예외 변환, 응답 DTO 변환을 조합합니다.
 */
export class PostFileService {
  constructor(
    private readonly fileRepository: PostFileRepository,
    private readonly postRepository: PostRepository,
  ) {}

  /**
   * 업로드된 Multipart 파일을 서버 디스크에 저장하고 DB에 파일 메타데이터를 등록합니다.
   *
   * 게시글 작성 중 파일만 먼저 올릴 수 있도록, 이 단계에서는 postId를 연결하지 않고
   * 파일 소유자(userId)와 파일 식별 정보만 저장합니다. 저장 중 오류가 발생하면
   * 디스크에 생성된 파일을 정리한 뒤 서비스 표준 BusinessError로 변환합니다.
   */
  async uploadFile(file: MultipartFile, userId: PostFileUserIdDto): Promise<PostFileBaseParamsDto> {
    // 외부에 노출할 fileKey는 UUID로 만들고, 실제 저장 파일명은 원본 확장자만 유지합니다.
    const fileKey = randomUUID();
    const ext = path.extname(file.filename);
    const storedFileName = `${fileKey}${ext}`;
    const filePath = path.join(env.UPLOAD_DIR, storedFileName);

    // 업로드 디렉토리가 없으면 생성합니다. recursive 옵션으로 이미 존재하는 경우도 안전합니다.
    await mkdir(env.UPLOAD_DIR, { recursive: true });

    // 파일 내용을 메모리에 올리지 않고 스트림으로 흘려보내면서 총 바이트 수만 누적합니다.
    let totalSize = 0;
    const counter = new Transform({
      transform(chunk, enc, cb) {
        totalSize += chunk.length;
        cb(null, chunk);
      },
    });

    try {
      // pipeline은 backpressure와 스트림 에러 전파를 처리하므로 대용량 파일 저장에 적합합니다.
      await pipeline(file.file, counter, createWriteStream(filePath));

      // 디스크 저장이 완료된 뒤 DB에 메타데이터를 등록해 파일 시스템과 DB 상태를 맞춥니다.
      const fileinfo = await this.fileRepository.createFileInfo({
        fileKey: fileKey,
        fileName: file.filename,
        contentType: file.mimetype,
        fileSize: BigInt(totalSize),
        userId: userId.userId,
      });
      return {
        id: fileinfo.id,
        fileKey: fileinfo.fileKey,
      };
    } catch (err) {
      // DB 저장 실패 등으로 중간에 끊기면 디스크에 남은 임시 파일을 제거합니다.
      try {
        await unlink(filePath);
      } catch (unlinkErr) {
        // 파일이 생성되기 전에 실패했거나 이미 제거된 경우는 원래 오류 처리를 방해하지 않습니다.
      }

      // 하위 계층에서 이미 비즈니스 예외로 분류한 오류는 의미를 유지해 그대로 전달합니다.
      if (err instanceof BusinessError) throw err;

      throw new BusinessError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        '파일 저장 중 오류가 발생했습니다.',
        500,
      );
    }
  }

  /**
   * 업로드만 완료된 파일들을 특정 게시글에 연결합니다.
   *
   * 파일 첨부는 게시글 작성자만 수행할 수 있으므로 먼저 게시글 존재 여부와 작성자 권한을
   * 확인합니다. 권한 검증을 통과하면 Repository에서 파일 개수 제한을 검증하고 postId를
   * 일괄 업데이트합니다.
   */
  async attachFileToPost(
    params: PostFileAttachParamsDto,
    body: PostFilesBodyDto,
  ): Promise<{ count: number }> {
    // 임시 저장된 파일이 다른 사용자의 게시글에 연결되지 않도록 게시글 작성자를 확인합니다.
    const postOne = await this.postRepository.selectOne({
      postId: params.postId,
      includeDraft: true,
    });
    if (!postOne) {
      throw new BusinessError(ErrorCode.NOT_FOUND, '게시글을 찾을 수 없습니다.', 404);
    }
    if (postOne.authorId !== params.userId) {
      throw new BusinessError(ErrorCode.FORBIDDEN, '게시글에 파일을 첨부할 권한이 없습니다.', 403);
    }

    return this.fileRepository.attachFilesToPost({
      postId: params.postId,
      fileIds: body.fileIds,
      userId: params.userId,
    });
  }

  /**
   * 파일 다운로드에 필요한 읽기 스트림과 응답 헤더용 메타데이터를 반환합니다.
   *
   * 요청의 id와 fileKey가 모두 일치해야 같은 파일로 인정합니다. DB 메타데이터가 있어도
   * 실제 파일이 디스크에 없으면 다운로드할 수 없으므로 별도로 존재 여부를 확인합니다.
   * 다운로드 횟수 증가는 사용자 응답을 지연시키지 않도록 후처리로 실행합니다.
   */
  async downloadFile(
    data: PostFileBaseParamsDto,
  ): Promise<{ stream: NodeJS.ReadableStream; meta: PostFileDownloadMetaDto }> {
    // DB 메타데이터를 먼저 조회해 요청한 파일이 시스템에 등록된 파일인지 확인합니다.
    const file = await this.fileRepository.getFileInfoById(data.id);
    // id만 맞고 fileKey가 다른 경우도 잘못된 접근으로 보아 존재하지 않는 파일처럼 처리합니다.
    if (!file || file.fileKey !== data.fileKey) {
      throw new BusinessError(ErrorCode.NOT_FOUND, '파일을 찾을 수 없습니다.', 404);
    }

    // 업로드 시 UUID + 원본 확장자로 저장했으므로 동일한 규칙으로 실제 경로를 복원합니다.
    const ext = path.extname(file.fileName);
    const filePath = path.join(env.UPLOAD_DIR, `${file.fileKey}${ext}`);

    // DB에는 레코드가 있지만 디스크 파일이 유실된 경우를 다운로드 직전에 차단합니다.
    try {
      await access(filePath, constants.R_OK);
    } catch {
      throw new BusinessError(ErrorCode.NOT_FOUND, '파일이 서버에 존재하지 않습니다.', 404);
    }

    // 컨트롤러/라우트에서 HTTP 응답으로 pipe할 수 있도록 읽기 스트림만 생성해 반환합니다.
    const stream = createReadStream(filePath);

    // 다운로드 응답 지연을 피하기 위해 통계성 카운터 갱신은 후처리로 실행합니다.
    // 실패해도 파일 전송 성공 여부와 분리하고 로그만 남깁니다.
    this.fileRepository.incrementDownloadCount(data.id).catch((err) => {
      console.error(`Failed to increment download count for fileId ${data.id}:`, err);
    });

    return {
      stream,
      meta: {
        fileName: file.fileName,
        contentType: file.contentType,
        fileSize: file.fileSize.toString(),
      },
    };
  }

  /**
   * 사용자가 소유한 파일 메타데이터와 실제 디스크 파일을 삭제합니다.
   *
   * 먼저 DB 레코드를 삭제해 삭제 대상과 소유권을 한 번에 검증합니다. DB 삭제 후 실제 파일
   * 삭제가 실패하더라도 사용자 요청은 성공으로 처리하고, 주인 없는 파일 정리는 별도 배치나
   * 운영 정책에서 처리할 수 있게 둡니다.
   */
  async deleteFile(
    user: PostFileUserIdDto,
    data: PostFileBaseParamsDto,
  ): Promise<PostFileBaseParamsDto> {
    try {
      // Prisma delete는 조건에 맞는 레코드가 없으면 P2025를 던지므로 조회와 삭제를 겸합니다.
      const deletedFile = await this.fileRepository.deleteFileInfo(user.userId, data);

      // 삭제된 DB 레코드의 fileKey와 원본 확장자로 실제 파일 경로를 복원합니다.
      const ext = path.extname(deletedFile.fileName);
      const filePath = path.join(env.UPLOAD_DIR, `${deletedFile.fileKey}${ext}`);

      // 디스크 파일 삭제 실패는 DB 삭제를 되돌리지 않고, 별도 정리 정책에 맡깁니다.
      try {
        await unlink(filePath);
      } catch (err: any) {
        // 이미 파일이 없거나 파일 시스템 오류가 나도 DB 삭제 성공 응답은 유지합니다.
      }

      return {
        id: deletedFile.id,
        fileKey: deletedFile.fileKey,
      };
    } catch (err) {
      // 삭제 대상이 없거나 소유자가 다르면 클라이언트에는 존재하지 않는 파일로 응답합니다.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new BusinessError(ErrorCode.NOT_FOUND, '파일을 찾을 수 없습니다.', 404);
      }

      throw new BusinessError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        '파일 삭제 중 예기치 못한 오류가 발생했습니다.',
        500,
      );
    }
  }

  /**
   * 특정 게시글에 연결된 첨부파일 목록을 조회해 클라이언트 응답 DTO로 변환합니다.
   *
   * Repository는 DB 엔티티 형태의 메타데이터를 반환하므로, 서비스에서 API 응답에 필요한
   * 필드만 남기고 Date/BigInt 같은 직렬화 민감 타입을 문자열로 변환합니다.
   */
  async listFilesByPostId(data: PostFilePostIdDto): Promise<PostFileListResponseDto> {
    const files = await this.fileRepository.listFileInfosByPostId(data.postId);
    return {
      files: files.map(toResponse),
    };
  }
}

/**
 * DB에서 조회한 파일 메타데이터를 API 응답 DTO로 변환합니다.
 *
 * BigInt와 Date는 JSON 직렬화에서 그대로 다루기 어렵거나 클라이언트 정밀도 문제가 생길 수
 * 있으므로 문자열 형태로 변환해 응답 계약을 안정적으로 유지합니다.
 */
function toResponse(file: {
  id: number;
  postId: number | null;
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
    fileSize: file.fileSize.toString(),
    downloadCount: file.downloadCount,
    createdAt: file.createdAt.toISOString(),
  };
}
