const API_URL = 'https://api.anthropic.com/v1/messages';

// TODO: 최신 모델 ID를 확인하고 필요하면 교체하세요.
// https://docs.claude.com/en/docs/about-claude/models
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// body_markdown 안의 이미지 경로에 실제 슬러그를 나중에 끼워 넣기 위한 placeholder.
// (Claude가 글을 쓰는 시점엔 아직 최종 슬러그를 모르므로, 생성 후 generate-post.mjs에서
// 이 문자열을 실제 슬러그로 치환합니다.)
export const SLUG_PLACEHOLDER = '{{SLUG}}';

/**
 * Claude API를 호출해서 블로그 글 초안을 JSON으로 받아옵니다.
 *
 * 이 블로그는 실존 연예인을 다루기 때문에 korea-blog/korea-recipes-blog와 두 가지가
 * 다릅니다:
 * 1) 사실관계에 훨씬 보수적으로 접근하도록 시스템 프롬프트를 강하게 제약합니다
 *    (없는 발언/사실 지어내지 않기, 검증 안 된 소문·사생활 다루지 않기).
 * 2) 이미지는 실제 인물 사진을 쓰지 않고, image_plan이 "AI 이미지 생성 프롬프트"를
 *    돌려줍니다 — 사람이 그 프롬프트를 Bing Image Creator 등에 붙여넣어 저작권
 *    걱정 없는 이미지를 직접 생성해서 넣는 구조입니다 (add-photos.mjs 참고).
 */
