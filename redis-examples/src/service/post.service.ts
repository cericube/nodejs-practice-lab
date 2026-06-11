import { prisma } from '../lib/prisma.js';

// 게시글 생성 시 필요한 입력값 타입입니다.
export type CreatePostInput = {
  title: string;
  content: string;
  author: string;
  status?: string;
};

// 게시글 수정 시 변경 가능한 입력값 타입입니다.
export type UpdatePostInput = {
  title?: string;
  content?: string;
  status?: string;
};

// 게시글 도메인의 데이터 생성, 조회, 수정, 삭제를 담당하는 서비스입니다.
export class PostService {
  // 새 게시글을 생성합니다. 상태값이 없으면 기본값으로 DRAFT를 사용합니다.
  async createPost(input: CreatePostInput) {
    return prisma.post.create({
      data: {
        title: input.title,
        content: input.content,
        author: input.author,
        status: input.status ?? 'DRAFT',
      },
    });
  }

  // 게시글 ID로 단건 조회합니다. 없으면 null을 반환합니다.
  async getPostById(postId: number) {
    return prisma.post.findUnique({
      where: {
        id: postId,
      },
    });
  }

  // 게시글 ID로 조회하고, 없으면 예외를 발생시킵니다.
  async getPostByIdOrThrow(postId: number) {
    const post = await this.getPostById(postId);

    if (!post) {
      throw new Error(`Post not found. id=${postId}`);
    }

    return post;
  }

  // 게시글 목록을 최신 ID 순서로 조회합니다.
  async getPosts() {
    return prisma.post.findMany({
      orderBy: {
        id: 'desc',
      },
    });
  }

  // 게시글 존재 여부를 확인한 뒤 전달된 필드만 수정합니다.
  async updatePost(postId: number, input: UpdatePostInput) {
    await this.getPostByIdOrThrow(postId);

    const data = {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.status !== undefined && { status: input.status }),
    };

    return prisma.post.update({
      where: {
        id: postId,
      },
      data,
    });
  }

  // 게시글 존재 여부를 확인한 뒤 삭제합니다.
  async deletePost(postId: number) {
    await this.getPostByIdOrThrow(postId);

    return prisma.post.delete({
      where: {
        id: postId,
      },
    });
  }
}
