// beautiful-mermaid의 elk-instance.ts를 대신한다(build.mjs가 바꿔 끼움). elkjs는 1.4MB라 hooks 모듈 상한 1MiB를 넘는다.
// ELK JSON 그래프를 받아 dagre로 배치하고, ELK가 채우는 x·y·width·height·sections·labels만 같은 모양으로 돌려준다.
// 그래서 beautiful-mermaid의 노드 크기 계산, 층 정렬, 간선 묶기, 도형 클리핑을 그대로 쓴다.
// 서브그래프별 방향(direction)은 dagre가 그래프 하나에 rankdir 하나만 받으므로 무시된다.
import { graphlib, layout } from '@dagrejs/dagre';

const RANKDIR = { DOWN: 'TB', UP: 'BT', RIGHT: 'LR', LEFT: 'RL' };
const HEADER = 28; // 그룹 머리글 높이(renderer.ts와 같음)

const padding = (n) => {
  const p = n.layoutOptions?.['elk.padding'] ?? '';
  const side = (s) => Number(new RegExp(s + '=(\\d+)').exec(p)?.[1] ?? 0);
  return { top: side('top'), left: side('left'), bottom: side('bottom'), right: side('right') };
};

const inside = (p, r) => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;

// a(밖)→b(안) 선분이 사각형 r의 변과 만나는 점
function enter(a, b, r) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2;
    if (inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, r)) hi = t;
    else lo = t;
  }
  return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi };
}

// 서브그래프로 들어가는 간선은 안쪽 첫 노드로 배치했으니 서브그래프 테두리에서 자른다.
function clipToBox(points, box) {
  const i = points.findIndex((p) => inside(p, box));
  return i > 0 ? [...points.slice(0, i), enter(points[i - 1], points[i], box)] : points;
}

// dagre 간선은 층 사이를 사선으로 잇는다. ELK처럼 직각으로 꺾어, 층 방향 축의 가운데에서 옆으로 옮긴다.
function orthogonal(points, vertical) {
  const out = [points[0]];
  for (const b of points.slice(1)) {
    const a = out[out.length - 1];
    if (Math.abs(a.x - b.x) > 1 && Math.abs(a.y - b.y) > 1) {
      if (vertical) out.push({ x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 });
      else out.push({ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y });
    }
    out.push(b);
  }
  return out;
}

// 노드 상자에서 간선이 나가는 점: 층 방향 축의 변 위, 다음 꺾임점과 줄을 맞춰 가능하면 곧게 뻗는다.
// 한 노드의 간선들이 한 점에 겹치지 않고, 마름모는 beautiful-mermaid 클리핑이 변까지 당긴다.
function port(box, toward, vertical) {
  const along = (lo, size, v) => Math.min(Math.max(v, lo + Math.min(12, size / 2)), lo + size - Math.min(12, size / 2));
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  if (vertical) return { x: along(box.x, box.width, toward.x), y: toward.y > cy ? box.y + box.height : box.y };
  return { x: toward.x > cx ? box.x + box.width : box.x, y: along(box.y, box.height, toward.y) };
}

