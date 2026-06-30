import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

import { UrlSecurityService } from '../../src/common/security/url-security/url-security.service'
import { NodeVibrantImageColorAnalyzer } from '../../src/modules/image-color/analyzers/node-vibrant-image-color.analyzer'
import { SharpImageColorAnalyzer } from '../../src/modules/image-color/analyzers/sharp-image-color.analyzer'
import { ImageColorService } from '../../src/modules/image-color/image-color.service'
import { ImageFetcherService } from '../../src/modules/image-color/image-fetcher/image-fetcher.service'
import {
    FetchedImage,
    ImageFetchOptions,
} from '../../src/modules/image-color/image-fetcher/image-fetcher.type'
import { ImageResponseReader } from '../../src/modules/image-color/image-fetcher/image-response.reader'
import {
    ImageColorAnalysisResult,
    ImageColorValue,
} from '../../src/modules/image-color/types/image-color.type'
import {
    NodeVibrantImageColorResult,
    NodeVibrantPaletteColor,
} from '../../src/modules/image-color/types/node-vibrant-image-color.type'

const DEFAULT_IMAGE_URL =
    'https://storage.ghost.io/c/01/4c/014cfdd2-a50d-44fc-9553-614de7a69e87/content/images/size/w2000/2023/12/tirza-van-dijk-o1SKqmgSDbg-unsplash.jpg'
const OUTPUT_PATH = resolve('.temp/image-color-preview.html')

async function main() {
    const imageUrl = process.argv[2] ?? DEFAULT_IMAGE_URL
    const imageFetcher = new TimedImageFetcherService(
        new UrlSecurityService(),
        new ImageResponseReader(),
    )
    const sharpAnalyzer = new TimedSharpImageColorAnalyzer()
    const nodeVibrantAnalyzer = new TimedNodeVibrantImageColorAnalyzer()
    const imageColorService = new ImageColorService(
        imageFetcher,
        sharpAnalyzer,
        nodeVibrantAnalyzer,
    )
    const memoryBefore = getMemorySnapshot()
    const testStartedAt = performance.now()

    // preview는 두 라이브러리의 전체 추출 결과를 모두 보여준다.
    const result = await imageColorService.extractAllFromUrl(imageUrl)

    const testEndedAt = performance.now()
    const memoryAfterExtraction = getMemorySnapshot()
    const diagnostics: PreviewDiagnostics = {
        generatedAt: new Date().toISOString(),
        totalMs: testEndedAt - testStartedAt,
        fetchMs: imageFetcher.lastFetchMs,
        nodeVibrantMs: nodeVibrantAnalyzer.lastMs,
        sharpMs: sharpAnalyzer.lastMs,
        memoryBefore,
        memoryAfterExtraction,
        memoryDelta: getMemoryDelta(memoryBefore, memoryAfterExtraction),
    }

    await mkdir(resolve('.temp'), { recursive: true })
    await writeFile(OUTPUT_PATH, renderHtml(result, diagnostics), 'utf8')

    console.log(`Image color preview generated: ${OUTPUT_PATH}`)
}

class TimedImageFetcherService extends ImageFetcherService {
    lastFetchMs = 0

    override async fetch(
        imageUrl: string,
        options: ImageFetchOptions = {},
    ): Promise<FetchedImage> {
        const startedAt = performance.now()

        try {
            return await super.fetch(imageUrl, options)
        } finally {
            this.lastFetchMs = performance.now() - startedAt
        }
    }
}

class TimedSharpImageColorAnalyzer extends SharpImageColorAnalyzer {
    lastMs = 0

    override async analyze(image: FetchedImage) {
        const startedAt = performance.now()

        try {
            return await super.analyze(image)
        } finally {
            this.lastMs = performance.now() - startedAt
        }
    }
}

class TimedNodeVibrantImageColorAnalyzer extends NodeVibrantImageColorAnalyzer {
    lastMs = 0

    override async analyze(
        image: FetchedImage,
    ): Promise<NodeVibrantImageColorResult> {
        const startedAt = performance.now()

        try {
            return await super.analyze(image)
        } finally {
            this.lastMs = performance.now() - startedAt
        }
    }
}

interface MemorySnapshot {
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
    arrayBuffers: number
}

