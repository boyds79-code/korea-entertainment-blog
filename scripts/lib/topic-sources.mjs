import fs from 'node:fs';
import path from 'node:path';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '../..');
const QUEUE_PATH = path.join(ROOT, 'topics', 'queue.yaml');
const USED_TRENDS_PATH = path.join(ROOT, 'topics', 'used-trends.json');

/**
 * 큐(topics/queue.yaml)에 사람이 직접 넣어둔 주제가 남아있으면 그걸 먼저 꺼내 쓰고,
 * 큐가 비어있으면 오늘자 실제 한국 연예 뉴스 헤드라인(구글 뉴스, 최근 1~2일 이내)에서
 * 하나 찾아옵니다.
 *
 * 예전에는 이 블로그가 트렌드 자동 탐색을 아예 쓰지 않았습니다 — 몇 년 지난 이슈만
 * 큐에 쌓여있으면 신선도가 떨어진다는 문제가 있어서, 큐가 비면 "지금" 실제로 보도되고
 * 있는 뉴스만 다루도록 전환했습니다. 실존 연예인을 다루는 만큼, 트렌드로 찾은 주제도
 * 생성 프롬프트의 안전장치(소문/사생활 금지, 검증된 사실만, 실제 얼굴 이미지 금지)를
 * 그대로 통과합니다 — 다만 사람이 PR을 머지하기 전에 반드시 사실관계를 확인해주세요.
 *
 * 리턴값: { topic, notes, source: 'manual' | 'trend' }
 */
export async function getNextTopic() {
  const fromQueue = popFromQueue();
  if (fromQueue) {
    return { ...fromQueue, source: 'manual' };
  }

  const fromTrend = await findTrendTopic();
  return { ...fromTrend, source: 'trend' };
}

function popFromQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return null;

  const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
  const doc = yamlLoad(raw);
  if (!Array.isArray(doc) || doc.length === 0) return null;

  const [next, ...rest] = doc;
  const header = `# 직접 정한 주제 대기열입니다. 여기 넣어둔 게 있으면 트렌드 탐색보다 먼저 씁니다.\n# 매일 자동 실행(daily-post.yml)이 돌 때마다 맨 위 항목을 하나 꺼내서\n# 초안을 생성하고, 사용된 항목은 이 파일에서 자동으로 제거됩니다.\n#\n# 이 큐가 비면 자동으로 "오늘의 실제 한국 연예 뉴스" 트렌드 탐색 모드로 전환됩니다 —\n# 여기에 넣는 주제도 최근(대략 한 달 이내) 것 위주로 유지해주세요. 오래된 이슈는\n# 신선도가 떨어지니 넣지 않는 걸 권장합니다.\n`;
  fs.writeFileSync(QUEUE_PATH, header + yamlDump(rest, { lineWidth: 100 }));

  return { topic: next.topic, notes: next.notes || '' };
}

/**
 * 구글 뉴스 RSS에서 최근 1~2일 내 한국 연예(K-pop/K-드라마/한국 영화 등) 관련
 * 기사 제목을 찾아 그날의 실제 화제를 주제로 씁니다. 몇 년 지난 이슈를 계속
 * 재탕하지 않기 위한 조치 — 큐가 비면 항상 "지금" 뉴스만 다룹니다.
 */
async function findTrendTopic() {
  const query =
    '(K-pop OR Kpop OR "Korean drama" OR "K-drama" OR "Korean film" OR "Korean movie" OR "Korean actor" OR "Korean actress" OR "Korean singer" OR "Korean idol") when:2d';
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(feedUrl, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; korea-entertainment-blog-bot/1.0)' },
  });
  if (!res.ok) {
    throw new Error(`뉴스 트렌드 소스 호출 실패 (${res.status})`);
  }
  const xml = await res.text();

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const used = loadUsedTrends();

  for (const item of items) {
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
    if (!titleMatch) continue;
    // 구글 뉴스 제목은 보통 "기사 제목 - 언론사명" 형태라 언론사명은 잘라냄
    const rawTitle = titleMatch[1].replace(/\s+-\s+[^-]+$/, '').trim();
    if (!rawTitle) continue;
    if (used.has(rawTitle.toLowerCase())) continue;

    saveUsedTrend(rawTitle);
    return {
      topic: `A blog post about this recent Korean entertainment news headline (published within the last day or two), written for global fans unfamiliar with the full background: "${rawTitle}". Explain the achievement/release/record and give context an outsider would need — don't just repeat the headline.`,
      notes:
        'This is based on a real, very recent news headline. Only state specific facts (dates, numbers, names, awards) you are confident are accurate from the headline itself — if a detail is unclear, keep that part general rather than guessing or inventing it. Stick to documented career/creative achievements; no rumor, unverified claims, or private-life speculation. A human will fact-check this against the source before merging the PR, so flag anything you were unsure about.',
    };
  }

  throw new Error(
    '오늘 새로 찾은 한국 연예 뉴스 주제가 없습니다 (최근 기사가 모두 이미 사용됐거나 검색 결과가 비어있음). topics/queue.yaml에 최신 주제를 직접 추가하거나, 다음 자동 실행(또는 몇 시간 뒤 수동 Run workflow)을 기다려주세요.'
  );
}

function loadUsedTrends() {
  if (!fs.existsSync(USED_TRENDS_PATH)) return new Set();
  try {
    const arr = JSON.parse(fs.readFileSync(USED_TRENDS_PATH, 'utf8'));
    return new Set(arr.map((s) => s.toLowerCase()));
  } catch {
    return new Set();
  }
}

function saveUsedTrend(title) {
  const used = fs.existsSync(USED_TRENDS_PATH) ? JSON.parse(fs.readFileSync(USED_TRENDS_PATH, 'utf8')) : [];
  used.push(title);
  // 최근 200개만 보관 (파일이 무한정 커지지 않도록)
  const trimmed = used.slice(-200);
  fs.writeFileSync(USED_TRENDS_PATH, JSON.stringify(trimmed, null, 2) + '\n');
}
