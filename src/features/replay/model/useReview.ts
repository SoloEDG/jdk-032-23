import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { SimulationRun } from '@/shared/document'
import { eventsForRound, previousEvent, rollerPositionAt, type RoundFilter } from '../lib/eventOrder'

export function useReview(run: Ref<SimulationRun | null>) {
  const time = ref(0)
  const playing = ref(false)
  const roundFilter = ref<RoundFilter>('all')
  let timer = 0
  const events = computed(() => run.value?.events ?? [])
  const currentEvent = computed(() => previousEvent(events.value, time.value))
  const focusPieceId = computed(() => currentEvent.value?.pieceId ?? null)
  const visibleEvents = computed(() => eventsForRound(events.value, roundFilter.value))
  const availableRounds = computed(() => [...new Set(events.value.map(event => event.round))].sort((a, b) => a - b))
  const rollerPosition = computed(() => run.value ? rollerPositionAt(run.value.roller, time.value) : null)

  function stop() {
    playing.value = false
    if (timer) window.clearInterval(timer)
    timer = 0
  }
  function pause() { stop() }
  function seek(value: number) {
    stop()
    time.value = Math.max(0, Math.min(run.value?.duration ?? 0, value))
  }
  function play() {
    if (!run.value || run.value.duration <= 0 || playing.value) return
    if (time.value >= run.value.duration) time.value = 0
    playing.value = true
    timer = window.setInterval(() => {
      time.value = Math.min(run.value?.duration ?? 0, time.value + 0.04)
      if (time.value >= (run.value?.duration ?? 0)) stop()
    }, 40)
  }
  function toggle() { if (playing.value) pause(); else play() }
  function restart() { seek(0) }
  function setRoundFilter(filter: RoundFilter) { roundFilter.value = filter }
  function focusEvent(eventId: string) {
    const event = events.value.find(item => item.id === eventId)
    if (event) seek(event.time)
  }
  watch(run, () => { time.value = 0; roundFilter.value = 'all'; stop() })
  onBeforeUnmount(stop)
  return {
    time, playing, events, visibleEvents, availableRounds, roundFilter, currentEvent,
    focusPieceId, rollerPosition, seek, play, pause, toggle, restart, focusEvent, setRoundFilter,
  }
}
