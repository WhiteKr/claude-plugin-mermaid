# mermaid

Claude 응답의 ```` ```mermaid ```` 코드 블록을 터미널 transcript에서 유니코드 박스 다이어그램으로 바꿔 그리는 function-hook 플러그인. `/show-me` 같은 스킬이 내는 mermaid 코드가 대상이다.

## 설치

```
/plugin marketplace add WhiteKr/whitekr-claude-plugins
/plugin install mermaid@whitekr-claude-plugins
```

개발 중에는 `claude --plugin-dir <이 폴더>` 로 로드한다.

## 동작

- `ui.render` 의 `AssistantMessage` 를 훅해 닫힌 ```` ```mermaid ```` 펜스를 [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) ASCII 렌더러로 그린 결과로 치환한다. 저장된 메시지(ctrl+o)는 바뀌지 않고 화면만 바뀐다.
- 원문을 유지하는 경우: 파싱 실패, 다이어그램 폭이 터미널 폭을 넘김, 펜스가 아직 안 닫힘(스트리밍 중).
- 라벨 안의 리터럴 `\n` 은 공백으로 바꾼다(렌더러가 줄바꿈으로 그리면 박스가 깨짐).
- 지원 다이어그램은 beautiful-mermaid ASCII 렌더러가 지원하는 범위(flowchart, sequence, class, ER, state 등)를 따른다.

## 옵션

`/config` 의 plugin 항목 또는 settings `pluginConfigs.mermaid.options`:

- `useAscii` (boolean, 기본 false): 박스 문자 대신 순수 ASCII(`+-|>`)로 그린다. 터미널·폰트가 `─│▶` 같은 ambiguous-width 글자를 2칸으로 그려 줄이 어긋날 때 켠다.

## 개발

`hooks/hooks.js` 는 `src/hooks.js` + beautiful-mermaid ASCII 경로를 esbuild 로 묶은 산출물이며 커밋 대상이다(마켓플레이스 설치는 빌드 없이 그대로 쓴다).

```
npm i
npm test   # build + test/hooks.test.mjs
```
