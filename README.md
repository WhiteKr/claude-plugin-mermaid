# mermaid

Claude 응답의 ```` ```mermaid ```` 코드 블록을 다이어그램으로 바꿔 그리는 function-hook 플러그인. 터미널에서는 유니코드 박스 텍스트로, desktop·VS Code·모바일에서는 같은 다이어그램을 SVG 이미지로 그린다. `/show-me` 같은 스킬이 내는 mermaid 코드가 대상이다.

## 설치

```
/plugin marketplace add WhiteKr/whitekr-claude-plugins
/plugin install mermaid@whitekr-claude-plugins
```

개발 중에는 `claude --plugin-dir <이 폴더>` 로 로드한다.

## 동작

- `ui.render` 의 `AssistantMessage` 를 훅해 닫힌 ```` ```mermaid ```` 펜스를 다이어그램으로 바꾼다. 저장된 메시지(ctrl+o)는 바뀌지 않고 화면만 바뀐다.
- `e.surface` 로 그리는 방식을 고른다(엔진의 `$.ui.resolve()` 는 터미널에도 `Svg` 키를 주므로 요소 표로는 고를 수 없다).
  - 터미널: [lovely-mermaid](https://github.com/xl0/lovely-mermaid) 로 펜스를 박스 문자 코드 블록으로 치환한다. 선이 상자에 바로 붙고, 한글 폭을 유니코드 폭 표로 재서 상자가 어긋나지 않으며, 가장 촘촘하게 그린다.
  - desktop·VS Code·모바일: 메시지를 `Markdown` 과 `Svg` 로 나눠 그린다. SVG는 [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) ASCII 렌더러가 그린 박스 문자 격자에서 선·모서리·화살촉을 벡터 선과 도형으로 다시 그리고, 라벨만 글자로 남겨 상자 가운데에 맞춘다. 그래서 글꼴과 상관없이 선이 끊기지 않고 한글 라벨도 벌어지지 않는다. 폭이 넘치면 칸에 맞게 줄어든다. SVG는 자기 배경을 가지며, 배경·선·글자색을 `prefers-color-scheme` 하나로 함께 바꾼다. 이미지 속 SVG는 화면이 아니라 OS 테마를 따르므로, 화면 테마가 OS와 달라도 글자가 배경에 묻히지 않게 하려는 것이다.
- 원문을 유지하는 경우: 파싱 실패, 다이어그램 폭이 터미널 폭을 넘김(터미널만), 펜스가 아직 안 닫힘(스트리밍 중).
- 터미널 지원 다이어그램: flowchart, state, sequence, class, ER, pie, mindmap, timeline, gitGraph.

## 옵션

`/config` 의 plugin 항목 또는 settings `pluginConfigs.mermaid.options`:

- `useAscii` (boolean, 기본 false): 터미널에서 박스 문자 대신 순수 ASCII(`+-|>`)로 그린다. 터미널·폰트가 `─│▶` 같은 ambiguous-width 글자를 2칸으로 그려 줄이 어긋날 때 켠다. lovely-mermaid에는 ASCII 모드가 없어 그린 결과의 글자를 하나씩 바꾼다(선 `-|`, 점선 `.:`, 모서리 `+`, 화살촉 `><^v`).

## 알려진 한계

- 터미널: lovely-mermaid가 좁은 자리에 놓인 전이 라벨을 자른다(state의 `재시도` 가 `재시` 로 보임).
- 터미널: xychart는 lovely-mermaid가 그리지 않아 원문으로 남는다.

## 개발

`hooks/hooks.js` 는 `src/hooks.js` + lovely-mermaid + beautiful-mermaid ASCII 경로를 esbuild 로 묶은 산출물이며 커밋 대상이다(마켓플레이스 설치는 빌드 없이 그대로 쓴다). 번들은 약 245KB다.

beautiful-mermaid 자체 SVG 렌더러(`renderMermaidSVG`)는 쓰지 않는다. 레이아웃 엔진 elkjs 때문에 번들이 1.8MB가 되고, Claude Code는 1MiB(1048576 bytes)를 넘는 hooks 모듈을 읽지 않는다(`is over 1048576 bytes and was not read`). 그래서 desktop에서도 ASCII 격자를 SVG로 옮겨 그린다.

```
npm i
npm test           # build + test/hooks.test.mjs
npm run test:engine # claude plugin test: 실제 엔진에서 desktop·terminal 트리 확인
```
