# K-Entertainment, Explained — 자동 초안 + 사람 검수 블로그

영어권 독자를 대상으로, 해외에서 뉴스거리가 됐던 한국 연예/엔터테인먼트 이슈(K-pop, K-드라마,
한국 영화, 수상/기록 등)를 설명하는 블로그입니다. Astro로 만든 정적 사이트이고, 매일 GitHub
Actions가 Claude API로 글 초안을 자동 생성해 Pull Request를 올리면, **사람이 검토하고 PR을
머지해야만** 실제로 사이트에 발행되는 구조입니다. (초안 자동 생성 ≠ 자동 발행)

이 프로젝트는 `korea-blog`/`korea-recipes-blog`와 뼈대는 같지만, **실존 인물을 다룬다는 점** 때문에
두 가지가 다릅니다. 반드시 읽어주세요.

### 1) 큐가 비면 "오늘의 실제 뉴스" 트렌드 모드로 전환됩니다
`topics/queue.yaml`에 직접 넣어둔 주제가 있으면 그걸 먼저 씁니다. 큐가 비면 자동으로 구글
뉴스에서 최근 1~2일 내 한국 연예(K-pop/K-드라마/한국 영화 등) 관련 헤드라인을 찾아 그걸로
글을 씁니다 — 몇 년 지난 이슈를 계속 재탕하지 않고 항상 "지금" 화제인 것만 다루기 위해서입니다.

트렌드로 찾은 주제도 아래 시스템 프롬프트 안전장치(소문/사생활 금지, 검증된 사실 위주,
실제 얼굴 이미지 금지)를 그대로 통과하지만, **당일 속보 기반이라 사람이 PR을 머지하기 전에
반드시 헤드라인의 사실관계를 직접 확인해주세요.** 애매하거나 아직 검증 안 된 내용이 보이면
PR을 머지하지 말고 닫아주세요.

오늘자 후보 기사가 하나도 없으면(검색 결과가 비었거나 전부 이미 쓴 헤드라인이면) 그날은
자동 실행이 에러로 멈춥니다 — 실패 알림을 받으면 `topics/queue.yaml`에 직접 최신 주제를
추가하거나, 몇 시간 뒤 다시 **Run workflow**로 수동 실행해보세요.

### 2) 사진 대신 AI 생성 이미지를 씁니다 — GEMINI_API_KEY를 넣으면 완전 자동
실존 연예인 사진을 아무거나 쓰면 초상권/저작권 문제가 생깁니다. 그래서 Claude가 글을 쓸 때마다
"실제 인물이 등장하지 않는" AI 이미지 생성 프롬프트를 같이 만듭니다 (콘서트 무대, 트로피, 필름
카메라, 네온 도시 풍경 같은 편집 일러스트 스타일). `GEMINI_API_KEY`를 등록해두면 그 프롬프트로
**Gemini가 이미지를 자동으로 만들어서 바로 폴더에 넣고 PR에 포함시킵니다** — 사람이 할 일은
PR을 열어 내용과 이미지를 확인하고 머지 버튼만 누르는 것뿐입니다. 키를 등록하지 않으면 예전처럼
프롬프트만 만들어지고 `npm run photos`로 사람이 직접 채워 넣으면 됩니다. 자세한 건 아래
"이미지는 AI로 생성합니다" 참고.

## 어떻게 작동하나요

1. 매일 정해진 시간에 GitHub Actions(`daily-post.yml`)가 실행됩니다.
2. `topics/queue.yaml`에서 맨 위 주제를 하나 꺼내 씁니다. (비어 있으면 실행이 에러로 멈춥니다 — 위 설명 참고)
3. Claude API를 호출해 SEO에 맞춘 완성된 글 초안(`src/content/blog/*.md`)과 함께, 이미지 자리마다
   쓸 AI 이미지 생성 프롬프트를 만듭니다.
4. 생성된 파일을 새 브랜치에 커밋하고, **Pull Request를 엽니다.** 이 시점에는 아무것도 사이트에 반영되지 않습니다.
5. 당신이 PR을 열어 **사실관계를 확인하고**, 필요하면 직접 수정한 뒤, 이미지를 채워 넣고 **머지(merge)** 합니다.
6. `main` 브랜치에 머지되는 순간 Vercel이 자동으로 빌드/배포해서 글이 실제로 공개됩니다.

## 시작하기 (처음 한 번만)

