// mermaid 코드 펜스를 beautiful-mermaid ASCII 렌더러로 그린다.
// 터미널은 박스 문자 텍스트로, Svg 요소가 있는 화면(desktop 등)은 같은 격자를 SVG 이미지로.
// SVG 렌더러(renderMermaidSVG)는 elkjs(1.4MB)를 끌어와 hooks 모듈 상한 1MiB를 넘으므로 쓰지 않는다.
import { renderMermaidAscii } from '../node_modules/beautiful-mermaid/src/ascii/index.ts'; // exports 맵이 src를 막아 직접 경로

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

function cached(key, render) {
  if (!cache.has(key)) {
    let out;
    try {
      out = render();
    } catch {
      out = null; // 파싱 실패: 원문 유지
    }
    cache.set(key, out);
  }
  return cache.get(key);
}

// 라벨 안의 리터럴 \n은 렌더러가 줄바꿈으로 그리다 박스를 깨뜨리므로 공백으로 바꾼다.
// 렌더러는 .length로 폭을 재므로 2칸짜리 CJK 글자 뒤에 zero-width space를 넣어 폭을 맞추고, 그린 뒤 제거한다.
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/g;
const ZWSP = '\u200B';
const isWide = (ch) => ch.search(WIDE) === 0;
const displayWidth = (line) => line.length + (line.match(WIDE)?.length ?? 0);

const grid = (source, useAscii) =>
  cached('grid:' + useAscii + ':' + source, () =>
    renderMermaidAscii(source.replace(/\\n/g, ' ').replace(WIDE, '$&' + ZWSP), { colorMode: 'none', paddingY: 3, useAscii })
      .replaceAll(ZWSP, '')
      .replace(/[ \t]+$/gm, '') // 줄 끝 패딩 제거
      .trimEnd(),
  );

// 이미지 속 글꼴은 믿을 수 없으니 격자의 선·화살표는 벡터로 그리고, 글자만 <text>로 둔다.
const CELL = 9;
const LINE = 18;
const PAD = 8;
const STEP = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' };

// 선 글자 → 칸 가운데에서 이어지는 변과 선 종류. 둥근 모서리는 곡선으로 그린다.
const LINKS = {};
const lines = (style, glyphs, dirs, round = false) =>
  [...glyphs].forEach((g, i) => (LINKS[g] = { style, dirs: dirs.split(' ')[i], round }));
lines('line', '─│┌┐└┘├┤┬┴┼╴╵╶╷╟╢', 'EW NS ES SW NE NW NES NSW ESW NEW NESW W N E S NES NSW');
lines('line', '╭╮╰╯', 'ES SW NE NW', true);
lines('dash', '╌┄┆┊', 'EW EW NS NS');
lines('heavy', '━┃═║╔╗╚╝', 'EW NS EW NS ES SW NE NW');

// 화살촉 → 가리키는 방향, 속이 빈 모양인지
const ARROWS = {};
const arrows = (glyphs, dirs, hollow = false) =>
  [...glyphs].forEach((g, i) => (ARROWS[g] = { step: dirs.split(' ')[i].split(',').map(Number), hollow }));
arrows('►▶◄◀▲▼◥◤◢◣', '1,0 1,0 -1,0 -1,0 0,-1 0,1 1,-1 -1,-1 1,1 -1,1');
arrows('▷◁△▽', '1,0 -1,0 0,-1 0,1', true);

// 마름모·원 모서리와 상태 시작/끝 점 → 칸 가운데에 그리는 작은 도형
const diamond = (x, y) => `M${x - 4} ${y}L${x} ${y - 4}L${x + 4} ${y}L${x} ${y + 4}Z`;
const circle = (x, y, r, cls) => `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}"/>`;
const MARKS = {
  '◇': (x, y) => `<path class="hollow" d="${diamond(x, y)}"/>`,
  '◆': (x, y) => `<path class="solid" d="${diamond(x, y)}"/>`,
  '◯': (x, y) => circle(x, y, 3.5, 'hollow'),
  '●': (x, y) => circle(x, y, 4, 'solid'),
  '◎': (x, y) => circle(x, y, 5, 'hollow') + circle(x, y, 2.5, 'solid'),
  '◉': (x, y) => circle(x, y, 5, 'hollow') + circle(x, y, 3, 'solid'),
};

