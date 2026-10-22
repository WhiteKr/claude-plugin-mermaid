// mermaid 코드 펜스를 다이어그램으로 그린다.
// 터미널은 lovely-mermaid 박스 문자 텍스트로, Svg 요소가 있는 화면(desktop 등)은 beautiful-mermaid SVG로.
// beautiful-mermaid의 레이아웃 엔진 elkjs는 build.mjs가 dagre로 바꿔 끼운다(src/elk-dagre.js).
import { render } from 'lovely-mermaid';
import { renderMermaidSVG } from '../node_modules/beautiful-mermaid/src/index.ts'; // exports 맵이 src를 막아 직접 경로

const FENCE = /```mermaid[^\n]*\n([\s\S]*?)\n[ \t]*```/g;
const cache = new Map(); // ponytail: 세션 내 무제한 캐시, 메시지 수만큼만 자람

/** @returns {({ kind: 'markdown', text: string } | { kind: 'diagram', source: string, fence: string })[]} */
function segments(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    if (m.index > last) out.push({ kind: 'markdown', text: text.slice(last, m.index) });
    out.push({ kind: 'diagram', source: m[1], fence: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'markdown', text: text.slice(last) });
  return out;
}

function cached(key, make) {
  if (!cache.has(key)) {
    let out;
    try {
      out = make();
    } catch {
      out = null; // 파싱 실패: 원문 유지
    }
    cache.set(key, out);
  }
  return cache.get(key);
}

const art = (source) => cached('art:' + source, () => render(source));

// lovely-mermaid에는 ASCII 모드가 없어 그린 뒤 글자를 하나씩 바꾼다. 바꾸는 글자는 모두 1칸이라 정렬이 그대로다.
const ASCII = {};
const ascii = (to, glyphs) => [...glyphs].forEach((g) => (ASCII[g] = to));
ascii('-', '─━═╴╶╸╺');
ascii('|', '│┃║╵╷╹╻');
ascii('.', '╌┄┈╍┅┉░…');
ascii(':', '╎┆┊╏┇┋');
ascii('>', '▶►▷→⇒');
ascii('<', '◀◄◁←⇐');
ascii('^', '▲△↑');
ascii('v', '▼▽↓');
ascii('*', '●◆');
ascii('o', '◇○◯');
ascii('#', '█▉▊▋▌▍▎▏');
const toAscii = (line) =>
  line.replace(/[\u2026\u2190-\u21FF\u2500-\u25FF]/g, (ch) => ASCII[ch] ?? (ch >= '\u2500' && ch <= '\u257F' ? '+' : ch)); // 나머지 박스 문자는 모서리·교차

// 이미지 속 SVG는 앱이 아니라 OS 테마를 따르므로 배경과 글자색을 한 미디어 쿼리에서 함께 뒤집는다.
// 루트의 인라인 --bg/--fg는 스타일시트보다 강해 지우고, 웹 글꼴 @import는 외부 요청이라 지운다.
const THEME =
  'svg{--bg:#FFFFFF;--fg:#27272A}@media (prefers-color-scheme: dark){svg{--bg:#1F1F23;--fg:#E4E4E7}}' +
  "text{font-family:system-ui,-apple-system,'Segoe UI','Noto Sans KR',sans-serif}";
const SVG_MAX = 131072; // SvgProps.source 상한
const WIDTH_MAX = 4096; // SvgProps.width 상한(px)

// 이미지로만 쓰니 data-* 속성·CSS 주석·태그 사이 공백은 필요 없고, 좌표는 소수 둘째 자리면 충분하다.
const tidy = (svg) =>
  svg
    .replace(/^<svg([^>]*?) style="[^"]*"/, '<svg$1 style="background:var(--bg)"')
    .replace(/ data-[\w-]+="[^"]*"/g, '')
    .replace(/="([^"]*)"/g, (_, v) => `="${v.replace(/(\.\d\d)\d+/g, '$1')}"`)
    .replace(/<style>([\s\S]*?)<\/style>/, (_, css) => {
      const kept = css
        .replace(/\/\*[\s\S]*?\*\/|@import url\([^)]*\);|text \{ font-family:[^}]*\}/g, '')
        .replace(/\s+/g, ' ')
        .replace(/ ?([{};]) ?/g, '$1');
      return `<style>${kept.trim()}${THEME}</style>`;
    })
    .replace(/>\s+</g, '><');