/** @param {import('elkjs').ElkNode} root */
export function elkLayoutSync(root) {
  const rankdir = RANKDIR[root.layoutOptions?.['elk.direction']] ?? 'TB';
  const vertical = rankdir === 'TB' || rankdir === 'BT';
  const pad = padding(root);
  const g = new graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({
    rankdir,
    nodesep: Number(root.layoutOptions?.['elk.spacing.nodeNode'] ?? 28),
    ranksep: Number(root.layoutOptions?.['elk.layered.spacing.nodeNodeBetweenLayers'] ?? 48),
    edgesep: 12,
    marginx: pad.left,
    marginy: pad.top,
  });

  const elkNodes = new Map();
  const edges = []; // [edge, 담긴 노드]
  const walk = (n) => {
    for (const c of n.children ?? []) {
      elkNodes.set(c.id, c);
      g.setNode(c.id, c.children?.length ? {} : { width: c.width, height: c.height });
      if (n !== root) g.setParent(c.id, n.id);
      walk(c);
    }
    for (const e of n.edges ?? []) edges.push([e, n]);
  };
  walk(root);

  // 서브그래프 방향이 있으면 ELK 입력은 hierarchical port를 쓴다. port를 안쪽 노드로 되돌려 간선 하나로 배치한다.
  const portNode = new Map();
  for (const [e] of edges)
    if (e.id.endsWith('_internal')) {
      const [s, t] = [e.sources[0], e.targets[0]];
      if (/_(in|out)_\d+$/.test(s)) portNode.set(s, t);
      else portNode.set(t, s);
    }
  // dagre는 서브그래프(compound)에 간선을 못 붙이므로 안쪽 첫 잎 노드로 배치한다.
  const leaf = (id) => {
    const kids = g.children(id);
    return kids.length ? leaf(kids[0]) : id;
  };
  const end = (id) => leaf(portNode.get(id) ?? id);

  const laid = edges.filter(([e]) => !e.id.endsWith('_internal'));
  for (const [e] of laid) {
    const label = e.labels?.[0];
    // inline이 아닌 라벨(class)은 렌더러가 배경 없이 그리므로 선 위가 아니라 옆에 둔다.
    const labelpos = label?.layoutOptions?.['elk.edgeLabels.inline'] === 'true' ? 'c' : 'r';
    g.setEdge(end(e.sources[0]), end(e.targets[0]), { width: label?.width ?? 0, height: label?.height ?? 0, labelpos }, e.id);
  }

  layout(g);

  const rects = new Map(g.nodes().map((v) => {
    const n = g.node(v);
    return [v, { x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height, group: g.children(v).length > 0 }];
  }));
  const routes = new Map(laid.map(([e]) => {
    const d = g.edge(end(e.sources[0]), end(e.targets[0]), e.id);
    return [e, { points: d.points.map((p) => ({ ...p })), label: { x: d.x, y: d.y } }];
  }));

  // at 선부터 아래(또는 오른쪽)로 d만큼 띠를 끼워 넣는다. 걸친 서브그래프는 늘어나고 나머지는 밀린다.
  const insert = (axis, at, d) => {
    const size = axis === 'x' ? 'width' : 'height';
    for (const r of rects.values()) {
      if (r[axis] >= at || (!r.group && r[axis] + r[size] / 2 >= at)) r[axis] += d;
      else if (r.group && r[axis] + r[size] > at) r[size] += d;
    }
    for (const { points, label } of routes.values()) for (const p of [...points, label]) if (p[axis] >= at) p[axis] += d;
  };

  // dagre의 서브그래프 상자는 머리글 자리가 없고 자식에 가깝게 붙는다. ELK padding만큼 띠를 끼워 넓힌다. 안쪽부터.
  const fit = (id) => {
    const kids = g.children(id);
    kids.forEach(fit);
    if (!kids.length) return;
    const p = padding(elkNodes.get(id));
    const r = rects.get(id);
    const k = () => {
      const ks = kids.map((c) => rects.get(c));
      return { x: Math.min(...ks.map((b) => b.x)), y: Math.min(...ks.map((b) => b.y)), right: Math.max(...ks.map((b) => b.x + b.width)), bottom: Math.max(...ks.map((b) => b.y + b.height)) };
    };
    const top = Math.max(p.top, HEADER + 8) - (k().y - r.y);
    if (top > 0) insert('y', r.y + 0.5, top);
    const left = p.left - (k().x - r.x);
    if (left > 0) insert('x', r.x + 0.5, left);
    const bottom = k().bottom + p.bottom - (r.y + r.height);
    if (bottom > 0) insert('y', r.y + r.height - 0.5, bottom);
    const right = k().right + p.right - (r.x + r.width);
    if (right > 0) insert('x', r.x + r.width - 0.5, right);
  };
  for (const id of g.children()) fit(id);

  const origin = new Map([[root, { x: 0, y: 0 }]]);
  const place = (n, at) => {
    for (const c of n.children ?? []) {
      const b = rects.get(c.id);
      Object.assign(c, { x: b.x - at.x, y: b.y - at.y, width: b.width, height: b.height });
      origin.set(c, b);
      place(c, b);
    }
  };
  place(root, { x: 0, y: 0 });

  for (const [e, container] of laid) {
    const src = end(e.sources[0]);
    const tgt = end(e.targets[0]);
    const { points: raw, label: centre } = routes.get(e);
    const mid = raw.slice(1, -1);
    const [from, to] = [rects.get(src), rects.get(tgt)];
    const middle = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    let points =
      src === tgt
        ? raw
        : orthogonal([port(from, mid[0] ?? middle(to), vertical), ...mid, port(to, mid.at(-1) ?? middle(from), vertical)], vertical);
    const sourceGroup = !portNode.has(e.sources[0]) && e.sources[0] !== src && rects.get(e.sources[0]);
    const targetGroup = !portNode.has(e.targets[0]) && e.targets[0] !== tgt && rects.get(e.targets[0]);
    if (targetGroup) points = clipToBox(points, targetGroup);
    if (sourceGroup) points = clipToBox(points.reverse(), sourceGroup).reverse();
    const at = origin.get(container);
    e.sections = [
      {
        startPoint: { x: points[0].x - at.x, y: points[0].y - at.y },
        endPoint: { x: points.at(-1).x - at.x, y: points.at(-1).y - at.y },
        bendPoints: points.slice(1, -1).map((p) => ({ x: p.x - at.x, y: p.y - at.y })),
      },
    ];
    const label = e.labels?.[0];
    if (label) Object.assign(label, { x: centre.x - label.width / 2 - at.x, y: centre.y - label.height / 2 - at.y });
  }

  const all = [...rects.values()];
  root.width = Math.max(...all.map((b) => b.x + b.width)) + pad.right;
  root.height = Math.max(...all.map((b) => b.y + b.height)) + pad.bottom;
  return root;
}