// 글자색·선색·배경을 한 미디어 쿼리에서 함께 뒤집어, 화면 테마가 OS와 달라도 대비가 남는다.
const STYLE =
  '<style>.bg,.hollow{fill:#FAFAFA}.ln,.hollow{stroke:#52525B;stroke-width:1.1}.solid{fill:#52525B}' +
  '.ln{fill:none;stroke-linecap:square}.dash{stroke-linecap:butt;stroke-dasharray:3 3}.heavy{stroke-width:2.4}' +
  'text{font:15px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:#27272A;text-anchor:middle;dominant-baseline:central}' +
  '@media (prefers-color-scheme: dark){.bg,.hollow{fill:#1F1F23}.ln,.hollow{stroke:#A1A1AA}.solid{fill:#A1A1AA}text{fill:#E4E4E7}}</style>';
const SVG_MAX = 131072; // SvgProps.source 상한
const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/** @returns {{ col: number, row: number, ch: string, w: number }[]} */
function cells(text) {
  const out = [];
  text.split('\n').forEach((line, row) => {
    let col = 0;
    for (const ch of line) {
      const w = isWide(ch) ? 2 : 1;
      if (ch !== ' ') out.push({ col, row, ch, w });
      col += w;
    }
  });
  return out;
}

function gridSvg(text) {
  const all = cells(text);
  const at = new Map(all.map((c) => [c.col + ',' + c.row, c.ch]));
  const glyph = (col, row) => at.get(col + ',' + row) ?? '';
  const links = (ch) => LINKS[ch]?.dirs ?? (ARROWS[ch] || MARKS[ch] ? 'NESW' : '');
  const centre = (col, row) => [col * CELL + CELL / 2, row * LINE + LINE / 2];
  const neighbour = ({ col, row }, d) => ({ col: col + STEP[d][0], row: row + STEP[d][1] });
  // 이웃도 선일 때만 반 칸을 긋는다: 라벨이나 빈칸 쪽으로 튀어나온 토막이 없다.
  const joined = (c, d) => links(glyph(neighbour(c, d).col, neighbour(c, d).row)) !== '';

  const halves = new Map(); // "style h|v 줄" → 반 칸 번호들
  const extra = { line: '', dash: '', heavy: '' }; // 둥근 모서리·화살대
  const half = (style, { col, row }, d) => {
    const [key, i] = d === 'E' || d === 'W' ? ['h' + row, 2 * col + (d === 'E')] : ['v' + col, 2 * row + (d === 'S')];
    (halves.get(style + ' ' + key) ?? halves.set(style + ' ' + key, []).get(style + ' ' + key)).push(i);
  };
  const shapes = [];
  const texts = [];
  let run = null;
  const endRun = () => {
    if (run) texts.push(`<text x="${((run.start + run.end) * CELL) / 2}" y="${run.row * LINE + LINE / 2}">${run.text}</text>`);
    run = null;
  };

  for (const c of all) {
    const link = LINKS[c.ch] ?? (links(c.ch) && { style: 'line', dirs: 'NESW' });
    if (!link) {
      // 빈칸 하나는 라벨 안의 띄어쓰기로 보고 같은 run에 잇는다
      if (run && run.row === c.row && c.col - run.end <= 1) run.text += ' '.repeat(c.col - run.end) + (ESCAPE[c.ch] ?? c.ch);
      else (endRun(), (run = { row: c.row, start: c.col, text: ESCAPE[c.ch] ?? c.ch }));
      run.end = c.col + c.w;
      continue;
    }
    endRun();
    const dirs = [...link.dirs].filter((d) => joined(c, d));
    const [x, y] = centre(c.col, c.row);
    if (link.round && dirs.length === 2) {
      const [a, b] = dirs.map((d) => [x + (STEP[d][0] * CELL) / 2, y + (STEP[d][1] * LINE) / 2]);
      extra[link.style] += `M${a[0]} ${a[1]}Q${x} ${y} ${b[0]} ${b[1]}`;
    } else {
      for (const d of dirs) {
        half(link.style, c, d);
        // 수명선 │ 옆에서 끝나는 ─처럼 이웃이 마주 잇지 않으면 이웃 칸 가운데까지 마저 긋는다
        const n = neighbour(c, d);
        if (!links(glyph(n.col, n.row)).includes(OPPOSITE[d])) half(link.style, n, OPPOSITE[d]);
      }
    }
    const arrow = ARROWS[c.ch];
    if (arrow) {
      // 앞 칸에 무엇이 있으면 촉 끝을 그 칸 가운데(상자 테두리)까지, 없으면 제 칸 가운데(수명선)에 둔다.
      const [dx, dy] = arrow.step;
      const [tx, ty] = glyph(c.col + dx, c.row + dy) ? centre(c.col + dx, c.row + dy) : [x, y];
      const len = Math.hypot(dx * CELL, dy * LINE);
      const [ux, uy] = [(dx * CELL) / len, (dy * LINE) / len];
      const [bx, by] = [tx - ux * 9, ty - uy * 9];
      if ((bx - x) * ux + (by - y) * uy > 0) extra.line += `M${x} ${y}L${bx} ${by}`;
      shapes.push(`<path class="${arrow.hollow ? 'hollow' : 'solid'}" d="M${tx} ${ty}L${bx - uy * 4} ${by + ux * 4}L${bx + uy * 4} ${by - ux * 4}Z"/>`);
    }
    if (MARKS[c.ch]) shapes.push(MARKS[c.ch](x, y));
  }
  endRun();

  const d = { ...extra };
  for (const [key, idx] of halves) {
    const [style, line] = key.split(' ');
    const n = Number(line.slice(1));
    const sorted = [...new Set(idx)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (sorted[j + 1] === sorted[j] + 1) j++;
      const [from, to] = [sorted[i], sorted[j] + 1];
      d[style] +=
        line[0] === 'h'
          ? `M${(from * CELL) / 2} ${n * LINE + LINE / 2}H${(to * CELL) / 2}`
          : `M${n * CELL + CELL / 2} ${(from * LINE) / 2}V${(to * LINE) / 2}`;
      i = j + 1;
    }
  }
  const paths = Object.entries(d)
    .filter(([, v]) => v)
    .map(([style, v]) => `<path class="ln ${style}" d="${v}"/>`);

  const columns = Math.max(0, ...all.map((c) => c.col + c.w));
  const rows = text.split('\n').length;
  const [w, h] = [columns * CELL + 2 * PAD, rows * LINE + 2 * PAD];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${STYLE}` +
    `<rect class="bg" width="${w}" height="${h}" rx="6"/><g transform="translate(${PAD} ${PAD + 0.5})">` +
    paths.join('') + shapes.join('') + texts.join('') + '</g></svg>'
  );
}

// useAscii는 터미널 글꼴 폭 문제용이라 칸 위치를 박는 SVG에는 쓰지 않는다.
const svg = (source) =>
  cached('svg:' + source, () => {
    const text = grid(source, false);
    const out = text === null ? null : gridSvg(text);
    return out !== null && out.length <= SVG_MAX ? out : null;
  });

function drawText(segs, { e, next, useAscii }) {
  const maxColumns = (e.viewport?.columns ?? 80) - 4;
  let changed = false;
  const text = segs
    .map((s) => {
      if (s.kind === 'markdown') return s.text;
      const out = grid(s.source, useAscii);
      if (out === null || out.split('\n').some((l) => displayWidth(l) > maxColumns)) return s.fence; // 터미널 폭 초과: 줄바꿈으로 깨지느니 원문
      changed = true;
      return '```\n' + out + '\n```';
    })
    .join('');
  return changed ? next({ ...e, props: { ...e.props, text } }) : next(e);
}

function drawSvg(segs, { e, next, elements: { Box, Markdown, Svg } }) {
  const children = [];
  let drewSvg = false;
  let pending = ''; // 연속한 markdown(실패한 펜스 포함)은 한 Markdown으로 합친다
  const flush = () => {
    if (pending.trim()) children.push(Markdown({ text: pending.replace(/^\n+|\s+$/g, '') })); // 첫 줄 들여쓰기는 남긴다
    pending = '';
  };
  for (const s of segs) {
    const source = s.kind === 'diagram' ? svg(s.source) : null;
    if (source === null) {
      pending += s.kind === 'markdown' ? s.text : s.fence;
      continue;
    }
    flush();
    children.push(Svg({ source, alt: s.source }));
    drewSvg = true;
  }
  flush();
  return drewSvg ? Box({ flexDirection: 'column', gap: 1, children }) : next(e);
}

/** @type {import('claude-code').Register} */
export function register(on, options) {
  const useAscii = options?.useAscii === true;
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    const { text } = e.props;
    if (!text.includes('```mermaid')) return next(e);
    // resolve()는 터미널에서도 Svg 키를 주고 그리지 않으므로 표가 아니라 surface로 고른다.
    const draw = e.surface === 'terminal' ? drawText : drawSvg;
    return draw(segments(text), { e, next, useAscii, elements: $.ui.resolve(e) });
  });
}
