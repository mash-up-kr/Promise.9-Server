#!/usr/bin/env bun
// link.json의 링크들을 실제 링크 미리보기(LinkContentService.preview)에 태워
// 원본 링크의 썸네일(160x200)이 어떻게 뜨는지 눈으로 확인하는 로컬 데모 서버.
// 컨트롤러의 JWT 가드를 우회하기 위해 서비스를 직접 인스턴스화해 사용한다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { UrlSecurityService } from '../src/common/security/url-security/url-security.service'
import { LinkContentService } from '../src/modules/link/content/link-content.service'

const contentService = new LinkContentService(new UrlSecurityService())

const linkGroups = JSON.parse(
    readFileSync(join(import.meta.dir, '..', 'link.json'), 'utf8'),
) as Record<string, string[]>

const totalLinks = Object.values(linkGroups).reduce((n, l) => n + l.length, 0)
const PORT = Number(process.env.PREVIEW_GALLERY_PORT ?? 4599)

const page = /* html */ `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>링크 미리보기 썸네일 갤러리</title>
<style>
  :root { --thumb-w: 160px; --thumb-h: 200px; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", sans-serif; background: #0f1115; color: #e6e8eb; }
  header { position: sticky; top: 0; z-index: 10; background: #151923; border-bottom: 1px solid #262c3a; padding: 14px 20px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  .stats { display: flex; gap: 12px; font-size: 13px; color: #9aa4b2; }
  .stats b { color: #e6e8eb; }
  .stats .ok { color: #56d364; }
  .stats .fail { color: #f0736a; }
  main { padding: 20px; }
  section { margin-bottom: 32px; }
  section > h2 { font-size: 14px; color: #9aa4b2; font-weight: 600; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid #262c3a; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--thumb-w), 1fr)); gap: 16px; }
  .card { width: 100%; max-width: 220px; }
  .thumb { width: var(--thumb-w); height: var(--thumb-h); border-radius: 10px; overflow: hidden; background: #1c2230; border: 1px solid #262c3a; display: flex; align-items: center; justify-content: center; position: relative; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb .ph { font-size: 12px; color: #6b7382; text-align: center; padding: 0 10px; line-height: 1.5; }
  .thumb.loading::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent); animation: sweep 1.1s infinite; }
  @keyframes sweep { 100% { transform: translateX(100%); } }
  .meta { width: var(--thumb-w); margin-top: 8px; }
  .meta .title { font-size: 13px; font-weight: 600; line-height: 1.35; max-height: 3.6em; overflow: hidden; }
  .meta .source { font-size: 11px; color: #7d8695; margin-top: 4px; }
  .meta a { color: #6ea8fe; text-decoration: none; font-size: 11px; word-break: break-all; display: inline-block; margin-top: 4px; }
  .meta a:hover { text-decoration: underline; }
  .badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-top: 6px; }
  .badge.err { background: #3a1d1d; color: #f0736a; }
  .badge.noimg { background: #3a331d; color: #e3b341; }
</style>
</head>
<body>
<header>
  <h1>🖼️ 링크 미리보기 썸네일 갤러리 <span style="color:#7d8695;font-weight:400">160×200</span></h1>
  <div class="stats">
    <span>전체 <b id="s-total">0</b></span>
    <span>완료 <b id="s-done">0</b></span>
    <span class="ok">썸네일 <b id="s-ok">0</b></span>
    <span class="fail">실패/없음 <b id="s-fail">0</b></span>
  </div>
</header>
<main id="app"></main>
<script>
const GROUPS = __DATA__;
const app = document.getElementById('app');
const el = (id) => document.getElementById(id);
let done = 0, ok = 0, fail = 0, total = 0;

const queue = [];
for (const [category, urls] of Object.entries(GROUPS)) {
  const section = document.createElement('section');
  const h2 = document.createElement('h2');
  h2.textContent = category + ' (' + urls.length + ')';
  const grid = document.createElement('div');
  grid.className = 'grid';
  section.append(h2, grid);
  app.append(section);
  for (const url of urls) {
    total++;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<div class="thumb loading"><span class="ph">불러오는 중…</span></div>' +
      '<div class="meta"><div class="title"></div><div class="source"></div>' +
      '<a target="_blank" rel="noreferrer"></a><div class="badgewrap"></div></div>';
    card.querySelector('a').href = url;
    card.querySelector('a').textContent = url.length > 48 ? url.slice(0, 48) + '…' : url;
    grid.append(card);
    queue.push({ url, card });
  }
}
el('s-total').textContent = total;

function render({ url, card }, data) {
  const thumb = card.querySelector('.thumb');
  const title = card.querySelector('.title');
  const source = card.querySelector('.source');
  const badgewrap = card.querySelector('.badgewrap');
  thumb.classList.remove('loading');
  title.textContent = data.title || '(제목 없음)';
  source.textContent = data.source || '';
  done++; el('s-done').textContent = done;

  if (data.error) {
    thumb.innerHTML = '<span class="ph">미리보기 실패</span>';
    badgewrap.innerHTML = '<span class="badge err">' + escapeHtml(data.error) + '</span>';
    fail++; el('s-fail').textContent = fail;
    return;
  }
  if (!data.thumbnailUrl) {
    thumb.innerHTML = '<span class="ph">썸네일 없음<br>(og:image 미검출)</span>';
    badgewrap.innerHTML = '<span class="badge noimg">no image</span>';
    fail++; el('s-fail').textContent = fail;
    return;
  }
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.onload = () => { thumb.innerHTML = ''; thumb.append(img); ok++; el('s-ok').textContent = ok; };
  img.onerror = () => {
    thumb.innerHTML = '<span class="ph">이미지 로드 실패<br>(핫링크 차단 가능)</span>';
    badgewrap.innerHTML = '<span class="badge noimg">img blocked</span><div style="font-size:10px;color:#6b7382;margin-top:4px;word-break:break-all">' + escapeHtml(data.thumbnailUrl) + '</div>';
    fail++; el('s-fail').textContent = fail;
  };
  img.src = data.thumbnailUrl;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function worker() {
  while (queue.length) {
    const item = queue.shift();
    try {
      const res = await fetch('/api/preview?url=' + encodeURIComponent(item.url));
      render(item, await res.json());
    } catch (e) {
      render(item, { error: '요청 오류' });
    }
  }
}
// 원문 서버를 과하게 때리지 않도록 동시 5개로 제한
const CONCURRENCY = 5;
for (let i = 0; i < CONCURRENCY; i++) worker();
</script>
</body>
</html>`

function renderPage(): string {
    return page.replace('__DATA__', JSON.stringify(linkGroups))
}

Bun.serve({
    port: PORT,
    idleTimeout: 60,
    async fetch(req) {
        const url = new URL(req.url)

        if (url.pathname === '/') {
            return new Response(renderPage(), {
                headers: { 'content-type': 'text/html; charset=utf-8' },
            })
        }

        if (url.pathname === '/api/preview') {
            const target = url.searchParams.get('url')
            if (!target) {
                return Response.json(
                    { error: 'url 파라미터가 필요합니다.' },
                    { status: 400 },
                )
            }
            try {
                const preview = await contentService.preview(target)
                return Response.json(preview)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                // 개별 링크 실패는 화면에서 사유를 보여주기 위해 200 + error로 응답
                return Response.json({
                    title: null,
                    thumbnailUrl: null,
                    source: '',
                    error: message,
                })
            }
        }

        return new Response('Not found', { status: 404 })
    },
})

console.log(`\n🖼️  링크 미리보기 갤러리`)
console.log(`    링크 ${totalLinks}개 · http://localhost:${PORT}\n`)
