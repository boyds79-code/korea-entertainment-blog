import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(), // meta description (SEO)
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    // 이 글의 주제가 어디서 왔는지 기록 (이 블로그는 항상 manual — 자동 트렌드 소스를 쓰지 않음)
    topicSource: z.enum(['manual']).default('manual'),
    // 자동화 파이프라인이 생성했지만 아직 사람 검수 전인지 표시용 (PR 리뷰 단계에서는 항상 true로 시작)
    draft: z.boolean().default(false),
    // 대표 이미지 (public/images/blog/<slug>/1.jpg — AI로 생성해서 직접 넣은 이미지, 실제 인물 사진 아님)
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    // 보통 비워둡니다 (AI 생성 이미지는 저작자 표시가 필요 없음) — 필요하면 사용
    heroImageCredit: z.string().optional(),
    heroImageCreditUrl: z.string().optional(),
  }),
});

export const collections = { blog };