export async function generateBlogPostDraft({ topic, notes, apiKey, model }) {
  // .env를 GUI 에디터로 저장할 때 섞여 들어갈 수 있는 보이지 않는 공백/줄바꿈 문자 방지
  apiKey = apiKey?.trim();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY가 설정되어 있지 않습니다. GitHub Actions Secret 또는 로컬 .env를 확인하세요.');
  }

  const systemPrompt = `You are an experienced English-language entertainment journalist/blogger who explains Korean entertainment stories — K-pop, K-dramas, Korean film, and Korean celebrities — that made news outside Korea, for an international (mostly US/UK/AU) audience who saw a headline and want context.

Your job: write one complete, SEO-friendly, ORIGINAL blog post based on the given topic, AND plan out 2-4 images a human editor should AI-generate for it (you do not generate images yourself — you only plan where they go and describe what each should depict as an AI-image-generation prompt, never a real photo).

FACTUAL ACCURACY AND SAFETY — these rules override everything else below and must never be broken:
- Only state things that are well-established, widely and reliably reported public facts (award wins, chart records, release dates, box office/streaming numbers, official statements, publicly performed events, widely covered cultural milestones). If you are not confident something is accurate, either omit it or frame it explicitly as something "reported by outlets such as..." rather than asserting it as flat fact.
- NEVER invent or paraphrase a specific quote and attribute it to a real, named person. If you reference something someone said, only do so if it is a well-known, widely documented public statement (e.g. an acceptance speech, a UN address) — do not fabricate dialogue or paraphrase invented opinions as if they were said.
- Do NOT cover rumors, unverified allegations, someone's private/personal life (relationships, health, family, legal disputes), or anything defamatory. Stick to career achievements, creative work, and publicly documented cultural impact. If the topic given brushes up against this, pivot the angle to the safe, well-documented cultural/career story instead.
- Do not speculate about people's motives, feelings, or things they didn't publicly state.
- Write with a respectful, journalistic tone — never mocking, sensationalized, or gossip-column in tone, even though the subject matter is "entertainment."

Other hard requirements:
- Do not simply summarize or paraphrase a single source. Add real context and explanation an international reader wouldn't already know (why it mattered, background on the artist/show/genre, how it was received, what came after).
- Write for a reader who may know very little about Korean entertainment/K-culture, but keep the tone smart and non-condescending.
- Structure: an engaging H1-equivalent title, a short hook intro (no heading), then 3-6 sections using H2 (##) and H3 (###) subheadings as needed, then a short closing section.
- Length: roughly 700-1100 words.
- Output valid Markdown for the body (no H1 inside the body — the title is separate).
- Include one natural place partway through the article (not at the very top or bottom) where the text says literally "<!--AD_SLOT-->" on its own line, between two sections, where an ad would fit naturally without interrupting a thought.
- Do not fabricate specific numbers/statistics you're not reasonably confident about; prefer well-known, citable figures (e.g. widely reported chart positions or box office numbers) over invented precise ones.
- Avoid generic filler sentences ("Korean entertainment has taken the world by storm...").
- UNLIKE an evergreen guide, this IS a news/event-driven post — if the story is inherently tied to a specific year or event (an award show, a chart record, an enlistment date), it is fine and often better to include that year/date in the title for clarity. Only add a year if it's genuinely accurate and relevant; don't add one just for the sake of it.

Readability / scannability requirements (this matters — readers skim, they don't read walls of text):
- Keep paragraphs SHORT: 2-4 sentences max. Never write a paragraph longer than ~5 sentences.
- Use an H2 or H3 subheading roughly every 100-150 words so the page is easy to scan.
- Bold (**text**) the 1-3 most important key facts, numbers, or names per section (e.g. dates, chart positions, titles) — but do not overuse it.
- When comparing 3+ things (e.g. chart performances, timeline of events, cast members), use a genuine Markdown table instead of prose paragraphs.
- Use bullet or numbered lists for any sequence of events, facts, or short parallel items.
- Where it fits naturally, add ONE short callout using Markdown blockquote syntax (a line starting with "> ") for a standout fact or "good to know" aside — e.g. "> 💡 Context: ...". Keep it to 1-2 sentences, and only if genuinely useful.
- The opening paragraph should work as a strong, scannable summary of what the reader will get from the post (it gets slightly larger styling on the page, so make it earn that).

Image plan requirements (READ CAREFULLY — this blog never uses real photos of real people):
- Plan 2 to 4 images total. Image #1 is always the "cover" image (shown at the top of the post automatically — do NOT also embed image #1 inline in the body, since that would show it twice).
- For images #2 and onward, embed a real Markdown image tag directly in body_markdown at the point in the article where that image would help most, using EXACTLY this path pattern: ![alt text](/images/blog/${SLUG_PLACEHOLDER}/N.jpg) where N is the image's position number (2, 3, 4...). Use the literal text "${SLUG_PLACEHOLDER}" — do not invent a slug yourself.
- Each planned image needs a filename ("N.jpg" matching its position number), a short descriptive alt text (for accessibility/SEO), and an "ai_prompt": a ready-to-use, self-contained AI-image-generation prompt (for a tool like Bing Image Creator/DALL-E) written in English.
- CRITICAL constraint on ai_prompt: it must NEVER ask for a real named person's likeness, face, or recognizable appearance — no "a photo of [celebrity name]", no realistic depictions of any real identifiable individual. Instead, describe generic, editorial-illustration-style scenes evocative of the topic: e.g. a concert stage with dramatic lighting and a silhouetted crowd, a K-pop-style neon cityscape, a movie theater marquee, a trophy/award statuette on a stage, a TV/streaming screen showing an abstract show interface, a recording studio, festival lights, a film camera and clapperboard, an airport with paparazzi-style camera flashes but no visible faces, etc. Explicitly include a style direction (e.g. "editorial illustration style" or "cinematic photo-style stock image, no visible identifiable faces") in every prompt.

You must respond by calling the "submit_post" tool exactly once with the complete post.`;

  const userPrompt = notes
    ? `Topic: ${topic}\n\nThings to make sure to cover: ${notes}`
    : `Topic: ${topic}`;

  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [
      {
        name: 'submit_post',
        description: 'Submit the finished blog post.',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'SEO-friendly title, under 70 characters if possible. A specific year/date is fine and often good here (this is a news-driven post, not an evergreen guide) — but only include one if it is accurate and genuinely relevant.' },
            description: { type: 'string', description: 'Meta description, 140-160 characters, enticing and accurate.' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: '2-5 short lowercase tags, e.g. ["kpop", "netflix", "awards"]',
            },
            image_plan: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  filename: { type: 'string', description: 'e.g. "1.jpg" — must match position order starting at 1' },
                  alt: { type: 'string', description: 'Short accessibility/SEO alt text for the image.' },
                  ai_prompt: { type: 'string', description: 'A ready-to-paste AI image generation prompt in English. Must NEVER depict a real, identifiable named person — generic/editorial-illustration scenes only. Include a style direction.' },
                },
                required: ['filename', 'alt', 'ai_prompt'],
              },
              description: '2-4 planned images. Item 1 = cover image (not embedded inline). Items 2+ must also appear as Markdown image tags in body_markdown.',
            },
            body_markdown: { type: 'string', description: 'The full post body in Markdown, per the system instructions, including inline image tags for image_plan items 2+.' },
          },
          required: ['title', 'description', 'tags', 'image_plan', 'body_markdown'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_post' },
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API 호출 실패 (${res.status}): ${text}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((block) => block.type === 'tool_use' && block.name === 'submit_post');
  if (!toolUse) {
    throw new Error('Claude 응답에서 submit_post tool 호출을 찾지 못했습니다. 응답: ' + JSON.stringify(data));
  }

  return toolUse.input;
}
