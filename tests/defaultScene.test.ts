import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultDocument } from '@/shared/defaults.ts'
import { runSimulation } from '@/features/simulation/lib/engine.ts'

test('默认场景端到端：两轮连锁 + 两支路交替复位，整体完成', () => {
  const result = runSimulation(createDefaultDocument())
  assert.equal(result.status, 'complete')
  assert.equal(result.roller.status, 'completed')
  assert.equal(result.roller.cycles, 2, '应在两个支路各跑一个循环')

  const branchOne = result.events.filter(event => event.kind === 'reset' && event.detail.includes('支路 1'))
  const branchTwo = result.events.filter(event => event.kind === 'reset' && event.detail.includes('支路 2'))
  assert.ok(branchOne.length > 0 && branchTwo.length > 0)

  const roundTwo = result.rounds.find(round => round.round === 2)!
  assert.notEqual(roundTwo.status, 'skipped', '第二轮连锁应实际启动')
  assert.ok(roundTwo.fallPieceIds.length > 0)
  assert.ok(roundTwo.reFallenPieceIds.includes('d1'), '首轮倒过的牌第二轮再次倒下')
  // 同一枚骨牌两轮各有一条独立 fall 事件，互不覆盖。
  const d1Falls = result.events.filter(event => event.kind === 'fall' && event.pieceId === 'd1')
  assert.deepEqual(d1Falls.map(event => event.round), [1, 2])
})

test('默认文档包含滚轮配置且两条支路均有效', () => {
  const doc = createDefaultDocument()
  assert.equal(doc.roller.branches.length, 2)
  const ids = new Set(doc.pieces.map(piece => piece.id))
  for (const branch of doc.roller.branches) {
    assert.ok(branch.length >= 4)
    for (const id of branch) assert.ok(ids.has(id), `支路元件 ${id} 应存在于场景中`)
  }
})
