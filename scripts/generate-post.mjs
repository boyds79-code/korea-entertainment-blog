import fs from 'node:fs';
import path from 'node:path';
import { getNextTopic } from './lib/topic-sources.mjs';
import { generateBlogPostDraft, SLUG_PLACEHOLDER } from './lib/anthropic.mjs';
import { slugify } from './lib/slugify.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');

async function main() {
  const { topic, notes, source } = await getNextTopic();
  console.log(`[generate-post] 주제 소스: ${source}`);
  console.log(`[generate-post] 주제: ${topic}`);

  const draft = await generateBlogPostDraft({
    topic,
    notes,
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL,
  });

  const today = new Date().toISOString().slice(0, 10);
  let slug = slugify(draft.title);
  let filePath = path.join(BLOG_DIR, `${slug}.md`);

  // 같은 날 슬러그가 겹치면 뒤에 -2, -3 붙여서 회피
  let n = 2;
  while (fs.existsSync(filePath)) {
    filePath = path.join(BLOG_DIR, `${slug}-${n}.md`);
    n += 1;
  }
  slug = path.basename(filePath, '.md');

  const imagePlan = draft.image_plan || [];
  const cover = imagePlan[0];

  const frontmatter = [
    '---',
    `title: ${yamlString(draft.title)}`,
    `description: ${yamlString(draft.description)}`,
    `pubDate: ${today}`,
    `tags: [${draft.tags.map((t) => yamlString(t)).join(', ')}]`,
    `topicSource: "${source}"`,
    'draft: false',
    ...(cover
      ? [
          `heroImage: ${yamlString(`/images/blog/${slug}/${cover.filename}`)}`,
          `heroImageAlt: ${yamlString(cover.alt)}`,
        ]
      : []),
    '---',
    '',
  ].join('\n');

  // Claude가 이미지 자리에 써넣은 {{SLUG}} placeholder를 실제 슬러그로 치환
  let body = draft.body_markdown.replaceAll(SLUG_PLACEHOLDER, slug);
  body = body.replace('<!--AD_SLOT-->', '<!-- AD_SLOT: 광고 자동 삽입 위치 표시용, 렌더링에는 영향 없음 -->');

  const checklist =
    imagePlan.length > 0
      ? [
          '<!--',
          `🎨 이 글에 필요한 AI 생성 이미지 (머지 전에 준비해서 넣어주세요) — 실제 인물 사진이 아니라 아래 프롬프트로 AI가 생성한 이미지를 씁니다 (초상권/저작권 문제 방지).`,
          `무료 생성 도구: https://www.bing.com/images/create (Microsoft 계정만 있으면 무료) — 아래 프롬프트를 그대로 복사해서 붙여넣으세요.`,
          `생성한 이미지는 public/images/blog/${slug}/ 폴더 안에 아래 파일명 그대로 저장하면 자동으로 연결됩니다.`,
          ...imagePlan.map((img, i) => `${i + 1}. ${img.filename}${i === 0 ? ' (대표/커버 이미지)' : ''} — 프롬프트: ${img.ai_prompt}`),
          '-->',
          '',
        ].join('\n')
      : '';

  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.writeFileSync(filePath, frontmatter + checklist + body.trim() + '\n');

  console.log(`[generate-post] 작성 완료: ${filePath}`);
  if (imagePlan.length > 0) {
    console.log(`[generate-post] 필요한 AI 생성 이미지 ${imagePlan.length}장 (public/images/blog/${slug}/ 안에 넣어주세요):`);
    imagePlan.forEach((img) => console.log(`  - ${img.filename}: ${img.ai_prompt}`));
  }

  // GitHub Actions에서 다음 스텝(PR 생성)이 쓸 수 있도록 env로 내보냄
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `POST_TITLE=${draft.title}\nPOST_SLUG=${slug}\nTOPIC_SOURCE=${source}\n`
    );
  }
}

function yamlString(s) {
  return JSON.stringify(String(s));
}

main().catch((err) => {
  console.error('[generate-post] 실패:', err);
  process.exit(1);
});
