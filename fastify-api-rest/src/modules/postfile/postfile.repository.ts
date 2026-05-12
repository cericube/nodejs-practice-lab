// src/module/postfile/postfile.repository.ts

import { BusinessError } from '../../common/errors/business.error';
import { ErrorCode } from '../../common/errors/error.codes';
import { PrismaClient, Prisma } from '../../generated/client';

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

export class PostFileRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fileLimit: number = 5, // 기본값 설정
  ) {}

  // 업로드한 파일정보를 DB에 등록한다.
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

  //파일을 먼저 업로드 한 후, 그 결과 정보를 가지고 PostID와 연결하는 구조이다.
  // 업로드 한 파일에 PostID응 등록한다.
  async attachFilesToPost(data: { userId: number; postId: number; fileIds: number[] }) {
    return this.prisma.$transaction(async (tx) => {
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

      const result = await tx.postFile.updateMany({
        where: {
          id: { in: data.fileIds },
        },
        data: {
          postId: data.postId,
        },
      });
      return result; //count 를 반환한다.
    });
  }

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

  deleteFileInfos(ids: number[]) {
    return this.prisma.postFile.deleteMany({
      where: {
        id: { in: ids },
      },
    });
  }

  getFileInfoById(id: number) {
    return this.prisma.postFile.findUnique({
      where: { id },
      select: postFileSelect,
    });
  }

  // Post에 등록된 파일 정보를 가져온다.
  listFileInfosByPostId(postId: number) {
    return this.prisma.postFile.findMany({
      where: { postId },
      select: {
        id: true,
        postId: true,
        fileKey: true,
        fileName: true,
        contentType: true,
        fileSize: true,
        downloadCount: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' }, // 업로드 순서 보장
    });
  }
}
