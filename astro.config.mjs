import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: 실제 도메인 연결 후 이 값을 바꿔주세요 (사이트맵/RSS/canonical URL에 사용됩니다)
const SITE_URL = 'https://your-domain-here.com';

export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },
});