### 1. 로컬에서 확인
```bash
npm install
npm run dev        # http://localhost:4321 에서 확인
npm run build      # 정적 빌드가 에러 없이 되는지 확인
```

### 2. GitHub 저장소 만들기
새 GitHub 저장소를 만들고 이 프로젝트 전체를 push하세요.
```bash
git init
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin <당신의-저장소-URL>
git push -u origin main
```

### 3. Anthropic API 키 발급 및 등록
1. https://console.anthropic.com 에서 API 키를 발급받으세요.
2. GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `ANTHROPIC_API_KEY`
   - Value: 발급받은 키
3. (선택) 모델을 바꾸고 싶으면 같은 화면의 **Variables** 탭에서 `CLAUDE_MODEL` 변수를 추가하세요.

### 3-1. (강력 추천) Gemini API 키로 이미지까지 완전 자동화
1. https://aistudio.google.com/apikey 에서 무료로 API 키를 발급받으세요.
2. 같은 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `GEMINI_API_KEY`
   - Value: 발급받은 키
3. 이걸 등록해두면 PR이 열릴 때 이미지까지 이미 채워져서 옵니다 — `npm run photos`를 아예 안 써도 됩니다.
   등록하지 않으면 예전처럼 프롬프트만 만들어지고 사람이 직접 채워야 합니다.

### 4. GitHub Actions에 PR 생성 권한 확인
저장소 **Settings → Actions → General → Workflow permissions**에서
"Read and write permissions" + "Allow GitHub Actions to create and approve pull requests"가
켜져 있는지 확인하세요.

### 5. Vercel 연결
1. https://vercel.com 에서 GitHub 저장소를 import 하세요.
2. Framework Preset은 자동으로 Astro가 잡힙니다. 별다른 설정 없이 Deploy를 누르면 됩니다.
3. 이후로는 `main`에 push(=PR 머지)될 때마다 자동 재배포됩니다.
4. 도메인을 연결했다면 `astro.config.mjs`의 `SITE_URL`과 `public/robots.txt`의 sitemap 주소도
   실제 도메인으로 바꿔주세요.

### 6. 첫 실행 테스트
저장소의 **Actions 탭 → Daily draft post → Run workflow** 를 눌러 수동으로 한 번 실행해보세요.
몇 분 뒤 PR이 하나 열리면 정상 작동하는 것입니다.

## 이미지는 AI로 생성합니다

이 프로젝트는 실제 인물 사진을 자동으로 검색/다운로드하지 않습니다. 대신 두 가지 모드가 있습니다.

### GEMINI_API_KEY를 등록한 경우 (완전 자동)
글이 생성되는 시점(`scripts/lib/gemini-images.mjs`)에 각 이미지의 AI 프롬프트로 Gemini를 호출해
실제 이미지 파일을 만들고 바로 `public/images/blog/<slug>/`에 저장합니다. PR이 열릴 때 이미
이미지가 포함되어 있으니, **PR을 열어 내용 + 이미지를 확인하고 머지만 하면 끝**입니다.

일부 이미지 생성만 실패하는 경우도 있습니다 (네트워크 오류, 안전 필터 차단 등) — 이때는 그
이미지만 아래 수동 체크리스트에 남고, 나머지는 이미 폴더에 들어가 있습니다.

### GEMINI_API_KEY가 없는 경우 (수동)
1. Claude가 초안을 쓰면서 2~4장짜리 이미지 계획을 같이 만듭니다 (1번은 항상 대표/커버 이미지).
   각 이미지는 실제 인물의 얼굴/모습을 요청하지 않는 프롬프트로 설계됩니다.
2. 생성된 `.md` 파일 맨 위, frontmatter 바로 아래에 HTML 주석으로 체크리스트가 남습니다. 예:
   ```
   <!--
   🎨 이 글에 필요한 AI 생성 이미지 — public/images/blog/<slug>/ 폴더 안에 아래 파일명 그대로 넣으면 자동으로 연결됩니다.
   무료 생성 도구: https://www.bing.com/images/create
   1. 1.jpg (대표/커버 이미지) — 프롬프트: A dramatic concert stage with neon lights and a silhouetted crowd, editorial illustration style, no visible faces
   2. 2.jpg — 프롬프트: A golden trophy award statuette on a spotlighted stage, cinematic stock-photo style
   -->
   ```
