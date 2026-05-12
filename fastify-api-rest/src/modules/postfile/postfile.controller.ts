// src/module/postfile/postfile.controller.ts

import type { MultipartFile } from '@fastify/multipart';
import type { PostFileService } from './postfile.service';
import type {
  PostFileDownloadMetaDto,
  PostFileIdParamsDto,
  PostFileListResponseDto,
  PostFilePostIdParamsDto,
  PostFileResponseDto,
} from './postfile.dto';

export class PostFileController {
  constructor(private readonly service: PostFileService) {}

  uploadFile(file: MultipartFile, postId: PostFilePostIdParamsDto): Promise<PostFileResponseDto> {
    return this.service.uploadFile(file, postId);
  }

  downloadFile(
    fileId: PostFileIdParamsDto,
  ): Promise<{ meta: PostFileDownloadMetaDto; stream: NodeJS.ReadableStream }> {
    return this.service.downloadFile(fileId);
  }

  deleteFile(fileId: PostFileIdParamsDto): Promise<PostFileResponseDto> {
    return this.service.deleteFile(fileId);
  }

  getFileListByPostId(postId: PostFilePostIdParamsDto): Promise<PostFileListResponseDto> {
    return this.service.listFilesByPostId(postId);
  }
}
