import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// beautiful-mermaid 레이아웃이 부르는 elk-instance.ts를 dagre 구현으로 바꿔 끼운다. esbuild CLI는 플러그인을 못 받는다.
const elkToDagre = {
  name: 'elk-to-dagre',
  setup: (b) => b.onResolve({ filter: /\/elk-instance\.ts$/ }, () => ({ path: new URL('src/elk-dagre.js', import.meta.url).pathname })),
};

// lovely-mermaid는 모듈을 읽을 때 Intl.Segmenter를 만든다(약 30ms). hooks 모듈은 세션마다 읽히므로 처음 쓸 때 만든다.
const SEGMENTER = "const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });";
const lazySegmenter = {
  name: 'lazy-segmenter',
  setup: (b) =>
    b.onLoad({ filter: /lovely-mermaid\/dist\/width\.js$/ }, async ({ path }) => {
      const src = await readFile(path, 'utf8');
      if (!src.includes(SEGMENTER)) throw new Error('lovely-mermaid width.js changed: update lazySegmenter in build.mjs');
      const contents = src
        .replace(SEGMENTER, 'let segmenter;')
        .replaceAll('segmenter.segment(', "(segmenter ??= new Intl.Segmenter('en', { granularity: 'grapheme' })).segment(");
      return { contents, loader: 'js' };
    }),
};

await build({
  entryPoints: ['src/hooks.js'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  minify: true, // 이름까지 줄여 약 70KB 작다. export 이름(register)은 그대로 남는다.
  outfile: 'hooks/hooks.js',
  plugins: [elkToDagre, lazySegmenter],
  logLevel: 'info',
});
