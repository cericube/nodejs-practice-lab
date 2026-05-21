// src/modules/postfile/postfile.repository.ts

import { BusinessError } from '../../common/errors/business.error';
import { ErrorCode } from '../../common/errors/error.codes';
import { PrismaClient, Prisma } from '../../generated/client';
import type { NestedIntNullableFilter } from '../../generated/commonInputTypes';

/**
 * [공통 Select 설정]
 * 파일 다운로드/목록/상세 조회에서 공통으로 노출할 파일 메타데이터입니다.
 * 실제 파일 바이너리는 DB가 아닌 스토리지(fileKey)로 관리하므로,
 * DB에서는 파일 식별과 응답 구성에 필요한 정보만 선택합니다.
 */
const postFileSelect: Prisma.PostFileSelect = {
  id: true,
  postId: true,
  fileKey: true,
  fileName: true,
  contentType: true,
  fileSize: true,
  downloadCount: true,
  createdAt: true,
};

/**
 * [Repository Layer: 게시글 첨부파일 영속성]
 * - 업로드 직후의 파일 메타데이터 등록
 * - 업로드된 파일과 게시글(Post)의 연결
 * - 다운로드 횟수 증가 및 파일 메타데이터 조회/삭제를 담당합니다.
 *
 * 파일 업로드 자체는 외부 스토리지/S3 등의 책임이고,
 * 이 Repository는 DB에 저장되는 파일 정보만 다룹니다.
 */
export class PostFileRepository {
  constructor(
    private readonly prisma: PrismaClient,
    // 게시글 하나에 연결할 수 있는 최대 첨부파일 수. 테스트나 환경 설정에서 주입해 변경할 수 있습니다.
    private readonly fileLimit: number = 5,
  ) {}

  /**
   * [Create] 업로드가 완료된 파일의 메타데이터를 DB에 등록합니다.
   *
   * 이 시점에는 아직 게시글이 확정되지 않았을 수 있으므로 postId는 저장하지 않습니다.
   * 이후 attachFilesToPost에서 fileIds를 받아 게시글과 연결합니다.
   *
   * 반환값은 후속 연결 작업에 필요한 id와, 실제 스토리지 객체를 식별할 fileKey만 선택합니다.
   */
  createFileInfo(data: {
    fileKey: string;
    fileName: string;
    contentType: string;
    fileSize: bigint;
    userId: number;
  }) {
    return this.prisma.postFile.create({
      data: {
        fileKey: data.fileKey,
        fileName: data.fileName,
        contentType: data.contentType,
        fileSize: data.fileSize,
        userId: data.userId,
      },
      select: {
        id: true,
        fileKey: true,
      },
    });
  }

  /**
   * [Attach] 임시로 등록된 파일들을 특정 게시글에 연결합니다.
   *
   * 파일 업로드는 게시글 저장보다 먼저 수행되어야 하는 구조 이므로,
   * 업로드 결과로 받은 fileIds에 postId를 나중에 채우는 구조입니다.
   *
   * 트랜잭션을 사용하는 이유:
   * 1. 현재 게시글에 연결된 파일 수를 조회합니다.
   * 2. 새로 연결할 파일 수를 더해 제한을 초과하는지 검증합니다.
   * 3. 제한을 넘지 않을 때만 updateMany로 한 번에 연결합니다.
   *
   * 위 과정이 하나의 트랜잭션 안에서 실행되어야 검증과 수정의 의도가 한 작업 단위로 유지됩니다.
   */
  async attachFilesToPost(data: { userId: number; postId: number; fileIds: number[] }) {
    return this.prisma.$transaction(async (tx) => {
      // 이미 해당 게시글에 연결된 파일 수를 기준으로 추가 업로드 가능 여부를 판단합니다.
      const count = await tx.postFile.count({
        where: {
          postId: data.postId,
        },
      });

      if (count + data.fileIds.length > this.fileLimit) {
        throw new BusinessError(
          ErrorCode.FILE_COUNT_EXCEEDED,
          `파일은 최대 ${this.fileLimit}개까지 업로드할 수 있습니다.`,
          400,
        );
      }

      // 업로드 직후 생성된 파일 레코드들에 postId를 채워 게시글과의 관계를 확정합니다.
      const result = await tx.postFile.updateMany({
        where: {
          id: { in: data.fileIds },
        },
        data: {
          postId: data.postId,
        },
      });
      return result; // Prisma BatchPayload: 실제로 수정된 레코드 수(count)를 반환합니다.
    });
  }

  /**
   * [Update Counter] 파일 다운로드 횟수를 원자적으로 1 증가시킵니다.
   *
   * Prisma의 increment 연산을 사용하므로 현재 downloadCount를 먼저 읽을 필요가 없고,
   * 동시 다운로드 요청이 들어와도 DB 레벨에서 안전하게 증가합니다.
   */
  incrementDownloadCount(id: number) {
    return this.prisma.postFile.update({
      where: { id },
      data: {
        downloadCount: {
          increment: 1,
        },
      },
      select: { downloadCount: true },
    });
  }

  /**
   * [Delete] 파일 메타데이터를 DB에서 삭제합니다.
   *
   * 이 메서드는 DB 레코드만 삭제합니다. 실제 스토리지 객체 삭제가 필요하다면
   * 서비스 계층에서 fileKey 조회 후 스토리지 삭제 작업과 함께 호출해야 합니다.
   */
  deleteFileInfo(userId: number, data: { id: number; fileKey: string }) {
    return this.prisma.postFile.delete({
      where: {
        id: data.id,
        fileKey: data.fileKey,
        userId: userId,
      },
      select: { id: true, fileName: true, fileKey: true }, // 삭제된 레코드의 id와 fileKey를 반환하여 서비스 계층에서 스토리지 삭제에 활용할 수 있도록 합니다.
    });
  }

  /**
   * [Select One] 파일 id로 단건 메타데이터를 조회합니다.
   *
   * findUnique는 데이터가 없으면 null을 반환하므로,
   * 존재하지 않는 파일에 대한 예외 변환은 서비스 계층에서 처리할 수 있습니다.
   */
  getFileInfoById(id: number) {
    return this.prisma.postFile.findUnique({
      where: { id },
      select: postFileSelect,
    });
  }

  /**
   * [Select Many] 특정 게시글에 연결된 첨부파일 목록을 조회합니다.
   *
   * id 오름차순 정렬을 사용해 파일이 등록된 순서대로 응답합니다.
   * 같은 필드 구성을 사용하는 단건 조회와 응답 모양을 맞추기 위해 공통 select를 재사용합니다.
   */
  listFileInfosByPostId(postId: number) {
    return this.prisma.postFile.findMany({
      where: { postId },
      select: postFileSelect,
      orderBy: { id: 'asc' }, // 업로드 순서 보장
    });
  }
}
