import fs from 'node:fs';
import path from 'node:path';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '../..');
const QUEUE_PATH = path.join(ROOT, 'topics', 'queue.yaml');

/**
 * 큐(topics/queue.yaml)에서 다음 주제를 꺼내 씁니다.
 *
 * korea-blog/korea-recipes-blog와 달리 이 블로그는 "트렌드 자동 탐색"(구글 뉴스에서
 * 오늘의 헤드라인을 가져와 그걸로 글을 쓰는 기능)을 일부러 켜두지 않았습니다.
 * 실존 연예인을 다루는 만큼, 당일 속보성 헤드라인만 보고 AI가 바로 글을 쓰면
 * 아직 확인 안 된 내용이나 민감한 사생활 이슈를 다룰 위험이 있기 때문입니다.
 * 대신 사람이 직접 검증하고 골라 넣은 주제만 큐에서 꺼내 씁니다 — 큐가 비면
 * 에러를 내고 멈추므로, topics/queue.yaml에 안전하고 사실관계가 명확한 주제를
 * 꾸준히 채워 넣어 주세요.
 *
 * 리턴값: { topic, notes, source: 'manual' }
 */
export async function getNextTopic() {
  const fromQueue = popFromQueue();
  if (fromQueue) {
    return { ...fromQueue, source: 'manual' };
  }

  throw new Error(
    'topics/queue.yaml에 남은 주제가 없습니다. 이 블로그는 실존 인물을 다루기 때문에 자동 트렌드 탐색을 쓰지 않습니다 — ' +
      '검증된 주제를 topics/queue.yaml에 몇 개 더 추가한 뒤 다시 실행해주세요.'
  );
}

function popFromQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return null;

  const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
  const doc = yamlLoad(raw);
  if (!Array.isArray(doc) || doc.length === 0) return null;

  const [next, ...rest] = doc;
  const header = `# 직접 정한 주제 대기열입니다.\n# 매일 자동 실행(daily-post.yml)이 돌 때마다 맨 위 항목을 하나 꺼내서\n# 초안을 생성하고, 사용된 항목은 이 파일에서 자동으로 제거됩니다.\n#\n# 이 블로그는 실존 연예인을 다루므로 자동 트렌드 탐색을 쓰지 않습니다 — 큐가 비면\n# 다음 실행이 실패합니다. 사실관계가 확실하고(수상/차트기록/공식발표 등),\n# 사생활·소문·논란성 이슈가 아닌 주제만 추가해주세요.\n`;
  fs.writeFileSync(QUEUE_PATH, header + yamlDump(rest, { lineWidth: 100 }));

  return { topic: next.topic, notes: next.notes || '' };
}
