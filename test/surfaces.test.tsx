import { expect, test } from 'claude-code/testing'

const MESSAGE = {
  plugin: 'mermaid',
  component: 'AssistantMessage',
  requestId: 'm1',
  props: { text: 'before\n```mermaid\nflowchart LR\n  A[사용자] --> B[서버]\n```\nafter', isFirstOfReply: true },
} as const

const engine = (on: Parameters<Parameters<typeof test>[1]>[1]) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`engine:${(e.props as { text: string }).text}`}</Text>
  })

test('desktop draws the diagram as an Svg between the markdown', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...MESSAGE, surface: 'desktop' })
  expect((await ui.find({ type: 'Svg' })) != null).toBe(true)
  expect(await ui.find({ type: 'Text', text: /engine:/ })).toBe(undefined)
  await ui.unmount()
})

test('terminal hands the engine a box-drawing rewrite', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...MESSAGE, surface: 'terminal' })
  const row = await ui.find({ type: 'Text', text: /engine:/ })
  expect(row?.text.includes('┌')).toBe(true)
  expect(row?.text.includes('```mermaid')).toBe(false)
  await ui.unmount()
})
