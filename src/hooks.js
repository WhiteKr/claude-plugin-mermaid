// mermaid 코드 펜스를 유니코드 박스 다이어그램으로 바꿔 그린다.
// beautiful-mermaid의 ASCII 렌더러만 번들한다 (SVG 경로의 elkjs는 제외).
import { renderMermaidAscii } from '../node_modules/beautiful-mermaid/src/ascii/index.ts'; // exports 맵이 src를 막아 직접 경로

const FENCE = /```mermaid[^\n]*\n([\s\S]*?)\n[ \t]*```/g;
const cache = new Map(); // ponytail: 세션 내 무제한 캐시, 메시지 수만큼만 자람
// 라벨 안의 리터럴 \n은 렌더러가 줄바꿈으로 그리다 박스를 깨뜨리므로 공백으로 바꾼다.
// 렌더러는 .length로 폭을 재므로 2칸짜리 CJK 글자 뒤에 zero-width space를 넣어 폭을 맞추고, 그린 뒤 제거한다.
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/g;
const ZWSP = '\u200B';
const displayWidth = (line) => line.length + (line.match(WIDE)?.length ?? 0);

function render(src, maxColumns, useAscii) {
  const key = useAscii + src;
  let out = cache.get(key);
  if (out === undefined) {
    try {
      out = renderMermaidAscii(src.replace(/\\n/g, ' ').replace(WIDE, '$&' + ZWSP), { colorMode: 'none', paddingY: 3, useAscii })
        .replaceAll(ZWSP, '')
        .replace(/[ \t]+$/gm, '') // 줄 끝 패딩 제거
        .trimEnd();
    } catch {
      out = null; // 파싱 실패: 원문 유지
    }
    cache.set(key, out);
  }
  if (out === null) return null;
  if (out.split('\n').some((l) => displayWidth(l) > maxColumns)) return null; // 터미널 폭 초과: 줄바꿈으로 깨지느니 원문
  return out;
}

/** @type {import('claude-code').Register} */
export function register(on, options) {
  const useAscii = options?.useAscii === true;
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    const { text } = e.props;
    if (!text.includes('```mermaid')) return next(e);
    const maxColumns = (e.viewport?.columns ?? 80) - 4;
    const rewritten = text.replace(FENCE, (fence, src) => {
      const out = render(src, maxColumns, useAscii);
      return out === null ? fence : '```\n' + out + '\n```';
    });
    return rewritten === text ? next(e) : next({ ...e, props: { ...e.props, text: rewritten } });
  });
}
