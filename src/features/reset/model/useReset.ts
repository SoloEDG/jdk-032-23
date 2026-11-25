import { computed, ref, type Ref } from 'vue'
import type { DominoDocument, RollerConfig } from '@/shared/document'

/** 复位滚轮的支路与运行参数编辑。 */
export function useReset(document: Ref<DominoDocument>, changed: () => void) {
  const branchIndex = ref<0 | 1>(0)
  const branchDraft = ref('')

  const roller = computed<RollerConfig>(() => document.value.roller ?? {
    enabled: false, startDelay: 0.8, speed: 2.4, contactRadius: 0.85, branches: [[], []],
  })

  function patch(patch: Partial<RollerConfig>) {
    document.value = { ...document.value, roller: { ...roller.value, ...patch } }
    changed()
  }

  function setEnabled(enabled: boolean) { patch({ enabled }) }
  function setStartDelay(value: number) { patch({ startDelay: clamp(value, 0, 10) }) }
  function setSpeed(value: number) { patch({ speed: clamp(value, 0.4, 8) }) }
  function setContactRadius(value: number) { patch({ contactRadius: clamp(value, 0.2, 3) }) }

  /** 依据分岔下游的骨牌自动生成两条支路（共同主干 + 各自支路）。 */
  function autoFill() {
    const pieces = document.value.pieces
    const splitter = pieces.find(piece => piece.kind === 'splitter')
    const start = pieces.find(piece => piece.id === document.value.startPieceId) ?? pieces[0]
    if (!splitter || !start) return
    const trunk: string[] = []
    let cursor = start.id
    const guard = new Set<string>()
    while (cursor && cursor !== splitter.id && !guard.has(cursor)) {
      guard.add(cursor)
      const piece = pieces.find(item => item.id === cursor)
      if (!piece) break
      trunk.push(cursor)
      const next = pieces
        .filter(item => item.id !== cursor)
        .sort((a, b) => Math.hypot(a.x - piece.x, a.y - piece.y) - Math.hypot(b.x - piece.x, b.y - piece.y))[0]
      cursor = next?.id ?? ''
    }
    trunk.push(splitter.id)
    const downstream = (branch: number) => pieces
      .filter(piece => piece.kind === 'domino' || piece.kind === 'trigger')
      .filter(piece => branch === 0 ? piece.y < splitter.y : piece.y >= splitter.y)
      .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
      .map(piece => piece.id)
    patch({ branches: [[...trunk, ...downstream(0)], [...trunk, ...downstream(1)]] })
    branchDraft.value = ''
  }

  function selectBranch(index: 0 | 1) {
    branchIndex.value = index
    branchDraft.value = roller.value.branches[index].join(' → ')
  }

  function applyBranch() {
    const ids = branchDraft.value.split(/[→,，\s]+/).map(id => id.trim()).filter(Boolean)
    const valid = ids.filter(id => document.value.pieces.some(piece => piece.id === id))
    const branches = [...roller.value.branches] as [string[], string[]]
    branches[branchIndex.value] = valid
    patch({ branches })
  }

  function clearBranch() {
    const branches = [...roller.value.branches] as [string[], string[]]
    branches[branchIndex.value] = []
    patch({ branches })
    selectBranch(branchIndex.value)
  }

  return {
    roller, branchIndex, branchDraft, setEnabled, setStartDelay, setSpeed,
    setContactRadius, autoFill, selectBranch, applyBranch, clearBranch,
  }
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}
