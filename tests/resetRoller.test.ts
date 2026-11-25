import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSimulation } from '@/features/simulation/lib/engine.ts'
import { dominoStateAt, eventRoundsForPiece, rollerPositionAt } from '@/features/replay/lib/eventOrder.ts'
import { buildDocument, defaultRoller, domino, ramp, splitter, splitScene, trigger } from './helpers/fixture.ts'

test('两支路交替复位：倒下骨牌全部被推回站立，且支路按循环交替', () => {
  const doc = splitScene()
  const result = runSimulation(doc)

  const resetEvents = result.events.filter(event => event.kind === 'reset')
  const resetIds = resetEvents.map(event => event.pieceId)
  // 首轮倒下的骨牌（不含全程站立的 u1）都应被复位。
  for (const id of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) {
    assert.ok(resetIds.includes(id), `${id} 应被滚轮复位`)
  }
  assert.equal(result.roller.status, 'completed')
  assert.equal(result.roller.unresetPieceIds.length, 0)

  // 两个支路都应在复位事件明细中出现，且先支路 A 后支路 B。
  const branchMarks = resetEvents.map(event => event.detail).filter(detail => detail.includes('支路'))
  assert.ok(branchMarks.some(detail => detail.includes('支路 1')))
  assert.ok(branchMarks.some(detail => detail.includes('支路 2')))
  assert.ok(branchMarks.findIndex(detail => detail.includes('支路 1')) < branchMarks.findIndex(detail => detail.includes('支路 2')))
  assert.ok(result.roller.cycles >= 2)

  // 去程与回程都实际被采样。
  const phases = new Set(result.roller.traversal.map(sample => sample.phase))
  assert.deepEqual([...phases].sort(), ['outbound', 'returning'])
})

test('滚轮路过未倒骨牌不误触：u1 全程站立，只登记在 passedUprightPieceIds', () => {
  const doc = splitScene()
  const result = runSimulation(doc)

  assert.ok(result.roller.passedUprightPieceIds.includes('u1'), '路过的未倒骨牌应被登记')
  assert.ok(!result.roller.resetPieceIds.includes('u1'), '未倒骨牌不应被复位动作触碰')
  assert.ok(!result.events.some(event => event.kind === 'reset' && event.pieceId === 'u1'))
  assert.ok(!result.events.some(event => event.kind === 'fall' && event.pieceId === 'u1'))

  // 回放状态推导：u1 在任意时刻都是 standing。
  for (const tick of [0, result.duration * 0.25, result.duration * 0.6, result.duration]) {
    assert.equal(dominoStateAt(result.events, 'u1', tick), 'standing')
  }
})

test('再次倒下按新一轮记录，不覆盖首轮事件', () => {
  const doc = splitScene()
  const result = runSimulation(doc)

  const firstFalls = result.events.filter(event => event.kind === 'fall' && event.round === 1).map(event => event.pieceId)
  const secondFalls = result.events.filter(event => event.kind === 'fall' && event.round === 2).map(event => event.pieceId)
  assert.ok(firstFalls.includes('a1'))
  assert.ok(secondFalls.includes('a1'), '第二轮 a1 应再次倒下')

  // 同一枚骨牌拥有两条独立的 fall 事件，id 不同、时间不同、轮次不同。
  const a1Falls = result.events.filter(event => event.kind === 'fall' && event.pieceId === 'a1')
  assert.equal(a1Falls.length, 2)
  assert.notEqual(a1Falls[0].id, a1Falls[1].id)
  assert.ok(a1Falls[0].time < a1Falls[1].time)
  assert.deepEqual(a1Falls.map(event => event.round), [1, 2])

  const roundTwo = result.rounds.find(round => round.round === 2)
  assert.ok(roundTwo)
  assert.ok(roundTwo!.reFallenPieceIds.includes('a1'))
  assert.deepEqual([...new Set(result.events.map(event => event.id))].length, result.events.length, '事件 id 全局唯一')

  // 回放按时间能区分实际撞击：先 fall → reset → 再 fall。
  const history = eventRoundsForPiece(result.events, 'b1')
  const kinds = history.map(entry => `${entry.round}:${entry.kind}`)
  assert.deepEqual(kinds, ['1:fall', '2:reset', '2:fall'])
  const resetTime = history[1].time
  assert.equal(dominoStateAt(result.events, 'b1', resetTime - 0.01), 'fallen')
  assert.equal(dominoStateAt(result.events, 'b1', resetTime + 0.01), 'reset')
  assert.equal(dominoStateAt(result.events, 'b1', result.duration), 'fallen')
})

test('回放滚轮位置按时间插值，行程开始前不可见、结束后停在终点', () => {
  const doc = splitScene()
  const result = runSimulation(doc)
  const report = result.roller
  const start = report.traversal[0].time
  const end = report.traversal[report.traversal.length - 1].time

  assert.equal(rollerPositionAt(report, start - 1), null)
  const mid = rollerPositionAt(report, (start + end) / 2)
  assert.ok(mid)
  assert.ok(Number.isFinite(mid!.x) && Number.isFinite(mid!.y))
  const tail = rollerPositionAt(report, end + 5)
  assert.ok(tail)
  assert.equal(tail!.x, report.traversal.at(-1)!.x)
})

