import assert from 'node:assert/strict';
import { register } from '../hooks/hooks.js';

let hook;
register((event, matcher, fn) => { assert.equal(event, 'ui.render'); assert.equal(matcher.component, 'AssistantMessage'); hook = fn; }, {});

const next = (e) => e;
const run = (text, columns = 120) => hook({}, { surface: 'terminal', component: 'AssistantMessage', requestId: 'm1', viewport: { columns, rows: 40 }, props: { text, isFirstOfReply: true } }, next).props.text;

const md = 'before\n```mermaid\nflowchart LR\n  A[hooks] --> B{mermaid?}\n```\nafter';
const out = run(md);
assert.ok(out.includes('┌') && out.includes('hooks'), 'renders box drawing');
assert.ok(!out.includes('```mermaid'), 'fence replaced');
assert.ok(out.startsWith('before\n```\n') && out.endsWith('\n```\nafter'), 'surrounding text kept');

assert.equal(run(md, 20), md, 'too wide for viewport: original kept');
assert.equal(run('```mermaid\nnot a diagram %%%\n```'), '```mermaid\nnot a diagram %%%\n```', 'parse failure: original kept');
assert.equal(run('plain text'), 'plain text', 'no fence: untouched');
assert.equal(run('```mermaid\nflowchart LR\n A-->B'), '```mermaid\nflowchart LR\n A-->B', 'unclosed fence (streaming): untouched');
const ko = run('```mermaid\nflowchart LR\n  A[사용자] --> B[서버]\n```').split('\n');
const width = (l) => l.length + (l.match(/[\uAC00-\uD7A3]/g)?.length ?? 0); // 한글은 2칸
const mid = ko.find((l) => l.includes('사용자'));
assert.ok(!mid.includes('\u200B'), 'zwsp stripped');
assert.equal(width(ko[1]), width(mid), 'korean label: border row and label row have equal display width');
assert.equal(run('```mermaid\nflowchart LR\n  A[사용자] --> B[서버]\n```', 16), '```mermaid\nflowchart LR\n  A[사용자] --> B[서버]\n```', 'width guard counts CJK as 2 cells');
assert.ok(!run('```mermaid\nsequenceDiagram\n  A->>B: x\\ny\n```').split('\n').some((l) => /^[^│]*y/.test(l)), 'literal \\n in label does not break out of the box');
register((_, __, fn) => (hook = fn), { useAscii: true });
assert.ok(run(md).includes('+--'), 'useAscii option renders plain ASCII');
console.log('ok');
