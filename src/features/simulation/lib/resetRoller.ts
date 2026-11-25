import type {
  DominoDocument, ResetRoutePoint, RollerConfig, RollerPhase,
  RollerReport, RollerTraversalSample, SimulationEvent, Vec2,
} from '@/shared/document'

export interface ResetPassOptions {
  document: DominoDocument
  roller: RollerConfig
  /** 滚轮准备的下一轮编号（首轮连锁之后传入 2）。 */
  targetRound: number
  baseTime: number
  makeEventId: () => string
}

export interface ResetPassResult {
  events: SimulationEvent[]
  report: RollerReport
  /** 行程结束后仍处倒下状态的元件（现场保留）。 */
  remainingFallen: Set<string>
  endTime: number
}

/** 摩擦越高滚轮越难爬坡；低于该系数即判定卡在坡道上。 */
const STUCK_FACTOR_LIMIT = 0.4
const SAMPLE_INTERVAL = 0.06
/** 循环数硬上限：防止支路覆盖不到的骨牌导致死循环。 */
const MAX_CYCLES = 12

function resolveBranch(document: DominoDocument, branch: string[]): ResetRoutePoint[] {
  const points: ResetRoutePoint[] = []
  for (const id of branch) {
    const piece = document.pieces.find(item => item.id === id)
    if (piece) points.push({ x: piece.x, y: piece.y, pieceId: piece.id })
  }
  return points
}

function buildRoute(branchPoints: ResetRoutePoint[]): ResetRoutePoint[] {
  // 去程沿支路走到末端，回程沿同一支路原路返回。
  const outbound = branchPoints
  const returning = [...branchPoints].reverse().slice(1)
  return [...outbound, ...returning]
}

function segmentLength(route: ResetRoutePoint[]) {
  let total = 0
  for (let i = 1; i < route.length; i += 1) {
    total += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i].y)
  }
  return total
}

function pointAtDistance(route: ResetRoutePoint[], distance: number): { point: Vec2; phase: RollerPhase } {
  const outboundLength = segmentLength(route.slice(0, (route.length + 1) / 2))
  let walked = 0
  for (let i = 1; i < route.length; i += 1) {
    const prev = route[i - 1]
    const current = route[i]
    const length = Math.hypot(current.x - prev.x, current.y - prev.y)
    if (walked + length >= distance || i === route.length - 1) {
      const ratio = length === 0 ? 0 : Math.min(1, (distance - walked) / length)
      return {
        point: { x: prev.x + (current.x - prev.x) * ratio, y: prev.y + (current.y - prev.y) * ratio },
        phase: distance <= outboundLength ? 'outbound' : 'returning',
      }
    }
    walked += length
  }
  const last = route[route.length - 1]
  return { point: { x: last.x, y: last.y }, phase: 'returning' }
}

/**
 * 执行一次滚轮复位行程：两支路每个循环交替一支，去程与回程沿同一支路。
 * 只有滚轮进入接触半径、且骨牌仍处倒下（露出复位面）时才推回站立；
 * 路过未倒骨牌只记录不触碰。卡在坡道或机关提前关闭时保留现场并停止。
 */