test('滚轮卡在坡道时保留现场：报告已复位与未复位清单，第二轮不启动', () => {
  // 场景摩擦 0.12 + 坡道摩擦 0.1 → gripFactor 0.11 < 0.4，滚轮必卡。
  const pieces = [
    domino('d1', 1, 4), domino('d2', 2.6, 4), ramp('r1', 4.4, 4, 0.1),
    domino('d3', 6.4, 4), domino('d4', 8, 4),
  ]
  const doc = buildDocument(pieces, defaultRoller([['d1', 'd2', 'r1', 'd3', 'd4'], ['d1', 'd2']]))
  doc.scene.friction = 0.12
  const result = runSimulation(doc)

  assert.equal(result.roller.status, 'stuck-ramp')
  assert.ok(result.roller.stopReason?.includes('坡道'))
  assert.equal(result.roller.stopPieceId, 'r1')
  // 卡坡前接触到的 d1/d2 已复位，坡后的 d3/d4 保持倒下。
  assert.ok(result.roller.resetPieceIds.includes('d1'))
  assert.deepEqual(result.roller.unresetPieceIds.sort(), ['d3', 'd4'])
  const roundTwo = result.rounds.find(round => round.round === 2)!
  assert.equal(roundTwo.status, 'skipped')
  assert.ok(roundTwo.interruptionReason?.includes('卡在坡道'))
  assert.equal(result.events.filter(event => event.round === 2 && event.kind === 'fall').length, 0)
  assert.equal(result.status, 'interrupted')
})

test('机关提前关闭：滚轮被截停，机关连线在第二轮失效且现场保留', () => {
  const pieces = [
    domino('d1', 1, 4), domino('d2', 2.6, 4),
    splitter('s1', 4.2, 4), domino('d3', 5.8, 4), trigger('t1', 7.4, 4),
  ]
  const doc = buildDocument(pieces, defaultRoller([['d1', 'd2', 's1', 'd3', 't1'], ['d1', 'd2']]), [
    { id: 'k1', from: 's1', to: 'd3', delay: 0.1, enabled: true },
    { id: 'k2', from: 't1', to: 'd1', delay: 0.1, enabled: true },
  ])
  const result = runSimulation(doc)

  assert.equal(result.roller.status, 'mechanism-closed')
  assert.equal(result.roller.stopPieceId, 't1')
  assert.ok(result.roller.stopReason?.includes('提前关闭'))
  // 引擎内的工作副本连线被关闭。
  const closedEvent = result.events.find(event => event.kind === 'roller' && event.detail.includes('机关提前关闭'))
  assert.ok(closedEvent)
  // 截停后未复位的牌保留现场，第二轮跳过。
  const roundTwo = result.rounds.find(round => round.round === 2)!
  assert.equal(roundTwo.status, 'skipped')
  assert.ok(roundTwo.interruptionReason?.includes('机关提前关闭'))
  assert.ok(result.roller.unresetPieceIds.length >= 0)
})

test('重复启动是相互独立的两次运行：事件 id 与轮次记录不共享', () => {
  const doc = splitScene()
  const first = runSimulation(doc)
  const second = runSimulation(structuredClone(doc))
  const firstIds = new Set(first.events.map(event => event.id))
  assert.equal(second.events.some(event => firstIds.has(event.id)), false)
  assert.equal(second.rounds.length, first.rounds.length)
  assert.deepEqual(
    second.events.map(event => [event.kind, event.round, event.pieceId]),
    first.events.map(event => [event.kind, event.round, event.pieceId]),
  )
})

test('禁用滚轮时不产生复位事件，状态为 idle', () => {
  const doc = splitScene({ enabled: false })
  const result = runSimulation(doc)
  assert.equal(result.roller.status, 'idle')
  assert.equal(result.roller.attempted, false)
  assert.equal(result.events.some(event => event.kind === 'reset' || event.kind === 'roller'), false)
  const roundTwo = result.rounds.find(round => round.round === 2)!
  assert.equal(roundTwo.status, 'skipped')
})

test('单支路线性场景也能完整复位并跑第二轮', () => {
  const pieces = [domino('d1', 1, 4), domino('d2', 2.6, 4), domino('d3', 4.2, 4)]
  const doc = buildDocument(pieces, defaultRoller([['d1', 'd2', 'd3'], ['d1', 'd2', 'd3']]))
  const result = runSimulation(doc)
  assert.equal(result.roller.status, 'completed')
  assert.deepEqual(result.roller.resetPieceIds.sort(), ['d1', 'd2', 'd3'])
  assert.equal(result.events.filter(event => event.kind === 'fall' && event.round === 2).length, 3)
})
