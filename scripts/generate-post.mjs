import fs from 'node:fs';
import path from 'node:path';
import { getNextTopic } from './lib/topic-sources.mjs';
import { generateBlogPostDraft, SLUG_PLACEHOLDER } from './lib/anthropic.mjs';
import { generateImage } from './lib/gemini-images.mjs';
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

  const similarExisting = findSimilarExistingPost(draft.title);
  if (similarExisting) {
    throw new Error(
      `생성된 제목 "${draft.title}"이(가) 이미 있는 글 "${similarExisting}"과(와) 너무 비슷합니다 (같은 이슈를 다른 표현으로 재작성했을 가능성). ` +
        `중복 발행을 막기 위해 이번 실행은 여기서 멈춥니다 — topics/queue.yaml이나 트렌드 소스에서 이 주제가 왜 다시 나왔는지 확인해주세요.`
    );
  }

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

  // GEMINI_API_KEY가 있으면 각 이미지를 자동으로 생성해서 바로 폴더에 저장 시도.
  // 실패한 이미지(키 없음/네트워크 오류/안전 필터 차단 등)는 auto=false로 표시되고,
  // 아래에서 사람이 직접 채워야 할 체크리스트로 남습니다.
  const geminiKey = process.env.GEMINI_API_KEY;
  const imagesDir = path.join(ROOT, 'public', 'images', 'blog', slug);
  if (imagePlan.length > 0) {
    if (geminiKey) {
      fs.mkdirSync(imagesDir, { recursive: true });
      console.log(`[generate-post] GEMINI_API_KEY 감지됨 — 이미지 ${imagePlan.length}장 자동 생성 시도 중...`);
    } else {
      console.log('[generate-post] GEMINI_API_KEY가 없어 이미지는 자동 생성하지 않습니다 (수동 체크리스트로 남김).');
    }

    for (const img of imagePlan) {
      if (!geminiKey) {
        img.auto = false;
        continue;
      }
      const buf = await generateImage({
        prompt: img.ai_prompt,
        apiKey: geminiKey,
        model: process.env.GEMINI_MODEL,
      });
      if (buf) {
        fs.writeFileSync(path.join(imagesDir, img.filename), buf);
        console.log(`[generate-post]   ✅ 자동 생성 완료: ${img.filename}`);
        img.auto = true;
      } else {
        console.log(`[generate-post]   ⚠️  자동 생성 실패, 수동 체크리스트로 남김: ${img.filename}`);
        img.auto = false;
      }
    }
  }
  const allAuto = imagePlan.length > 0 && imagePlan.every((img) => img.auto);
  const needsManual = imagePlan.filter((img) => !img.auto);

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

  let checklist = '';
  if (needsManual.length > 0) {
    const someAuto = imagePlan.length > needsManual.length;
    checklist = [
      '<!--',
      someAuto
        ? `🎨 이미지 ${imagePlan.length - needsManual.length}장은 AI로 자동 생성되어 이미 폴더에 들어가 있습니다. 아래 ${needsManual.length}장만 직접 준비해주세요.`
        : `🎨 이 글에 필요한 AI 생성 이미지 (머지 전에 준비해서 넣어주세요) — 실제 인물 사진이 아니라 아래 프롬프트로 AI가 생성한 이미지를 씁니다 (초상권/저작권 문제 방지).`,
      `무료 생성 도구: https://www.bing.com/images/create (Microsoft 계정만 있으면 무료) — 아래 프롬프트를 그대로 복사해서 붙여넣으세요.`,
      `생성한 이미지는 public/images/blog/${slug}/ 폴더 안에 아래 파일명 그대로 저장하면 자동으로 연결됩니다.`,
      ...needsManual.map((img, i) => `${i + 1}. ${img.filename}${img === cover ? ' (대표/커버 이미지)' : ''} — 프롬프트: ${img.ai_prompt}`),
      '-->',
      '',
    ].join('\n');
  } else if (allAuto) {
    checklist = [
      '<!--',
      `✅ 이미지 ${imagePlan.length}장 모두 AI로 자동 생성되어 이미 폴더에 들어가 있습니다 (public/images/blog/${slug}/). 내용만 확인하고 머지하면 됩니다.`,
      '-->',
      '',
    ].join('\n');
  }

  fs.mkdirSync(BLOG_DIR, { recursive: true });
  fs.writeFileSync(filePath, frontmatter + checklist + body.trim() + '\n');

  console.log(`[generate-post] 작성 완료: ${filePath}`);
  if (needsManual.length > 0) {
    console.log(`[generate-post] 직접 준비해야 할 이미지 ${needsManual.length}장 (public/images/blog/${slug}/ 안에 넣어주세요):`);
    needsManual.forEach((img) => console.log(`  - ${img.filename}: ${img.ai_prompt}`));
  }

  // GitHub Actions에서 다음 스텝(PR 생성)이 쓸 수 있도록 env로 내보냄
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `POST_TITLE=${draft.title}\nPOST_SLUG=${slug}\nTOPIC_SOURCE=${source}\nIMAGES_AUTO=${allAuto ? 'true' : 'false'}\n`
    );
  }
}

function yamlString(s) {
  return JSON.stringify(String(s));
}

// 제목을 3글자 단위(character trigram) 집합으로 쪼개서 자카드 유사도로 비교합니다.
// 단어 단위 비교("made" vs "makes", "Korea" vs "Korean" 같은 활용형 차이를 서로 다른
// 단어로 취급)보다 이 방식이 실제로 더 안정적입니다 — 철자가 살짝만 달라도 겹치는
// trigram이 많이 남기 때문에 표현만 바뀐 재작성을 잘 잡아내면서도, 같은 프랜차이즈를
// 다룬 서로 다른 사실의 글(예: 넷플릭스 조회수 글 vs 오스카 수상 글)은 공유되는
// trigram이 적어서 오탐하지 않습니다. 실제 발행된 제목들로 전수 비교해서 임계값을
// 정했습니다 — 진짜 중복 사례는 0.47 이상, 가장 비슷한 서로 다른 글 쌍도 0.30을
// 넘지 않아서 0.40을 기준으로 잡으면 둘 다 안전하게 갈립니다.
function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function titleTrigrams(title) {
  const padded = `  ${normalizeTitle(title)}  `;
  const set = new Set();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}

function jaccardSimilarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection += 1;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

const SIMILARITY_THRESHOLD = 0.4;

function findSimilarExistingPost(newTitle) {
  if (!fs.existsSync(BLOG_DIR)) return null;
  const newTrigrams = titleTrigrams(newTitle);
  for (const file of fs.readdirSync(BLOG_DIR)) {
    if (!file.endsWith('.md')) continue;
    const content = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
    const match = content.match(/^title:\s*"((?:[^"\\]|\\.)*)"/m);
    if (!match) continue;
    const existingTitle = JSON.parse(`"${match[1]}"`);
    const existingTrigrams = titleTrigrams(existingTitle);
    if (jaccardSimilarity(newTrigrams, existingTrigrams) >= SIMILARITY_THRESHOLD) {
      return existingTitle;
    }
  }
  return null;
}

main().catch((err) => {
  console.error('[generate-post] 실패:', err);
  process.exit(1);
});