// desktop은 Box를 stretch flex column으로 그려 너비 없는 이미지를 칸 폭까지 늘이므로 SVG 자신의 너비를 함께 준다.
// 높이는 주지 않는다: 칸보다 넓으면 max-width:100%로 줄고 높이는 비율을 따른다.
/** @returns {{ source: string, width: number } | null} */
const svg = (source) =>
  cached('svg:' + source, () => {
    const out = tidy(renderMermaidSVG(source, { transparent: false }));
    const width = Number(/^<svg[^>]* width="([\d.]+)"/.exec(out)?.[1]);
    return out.length <= SVG_MAX && width > 0 ? { source: out, width: Math.min(width, WIDTH_MAX) } : null;
  });

/** @returns {string | null} 펜스를 박스 문자로 바꾼 메시지, 바꾼 것이 없으면 null */
function terminalText(text, maxColumns, useAscii) {
  let changed = false;
  const out = segments(text)
    .map((s) => {
      if (s.kind === 'markdown') return s.text;
      const a = art(s.source);
      if (a === null || a.width > maxColumns) return s.fence; // 터미널 폭 초과: 줄바꿈으로 깨지느니 원문
      changed = true;
      return '```\n' + (useAscii ? a.plain.map(toAscii) : a.plain).join('\n') + '\n```';
    })
    .join('');
  return changed ? out : null;
}

/** @returns {({ markdown: string } | { svg: { source: string, width: number }, alt: string })[] | null} 그린 SVG가 없으면 null */
function desktopParts(text) {
  const parts = [];
  let pending = ''; // 연속한 markdown(실패한 펜스 포함)은 한 Markdown으로 합친다
  const flush = () => {
    if (pending.trim()) parts.push({ markdown: pending.replace(/^\n+|\s+$/g, '') }); // 첫 줄 들여쓰기는 남긴다
    pending = '';
  };
  for (const s of segments(text)) {
    const drawn = s.kind === 'diagram' ? svg(s.source) : null;
    if (drawn === null) {
      pending += s.kind === 'markdown' ? s.text : s.fence;
      continue;
    }
    flush();
    parts.push({ svg: drawn, alt: s.source });
  }
  flush();
  return parts.some((p) => p.svg) ? parts : null;
}

// ui.render는 스크롤·리사이즈마다 다시 불리므로 메시지 단위 결과도 기억한다.
// 스트리밍 중에는 접두사마다 새 키가 생기므로 최근 것만 남긴다.
const recent = new Map();
function remember(key, make) {
  let out = recent.get(key);
  if (out === undefined) {
    out = make();
    if (recent.size >= 64) recent.delete(recent.keys().next().value);
  } else recent.delete(key);
  recent.set(key, out);
  return out;
}

/** @type {import('claude-code').Register} */
export function register(on, options) {
  const useAscii = options?.useAscii === true;
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    const { text } = e.props;
    if (!text.includes('```mermaid')) return next(e);
    // resolve()는 터미널에서도 Svg 키를 주고 그리지 않으므로 표가 아니라 surface로 고른다.
    if (e.surface === 'terminal') {
      const maxColumns = (e.viewport?.columns ?? 80) - 4;
      const out = remember(`t${maxColumns}${useAscii ? 'a' : ''}\n${text}`, () => terminalText(text, maxColumns, useAscii));
      return out === null ? next(e) : next({ ...e, props: { ...e.props, text: out } });
    }
    const parts = remember('d\n' + text, () => desktopParts(text));
    if (parts === null) return next(e);
    const { Box, Markdown, Svg } = $.ui.resolve(e);
    const children = parts.map((p) => (p.svg ? Svg({ ...p.svg, alt: p.alt }) : Markdown({ text: p.markdown })));
    return Box({ flexDirection: 'column', gap: 1, children });
  });
}
