import type { DominoDocument, Piece, SimulationEvent } from '@/shared/document'
import { nextContact } from '@/features/layout/lib/geometry'

interface Scheduled {
  pieceId: string
  time: number
  causeId: string | null
  detail: string
}

export interface ChainRoundOptions {
  round: number
  startPieceId: string
  /** 上一轮结束后仍处倒下状态的元件；本轮它们只传递冲击，不再产生事件。 */
  initialFallen: ReadonlySet<string>
  baseTime: number
  makeEventId: () => string
}

export interface ChainRoundResult {
  events: SimulationEvent[]
  fallenPieceIds: string[]
  interruptedPieceId: string | null
  interruptionReason: string | null
  reachedTrigger: boolean
  duration: number
  endTime: number
}

/**
 * 执行一轮连锁传播。
 * 已倒下的骨牌不会被重复记录，但仍会把冲击传递给下一枚，保证新一轮
 * 事件不覆盖首轮、且链路不会被复位前的旧状态阻断。
 */
export function runChainRound(document: DominoDocument, options: ChainRoundOptions): ChainRoundResult {
  const { round, startPieceId, initialFallen, baseTime, makeEventId } = options
  const queue: Scheduled[] = [{ pieceId: startPieceId, time: baseTime, causeId: null, detail: round === 1 ? '手动触发' : `第 ${round} 轮启动` }]
  const fallen = new Set(initialFallen)
  const relayed = new Set<string>()
  const events: SimulationEvent[] = []
  let interruptedPieceId: string | null = null
  let interruptionReason: string | null = null
  let reachedTrigger = false
  let localEvents = 0

  const relayFrom = (piece: Piece, time: number, causeId: string | null) => {
    for (const link of document.connections.filter(link => link.from === piece.id && link.enabled)) {
      queue.push({ pieceId: link.to, time: time + link.delay, causeId, detail: '机关连线' })
    }
    const available = document.pieces.filter(item => !fallen.has(item.id) && item.id !== piece.id)
    const surfaceGrip = (document.scene.friction + piece.friction) / 2
    const reachScale = (0.94 + surfaceGrip * 0.35) * (1.25 - piece.fallThreshold * 0.25)
    let target: Piece | null = null
    if (piece.kind === 'ramp') {
      target = available.filter(item => item.x > piece.x && Math.abs(item.y - piece.y) < 2.1)
        .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))[0] ?? null
    } else {
      target = nextContact(piece, available, reachScale)
    }
    if (target) {
      const separation = Math.hypot(piece.x - target.x, piece.y - target.y)
      const speed = Math.max(1.8, piece.height * document.scene.gravity / 2) * (0.75 + surfaceGrip * 0.5)
      const travel = Math.max(0.24, separation / speed)
      queue.push({
        pieceId: target.id, time: time + travel, causeId,
        detail: piece.kind === 'splitter' ? '分岔臂接触' : piece.kind === 'ramp' ? '坡面末端接触' : '相邻接触',
      })
    }
    const hasConnection = document.connections.some(link => link.from === piece.id && link.enabled)
    if (!target && !hasConnection && interruptedPieceId === null) {
      interruptedPieceId = piece.id
      interruptionReason = '倒下方向内没有可触达的元件，链路在此停止。'
      events.push({
        id: makeEventId(), pieceId: piece.id, time: time + 0.05, causeId,
        kind: 'interrupted', detail: interruptionReason, round,
      })
    }
  }

  while (queue.length && localEvents < document.pieces.length * 3) {
    queue.sort((a, b) => a.time - b.time || a.pieceId.localeCompare(b.pieceId) || (a.causeId ?? '').localeCompare(b.causeId ?? ''))
    const next = queue.shift()!
    const piece = document.pieces.find(item => item.id === next.pieceId)
    if (!piece || fallen.has(piece.id)) {
      // 持久倒下的骨牌：不重复记录，但仍需把冲击接力传出去（每枚只接力一次）。
      if (piece && initialFallen.has(piece.id) && !relayed.has(piece.id)) {
        relayed.add(piece.id)
        relayFrom(piece, next.time, next.causeId)
      }
      continue
    }

    if (piece.kind === 'trigger') {
      const event: SimulationEvent = {
        id: makeEventId(), pieceId: piece.id, time: next.time, causeId: next.causeId,
        kind: 'mechanism', detail: `触发器响应 · ${next.detail}`, round,
      }
      events.push(event)
      localEvents += 1
      reachedTrigger = true
      for (const link of document.connections.filter(link => link.from === piece.id && link.enabled)) {
        queue.push({ pieceId: link.to, time: next.time + link.delay, causeId: event.id, detail: '机关连线' })
      }
      continue
    }

    fallen.add(piece.id)
    const event: SimulationEvent = {
      id: makeEventId(), pieceId: piece.id, time: next.time, causeId: next.causeId,
      kind: piece.kind === 'splitter' ? 'mechanism' : 'fall',
      detail: piece.kind === 'splitter' ? `分岔展开 · ${next.detail}`
        : piece.kind === 'ramp' ? `坡道传递 · ${next.detail}` : `受力倒下 · ${next.detail}`,
      round,
    }
    events.push(event)
    localEvents += 1
    relayFrom(piece, next.time, event.id)
  }

  return {
    events,
    fallenPieceIds: [...fallen].filter(id => !initialFallen.has(id)),
    interruptedPieceId,
    interruptionReason,
    reachedTrigger,
    duration: events.at(-1)?.time ? events.at(-1)!.time - baseTime : 0,
    endTime: events.at(-1)?.time ?? baseTime,
  }
}
