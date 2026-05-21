// src/modules/postfile/postfile.controller.ts

import type { MultipartFile } from '@fastify/multipart';
import type { PostFileService } from './postfile.service';
import type {
  PostFileDownloadMetaDto,
  PostFileListResponseDto,
  PostFilePostIdDto,
  PostFileUserIdDto,
  PostFileBaseParamsDto,
  PostFilesBodyDto,
  PostFileAttachParamsDto,
} from './postfile.dto';

export class PostFileController {
  constructor(private readonly service: PostFileService) {}

  uploadFile(file: MultipartFile, userId: PostFileUserIdDto): Promise<PostFileBaseParamsDto> {
    return this.service.uploadFile(file, userId);
  }

  attachFiles(params: PostFileAttachParamsDto, body: PostFilesBodyDto): Promise<{ count: number }> {
    return this.service.attachFileToPost(params, body);
  }

  downloadFile(
    data: PostFileBaseParamsDto,
  ): Promise<{ stream: NodeJS.ReadableStream; meta: PostFileDownloadMetaDto }> {
    return this.service.downloadFile(data);
  }

  deleteFile(user: PostFileUserIdDto, data: PostFileBaseParamsDto): Promise<PostFileBaseParamsDto> {
    return this.service.deleteFile(user, data);
  }

  getFileList(data: PostFilePostIdDto): Promise<PostFileListResponseDto> {
    return this.service.listFilesByPostId(data);
  }
}