3. `npm run photos`를 실행하면 해당 draft PR 브랜치로 자동 전환되고, 이미지 폴더가 열리고,
   위 프롬프트 체크리스트가 콘솔에 그대로 표시됩니다.
4. 각 프롬프트를 복사해서 https://www.bing.com/images/create (무료, Microsoft 계정만 있으면 됨)
   에 붙여넣고, 생성된 이미지를 다운로드해서 체크리스트에 적힌 파일명 그대로 저장합니다.
5. 폴더에 다 넣고 스크립트에서 Enter를 누르면 자동으로 git add/commit/push까지 됩니다.

이미지를 아직 안 넣은 상태로 PR 미리보기를 열어보면 깨진 이미지 아이콘이 보이는데, 이건
"아직 안 넣었다"는 정상적인 신호입니다 — 머지 전에만 채우면 됩니다.

## 주제 큐 관리 (`topics/queue.yaml`)

- 기본적으로 비어 있습니다 — 큐가 비어 있으면 위에서 설명한 "오늘의 실제 뉴스" 트렌드 탐색이
  자동으로 대신 주제를 찾아옵니다. 특정 주제를 꼭 다루고 싶을 때만 여기에 직접 추가하세요.
- 자유롭게 순서를 바꾸거나 항목을 추가/삭제하세요. **새 주제를 추가할 때는 "이미 공식적으로
  발표됐거나 널리 보도된 사실"인지, 그리고 대략 한 달 이내의 신선한 이슈인지 스스로 한 번
  확인해주세요** — 오래된 이슈를 넣으면 신선도가 떨어집니다.
- 큐와 트렌드 탐색 둘 다 오늘 쓸 주제를 못 찾으면 자동 실행이 실패합니다 (의도된 동작입니다).
  실패 알림을 받으면 큐에 주제를 추가하거나, 몇 시간 뒤 다시 **Run workflow**로 수동
  실행해보세요.

## 로컬에서 초안 생성 테스트

```bash
cp .env.example .env
# .env에 ANTHROPIC_API_KEY (그리고 선택적으로 GEMINI_API_KEY) 채우기
set -a && source .env && set +a
npm run generate
```

## 프로젝트 구조

```
src/content/blog/       실제 글(Markdown). 여기 있는 파일 = 발행된 글
src/pages/               라우팅 (index, blog/[slug], about, contact, privacy, rss.xml)
src/layouts/              공통 레이아웃 (Base, BlogPost)
src/components/AdSlot.astro   애드센스 광고 슬롯 컴포넌트
public/images/blog/       AI로 생성해서 넣은 이미지들
topics/queue.yaml         직접 정한 주제 대기열 (이 블로그의 유일한 주제 소스)
scripts/generate-post.mjs 메인 초안 생성 스크립트
scripts/lib/               초안 생성에 쓰이는 하위 모듈들 (topic-sources, anthropic, gemini-images, slugify)
scripts/add-photos.mjs    이미지 수동 업로드 자동화 (npm run photos) — GEMINI_API_KEY가 없거나 일부 실패했을 때만 필요
.github/workflows/daily-post.yml   매일 실행되는 자동화
```

## 애드센스 준비

- `/about`, `/contact`, `/privacy` 페이지가 이미 실제 정보로 채워져 있습니다.
- 승인 전까지 광고 자리는 자리표시자(점선 박스)로만 보입니다. 승인받으면 Vercel 프로젝트의
  환경변수에 `PUBLIC_ADSENSE_CLIENT`, `PUBLIC_ADSENSE_SLOT_TOP`, `PUBLIC_ADSENSE_SLOT_BOTTOM`을
  채우고 재배포하면 실제 광고가 노출됩니다.
- **애드센스는 완전 무검수 대량 발행 사이트를 저품질로 판단합니다.** 특히 실존 인물을 다루는
  이 블로그는 사실관계 오류나 근거 없는 주장이 있으면 승인/유지 모두에 더 큰 리스크가 됩니다 —
  PR 리뷰를 형식적으로 통과시키지 말고 실제로 확인하고 고쳐서 머지하세요.

## 법적 안내

`src/pages/privacy.astro`는 애드센스 심사에 필요한 최소한의 템플릿이며 법률 자문이 아닙니다.
이 블로그는 실존 인물을 다루므로, 명예훼손·초상권 관련 리스크에 대해 필요시 별도로 법률
자문을 받는 것을 권장합니다. 정정 요청이 오면 `/contact`를 통해 신속히 대응하세요.
