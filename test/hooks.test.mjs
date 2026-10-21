import assert from 'node:assert/strict';
import { register } from '../hooks/hooks.js';

let hook;
register((event, matcher, fn) => { assert.equal(event, 'ui.render'); assert.equal(matcher.component, 'AssistantMessage'); hook = fn; }, {});

const el = (type) => (props) => ({ type, props });
// 실제 엔진처럼 terminal에도 Svg가 있는 표를 준다: 렌더러는 표가 아니라 surface로 골라야 한다.
const ELEMENTS = { Box: el('Box'), Text: el('Text'), Markdown: el('Markdown'), Svg: el('Svg') };
const $ = { ui: { resolve: () => ELEMENTS } };
const next = (e) => e;
const draw = (surface, text, columns = 120) => hook($, { surface, component: 'AssistantMessage', requestId: 'm1', viewport: { columns, rows: 40 }, props: { text, isFirstOfReply: true } }, next);
const run = (text, columns) => draw('terminal', text, columns).props.text;

const md = 'before\n```mermaid\nflowchart LR\n  A[hooks] --> B{mermaid?}\n```\nafter';
const out = run(md);
assert.ok(out.includes('┌') && out.includes('hooks'), 'renders box drawing');
assert.ok(!out.includes('```mermaid'), 'fence replaced');
assert.ok(out.startsWith('before\n```\n') && out.endsWith('\n```\nafter'), 'surrounding text kept');

assert.equal(run(md, 20), md, 'too wide for viewport: original kept');
assert.equal(run('```mermaid\nnot a diagram %%%\n```'), '```mermaid\nnot a diagram %%%\n```', 'parse failure: original kept');
assert.equal(run('plain text'), 'plain text', 'no fence: untouched');
assert.equal(run('```mermaid\nflowchart LR\n A-->B'), '```mermaid\nflowchart LR\n A-->B', 'unclosed fence (streaming): untouched');
const width = (l) => [...l].reduce((n, ch) => n + (/[\uAC00-\uD7A3]/.test(ch) ? 2 : 1), 0); // 한글은 2칸
const box = (text) => text.split('\n').filter((l) => /[│┌└]/.test(l));
const ko = box(run('```mermaid\nflowchart LR\n  A[사용자] --> B[서버]\n```'));
assert.equal(ko.length, 3, 'korean flowchart: three box rows');
assert.ok(ko.every((l) => width(l) === width(ko[0])), 'korean label: every row of the boxes has the same display width');
assert.equal(run('```mermaid\nflowchart LR\n  A[사용자] --> B[서버]\n```', 16), '```mermaid\nflowchart LR\n  A[사용자] --> B[서버]\n```', 'width guard counts CJK as 2 cells');
const lr = run('```mermaid\nflowchart LR\n  A[사용자 응답] --> B{mermaid 펜스?}\n  B -->|예| C[다이어그램으로 그림]\n  B -->|아니오| D[원문 유지]\n```');
assert.ok(/펜스\? ╟/.test(lr), 'decision border touches the outgoing edge');
assert.ok(!/[│║] +[├┤╟╢]/.test(lr), 'no gap between a box and its edge junction');
assert.ok(!run('```mermaid\nsequenceDiagram\n  A->>B: x\\ny\n```').split('\n').some((l) => /^[^│]*y/.test(l)), 'literal \\n in label does not break out of the box');
register((_, __, fn) => (hook = fn), { useAscii: true });
assert.ok(run(md).includes('+--'), 'useAscii option renders plain ASCII');
assert.ok([...run(md)].every((ch) => ch < '\u0080'), 'useAscii: no non-ASCII glyph left');

register((_, __, fn) => (hook = fn), {});
const tree = draw('desktop', md);
assert.equal(tree.type, 'Box', 'desktop: own tree');
assert.equal(tree.props.flexDirection, 'column');
assert.deepEqual(tree.props.children.map((c) => c.type), ['Markdown', 'Svg', 'Markdown'], 'desktop: markdown / svg / markdown');
assert.deepEqual([tree.props.children[0].props.text, tree.props.children[2].props.text], ['before', 'after'], 'desktop: surrounding text kept');
const { source, alt } = tree.props.children[1].props;
assert.ok(source.startsWith('<svg'), 'svg source');
assert.ok(/<text[^>]*>hooks<\/text>/.test(source), 'svg: label is text');
assert.ok(!/^<svg[^>]*--(bg|fg):/.test(source), 'svg: no inline colour on the root, so the stylesheet decides');
assert.ok(/@media \(prefers-color-scheme: dark\)\{svg\{--bg:[^;]+;--fg:/.test(source), 'background and text flip in one media query');
assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(source), 'no external fetch');
assert.ok(!source.includes('fonts.googleapis') && !source.includes('@import'), 'no web font');
assert.ok(!/ data-[\w-]+=/.test(source) && !/="[^"]*\d\.\d{3}/.test(source), 'svg: no data attributes, coordinates rounded');
const flow = draw('desktop', '```mermaid\nflowchart LR\n  A[사용자 응답] --> B{mermaid 펜스?}\n  B -->|예| C[다이어그램으로 그림]\n  B -->|아니오| D[원문 유지]\n```').props.children[0].props.source;
for (const label of ['사용자 응답', 'mermaid 펜스?', '다이어그램으로 그림', '원문 유지', '예', '아니오']) assert.ok(flow.includes('>' + label + '<'), `svg: label ${label}`);
const td = draw('desktop', '```mermaid\nflowchart TD\n  S[시작] --> A\n  subgraph P[처리 단계]\n    A[입력] --> B[변환]\n  end\n  B --> F[완료]\n```').props.children[0].props.source;
assert.ok(td.includes('>처리 단계<'), 'svg: subgraph header');
for (const kind of ['sequenceDiagram\n  A->>B: 안녕', 'stateDiagram-v2\n  [*] --> 대기\n  대기 --> [*]', 'classDiagram\n  동물 <|-- 개', 'erDiagram\n  사용자 ||--o{ 주문 : 만든다'])
  assert.equal(draw('desktop', '```mermaid\n' + kind + '\n```').props.children?.[0]?.type, 'Svg', 'svg: ' + kind.split('\n')[0]);
const koSvg = draw('desktop', '```mermaid\nflowchart LR\n  A[사용자 & <b>] --> B[서버]\n```').props.children[0].props.source;
assert.ok(koSvg.includes('&amp;') && !koSvg.includes('<b>'), 'svg escapes markup in labels');
assert.ok(alt.includes('A[hooks]'), 'alt is the mermaid source');
assert.equal(draw('desktop', md, 20).type, 'Box', 'desktop: no width guard');

const bad = '```mermaid\nnot a diagram %%%\n```';
assert.equal(draw('desktop', bad).props.text, bad, 'desktop parse failure, only diagram: passes through next');
const mixed = draw('desktop', 'intro\n' + bad + '\nmid\n```mermaid\nflowchart LR\n A-->B\n```');
assert.deepEqual(mixed.props.children.map((c) => c.type), ['Markdown', 'Svg'], 'desktop parse failure: fence merged into neighbouring markdown');
assert.equal(mixed.props.children[0].props.text, 'intro\n' + bad + '\nmid', 'desktop parse failure: fence kept');
assert.equal(draw('desktop', 'plain text').props.text, 'plain text', 'desktop no fence: untouched');
assert.equal(draw('desktop', '```mermaid\nflowchart LR\n A-->B').props.text, '```mermaid\nflowchart LR\n A-->B', 'desktop unclosed fence: untouched');
console.log('ok');