interface PreviewDiagnostics {
    generatedAt: string
    totalMs: number
    fetchMs: number
    nodeVibrantMs: number
    sharpMs: number
    memoryBefore: MemorySnapshot
    memoryAfterExtraction: MemorySnapshot
    memoryDelta: MemorySnapshot
}

function renderHtml(
    result: ImageColorAnalysisResult,
    diagnostics: PreviewDiagnostics,
): string {
    const sharpResult = result.results.sharp
    const nodeVibrantResult = result.results.nodeVibrant

    const sharpColors = [
        ['averageColor', 'sharp 평균색', sharpResult.averageColor],
        ['dominantColor', 'sharp 대표색', sharpResult.dominantColor],
    ] satisfies [string, string, ImageColorValue][]
    const swatches = [
        ['vibrant', '선명한 대표색', nodeVibrantResult.colors.vibrant],
        ['muted', '차분한 대표색', nodeVibrantResult.colors.muted],
        [
            'darkVibrant',
            '어둡고 선명한 색',
            nodeVibrantResult.colors.darkVibrant,
        ],
        ['darkMuted', '어둡고 차분한 색', nodeVibrantResult.colors.darkMuted],
        [
            'lightVibrant',
            '밝고 선명한 색',
            nodeVibrantResult.colors.lightVibrant,
        ],
        ['lightMuted', '밝고 차분한 색', nodeVibrantResult.colors.lightMuted],
    ] satisfies [string, string, NodeVibrantPaletteColor | null][]

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>이미지 추출 테스트</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #16191f;
      --subtle: #586170;
      --line: #cbd3de;
      --paper: #eef2f6;
      --panel: #ffffff;
      --accent: #0b6bcb;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background:
        linear-gradient(90deg, rgba(20, 23, 27, 0.045) 1px, transparent 1px),
        linear-gradient(0deg, rgba(20, 23, 27, 0.035) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      color: var(--ink);
      font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
    }

    main {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 24px 0;
    }

    header {
      display: grid;
      grid-template-columns: minmax(260px, 0.95fr) minmax(320px, 1.05fr);
      gap: 24px;
      align-items: end;
      margin-bottom: 24px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      font-weight: 700;
      line-height: 1.08;
      letter-spacing: 0;
      text-wrap: balance;
    }

    .meta {
      display: grid;
      gap: 7px;
      padding-bottom: 6px;
      color: var(--subtle);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      overflow-wrap: anywhere;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 20px;
    }

    .metric {
      min-height: 96px;
      display: grid;
      align-content: space-between;
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 12px;
      box-shadow: 0 10px 24px rgba(35, 45, 58, 0.08);
    }

    .metric-label {
      color: var(--subtle);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10px;
    }

    .metric-value {
      margin-top: 10px;
      color: var(--ink);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0;
    }

    .metric-note {
      margin-top: 6px;
      color: var(--subtle);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10px;
      overflow-wrap: anywhere;
    }

    .metric.primary {
      border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
      box-shadow:
        inset 0 4px 0 var(--accent),
        0 10px 24px rgba(35, 45, 58, 0.08);
    }

    .media {
      display: grid;
      gap: 18px;
      margin-top: 24px;
    }

    .section-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      border-top: 1px solid var(--line);
      padding-top: 20px;
      color: var(--ink);
    }

    .section-title h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.1;
      letter-spacing: 0;
    }

    .section-title span {
      color: var(--subtle);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      overflow-wrap: anywhere;
    }

    .image-frame {
      overflow: hidden;
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: 0 18px 45px rgba(46, 38, 28, 0.13);
    }

    img {
      display: block;
      width: 100%;
      max-height: 620px;
      aspect-ratio: 16 / 9;
      object-fit: cover;
    }

    .swatches {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .sharp-swatches {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .result-group {
      display: grid;
      gap: 10px;
    }

    .result-group h3 {
      margin: 0;
      color: var(--subtle);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      font-weight: 700;
    }

    .swatch {
      min-height: 168px;
      display: grid;
      align-content: space-between;
      border: 1px solid rgba(0, 0, 0, 0.12);
      padding: 14px;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
    }

    .swatch.empty {
      background: repeating-linear-gradient(
        -45deg,
        #f0ece5,
        #f0ece5 10px,
        #d5dce5 10px,
        #d5dce5 20px
      );
      color: #5f5a54;
    }

    .name {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .hex {
      margin-top: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .detail {
      display: grid;
      gap: 5px;
      margin-top: 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      overflow-wrap: anywhere;
    }

    .sample {
      display: inline-flex;
      width: fit-content;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      border: 1px solid currentColor;
      padding: 7px 9px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
    }

    @media (max-width: 820px) {
      main {
        width: min(100vw - 24px, 680px);
        padding: 20px 0;
      }

      h1 {
        font-size: 24px;
      }

      header {
        grid-template-columns: 1fr;
      }

      .section-title {
        align-items: flex-start;
        flex-direction: column;
      }

      .swatches {
        grid-template-columns: 1fr;
      }

      .sharp-swatches {
        grid-template-columns: 1fr;
      }

      .metrics {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>이미지 추출 테스트</h1>
      </div>
      <div class="meta">
        <div>이미지 URL: ${escapeHtml(result.sourceUrl)}</div>
        <div>콘텐츠 타입: ${escapeHtml(result.contentType)}</div>
        <div>이미지 크기: ${result.byteLength.toLocaleString('en-US')} bytes</div>
        <div>생성 시각: ${escapeHtml(diagnostics.generatedAt)}</div>
      </div>
    </header>

    <section class="media" aria-label="이미지">
      <div class="section-title">
        <h2>원본 이미지</h2>
        <span>${escapeHtml(result.contentType)} / ${formatBytes(result.byteLength)}</span>
      </div>
      <div class="image-frame">
        <img src="${escapeAttribute(result.sourceUrl)}" alt="색상을 추출한 원본 이미지" />
      </div>
    </section>

    <section class="media" aria-label="색상">
      <div class="section-title">
        <h2>추출 색상</h2>
        <span>sharp 평균/대표색 + node-vibrant 팔레트</span>
      </div>

      <div class="result-group">
        <h3>sharp 결과</h3>
        <div class="swatches sharp-swatches">
          ${sharpColors.map((color) => renderSharpColor(...color)).join('\n')}
        </div>
      </div>

      <div class="result-group">
        <h3>node-vibrant 결과</h3>
        <div class="swatches">
        ${swatches.map((swatch) => renderSwatch(...swatch)).join('\n')}
        </div>
      </div>
    </section>

    <section class="media" aria-label="측정 정보">
      <div class="section-title">
        <h2>측정 정보</h2>
        <span>현재 preview Node 프로세스 기준</span>
      </div>
      <div class="metrics">
        ${renderMetric('전체 테스트 시간', `${formatMs(diagnostics.totalMs)} ms`, '다운로드 + sharp + node-vibrant')}
        ${renderMetric('이미지 다운로드', `${formatMs(diagnostics.fetchMs)} ms`, 'URL 검증과 다운로드 시간')}
        ${renderMetric('sharp', `${formatMs(diagnostics.sharpMs)} ms`, '평균색과 대표색 계산', true)}
        ${renderMetric('node-vibrant', `${formatMs(diagnostics.nodeVibrantMs)} ms`, '기본 팔레트 6종 추출', true)}
        ${renderMetric('프로세스 RSS', formatBytes(diagnostics.memoryAfterExtraction.rss), `추출 전후 변화 ${formatSignedBytes(diagnostics.memoryDelta.rss)}`)}
        ${renderMetric('프로세스 Heap Used', formatBytes(diagnostics.memoryAfterExtraction.heapUsed), `추출 전후 변화 ${formatSignedBytes(diagnostics.memoryDelta.heapUsed)}`)}
        ${renderMetric('프로세스 Heap Total', formatBytes(diagnostics.memoryAfterExtraction.heapTotal), `추출 전후 변화 ${formatSignedBytes(diagnostics.memoryDelta.heapTotal)}`)}
        ${renderMetric('프로세스 External', formatBytes(diagnostics.memoryAfterExtraction.external), `추출 전후 변화 ${formatSignedBytes(diagnostics.memoryDelta.external)}`)}
        ${renderMetric('프로세스 ArrayBuffer', formatBytes(diagnostics.memoryAfterExtraction.arrayBuffers), `추출 전후 변화 ${formatSignedBytes(diagnostics.memoryDelta.arrayBuffers)}`)}
        ${renderMetric('이미지 용량', formatBytes(result.byteLength), result.byteLength.toLocaleString('en-US') + ' bytes')}
      </div>
    </section>
  </main>
</body>
</html>
`
}

function renderSwatch(
    key: string,
    label: string,
    color: NodeVibrantPaletteColor | null,
): string {
    if (!color) {
        return `<article class="swatch empty">
  <div>
    <div class="name">${escapeHtml(label)}</div>
    <div class="hex">없음</div>
  </div>
  <div class="detail">
    <span>키: ${escapeHtml(key)}</span>
  </div>
</article>`
    }

    return `<article class="swatch" style="background: ${escapeAttribute(color.hex)}; color: ${escapeAttribute(color.bodyTextColor)};">
  <div>
    <div class="name">${escapeHtml(label)}</div>
    <div class="hex">${escapeHtml(color.hex)}</div>
    <div class="sample" style="color: ${escapeAttribute(color.titleTextColor)};">제목 글자색: ${escapeHtml(color.titleTextColor)}</div>
  </div>
  <div class="detail">
    <span>키: ${escapeHtml(key)}</span>
    <span>rgb: ${color.rgb.join(', ')}</span>
    <span>hsl: ${color.hsl.map((value) => value.toFixed(3)).join(', ')}</span>
    <span>픽셀 군집: ${color.population.toLocaleString('en-US')}</span>
    <span>본문 글자색: ${escapeHtml(color.bodyTextColor)}</span>
  </div>
</article>`
}

function renderSharpColor(
    key: string,
    label: string,
    color: ImageColorValue,
): string {
    return `<article class="swatch" style="background: ${escapeAttribute(color.hex)}; color: ${escapeAttribute(color.textColor)};">
  <div>
    <div class="name">${escapeHtml(label)}</div>
    <div class="hex">${escapeHtml(color.hex)}</div>
    <div class="sample">텍스트 색상: ${escapeHtml(color.textColor)}</div>
  </div>
  <div class="detail">
    <span>키: ${escapeHtml(key)}</span>
    <span>rgb: ${color.rgb.join(', ')}</span>
    <span>luminance: ${color.luminance.toFixed(3)}</span>
    <span>어두운 색상: ${color.isDark ? '예' : '아니오'}</span>
  </div>
</article>`
}

function renderMetric(
    label: string,
    value: string,
    note: string,
    primary = false,
): string {
    return `<article class="metric${primary ? ' primary' : ''}">
  <div>
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${escapeHtml(value)}</div>
  </div>
  <div class="metric-note">${escapeHtml(note)}</div>
</article>`
}

function getMemorySnapshot(): MemorySnapshot {
    const usage = process.memoryUsage()

    return {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers,
    }
}

function getMemoryDelta(
    before: MemorySnapshot,
    after: MemorySnapshot,
): MemorySnapshot {
    return {
        rss: after.rss - before.rss,
        heapTotal: after.heapTotal - before.heapTotal,
        heapUsed: after.heapUsed - before.heapUsed,
        external: after.external - before.external,
        arrayBuffers: after.arrayBuffers - before.arrayBuffers,
    }
}

function formatMs(value: number): string {
    return value.toFixed(1)
}

function formatBytes(value: number): string {
    const absoluteValue = Math.abs(value)
    const units = ['B', 'KB', 'MB', 'GB']
    let unitIndex = 0
    let scaledValue = absoluteValue

    while (scaledValue >= 1024 && unitIndex < units.length - 1) {
        scaledValue /= 1024
        unitIndex++
    }

    const formattedValue =
        unitIndex === 0 ? scaledValue.toFixed(0) : scaledValue.toFixed(2)

    return `${formattedValue} ${units[unitIndex]}`
}

function formatSignedBytes(value: number): string {
    const sign = value >= 0 ? '+' : '-'

    return `${sign}${formatBytes(value)}`
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function escapeAttribute(value: string): string {
    return escapeHtml(value)
}

void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)

    console.error(`Image color preview failed: ${message}`)
    process.exitCode = 1
})