export function runResetPass(fallen: Set<string>, options: ResetPassOptions): ResetPassResult {
  const { document, roller, targetRound, baseTime, makeEventId } = options
  const events: SimulationEvent[] = []
  const route: ResetRoutePoint[] = []
  const traversal: RollerTraversalSample[] = []
  const resetPieceIds: string[] = []
  const passedUprightPieceIds: string[] = []
  const dominoes = document.pieces.filter(piece => piece.kind === 'domino')
  // 只有骨牌存在“复位面”概念；坡道、分岔器等非骨牌元件不纳入复位集合。
  const dominoIds = new Set(dominoes.map(piece => piece.id))
  const remainingFallen = new Set([...fallen].filter(id => dominoIds.has(id)))
  const everReset = new Set<string>()
  const pushEvent = (event: Omit<SimulationEvent, 'id' | 'round'>) =>
    events.push({ ...event, id: makeEventId(), round: targetRound })

  const idleReport = (status: RollerReport['status']): RollerReport => ({
    attempted: false, cycles: 0, status, stopReason: null, stopPieceId: null,
    stopTime: null, stopPhase: null, resetPieceIds, unresetPieceIds: [...remainingFallen],
    passedUprightPieceIds, route, traversal,
  })

  if (!roller.enabled) return { events, report: idleReport('idle'), remainingFallen, endTime: baseTime }

  const branches = roller.branches
    .map(branch => resolveBranch(document, branch))
    .filter(points => points.length >= 2)
  if (branches.length === 0) return { events, report: idleReport('idle'), remainingFallen, endTime: baseTime }

  let time = baseTime + roller.startDelay
  let cycles = 0
  let stopReason: string | null = null
  let stopPieceId: string | null = null
  let stopPhase: RollerPhase | null = null

  const stop = (reason: string, pieceId: string | null, phase: RollerPhase) => {
    stopReason = reason
    stopPieceId = pieceId
    stopPhase = phase
  }

  // 基于路径段的最近距离判定，避免固定步长采样跨过接触窗口。
  const pointSegmentDistance = (point: Vec2, start: Vec2, end: Vec2) => {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    const ratio = lengthSquared === 0 ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    const closest = { x: start.x + dx * ratio, y: start.y + dy * ratio }
    return Math.hypot(point.x - closest.x, point.y - closest.y)
  }

  let finishedRoute = false
  while (!finishedRoute && !stopReason && cycles < MAX_CYCLES) {
    const branchIndex = cycles % branches.length
    const cycleRoute = buildRoute(branches[branchIndex])
    const totalLength = segmentLength(cycleRoute)
    let distance = 0
    const contactedThisCycle = new Set<string>()

    while (distance <= totalLength && !stopReason) {
      const previousPoint = pointAtDistance(cycleRoute, Math.max(0, distance - roller.speed * SAMPLE_INTERVAL)).point
      const { point, phase } = pointAtDistance(cycleRoute, Math.min(distance, totalLength))
      traversal.push({ x: point.x, y: point.y, time, phase })
      if (route.length === 0 || Math.hypot(point.x - route[route.length - 1].x, point.y - route[route.length - 1].y) > 0.01) {
        route.push({ x: point.x, y: point.y, pieceId: null })
      }

      // 坡道检测：摩擦系数过低时滚轮卡在坡面，现场保留。
      const ramp = document.pieces.find(piece => piece.kind === 'ramp'
        && Math.hypot(piece.x - point.x, piece.y - point.y) <= roller.contactRadius)
      if (ramp) {
        const gripFactor = (document.scene.friction + ramp.friction) / 2
        if (gripFactor < STUCK_FACTOR_LIMIT) {
          stop(`滚轮在坡道 ${ramp.label}（${ramp.id}）上打滑卡住，剩余骨牌保留现场。`, ramp.id, phase)
          break
        }
      }

      // 机关提前关闭：触发器经过复位行程后关闭连线并截停滚轮。
      const closedTrigger = document.pieces.find(piece => piece.kind === 'trigger'
        && Math.hypot(piece.x - point.x, piece.y - point.y) <= roller.contactRadius)
      if (closedTrigger) {
        for (const link of document.connections) {
          if (link.from === closedTrigger.id) link.enabled = false
        }
        stop(`机关 ${closedTrigger.label}（${closedTrigger.id}）提前关闭，滚轮在此停驶，后续元件保持原状。`, closedTrigger.id, phase)
        pushEvent({
          pieceId: closedTrigger.id, time, causeId: null, kind: 'roller', phase,
          detail: `机关提前关闭 · ${phase === 'outbound' ? '去程' : '回程'}截停滚轮`,
        })
        break
      }

      // 接触判定：滚轮沿本段路径行驶，骨牌到该段的最近距离进入半径即发生一次接触。
      for (const domino of dominoes) {
        if (contactedThisCycle.has(domino.id)) continue
        const gap = pointSegmentDistance({ x: domino.x, y: domino.y }, previousPoint, point)
        if (gap > roller.contactRadius) continue
        contactedThisCycle.add(domino.id)
        if (remainingFallen.has(domino.id)) {
          remainingFallen.delete(domino.id)
          everReset.add(domino.id)
          resetPieceIds.push(domino.id)
          pushEvent({
            pieceId: domino.id, time, causeId: null, kind: 'reset', phase,
            detail: `滚轮接触复位面推回站立 · ${phase === 'outbound' ? '去程' : '回程'} · 支路 ${branchIndex + 1}`,
          })
        } else if (!everReset.has(domino.id) && !passedUprightPieceIds.includes(domino.id)) {
          // 全程站立、也从未被本行程复位过的骨牌，才记为“路过未倒”。
          passedUprightPieceIds.push(domino.id)
        }
      }

      distance += roller.speed * SAMPLE_INTERVAL
      time += SAMPLE_INTERVAL
    }

    if (stopReason) break
    cycles += 1
    // 当前支路已完整走完：若已无待复位骨牌即收车，否则交替到下一支路。
    if (remainingFallen.size === 0) {
      finishedRoute = true
      break
    }
    if (cycles < MAX_CYCLES) {
      pushEvent({
        pieceId: null, time, causeId: null, kind: 'roller',
        phase: 'returning', detail: `支路 ${(cycles % branches.length) + 1} 复位循环结束，切换下一支路`,
      })
    }
  }

  const exhausted = remainingFallen.size > 0 && !stopReason
  const report: RollerReport = {
    attempted: true,
    cycles,
    status: stopReason
      ? (document.pieces.find(piece => piece.id === stopPieceId)?.kind === 'trigger' ? 'mechanism-closed' : 'stuck-ramp')
      : exhausted ? 'unreachable' : 'completed',
    stopReason: stopReason ?? (exhausted
      ? `支路无法覆盖 ${remainingFallen.size} 枚骨牌（${[...remainingFallen].join('、')}），滚轮停止并保留现场。`
      : null),
    stopPieceId,
    stopTime: stopReason || exhausted ? time : null,
    stopPhase,
    resetPieceIds,
    unresetPieceIds: [...remainingFallen],
    passedUprightPieceIds,
    route,
    traversal,
  }
  return { events, report, remainingFallen, endTime: time }
}
