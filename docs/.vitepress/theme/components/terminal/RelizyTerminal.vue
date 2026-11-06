<script lang="ts" setup>
import type { Action, Box, CiGroup, Line, Segment, Tone } from './scenarios'
import { MazArrowPath } from '@maz-ui/icons/raw/MazArrowPath'
import MazBtn from 'maz-ui/components/MazBtn'
import MazTabsBar from 'maz-ui/components/MazTabsBar'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ciScenario, ciSummary, dryRunScenario, releaseScenario } from './scenarios'
import TerminalWindow from './TerminalWindow.vue'

/**
 * The output of `relizy release`, played step by step: in a terminal, in
 * dry-run and in the log of GitHub Actions.
 */

type ScenarioName = 'release' | 'dry-run' | 'ci'

type Row
  = | { id: number, kind: 'command', text: string, typing: boolean }
    | { id: number, kind: 'line', line: Line, edge?: 'start' | 'end' }
    | { id: number, kind: 'spinner', label: string, ai: boolean, startedAt: number }
    | { id: number, kind: 'box', box: Box }
    | { id: number, kind: 'confirm', question: Segment[], options: string[], answered: boolean }

interface CiState {
  group: CiGroup
  status: 'running' | 'done'
  open: boolean
}

const tabs = [
  { label: 'Release', value: 'release' },
  { label: 'Dry run', value: 'dry-run' },
  { label: 'GitHub Actions', value: 'ci' },
] as const

const SPINNER = ['◒', '◐', '◓', '◑']
/** The long steps seem as long as they are: the elapsed time runs faster */
const TIME_SCALE = 6

const scenario = ref<ScenarioName>('release')
const rows = ref<Row[]>([])
const ciGroups = ref<CiState[]>([])
const ciDone = ref(false)
const playing = ref(false)
const frame = ref(0)
const now = ref(0)
const screen = ref<HTMLElement>()
const root = ref<HTMLElement>()

let run = 0
let nextId = 0
let ticker: ReturnType<typeof setInterval> | undefined
let observer: IntersectionObserver | undefined
let reducedMotion = false

const title = computed(() => scenario.value === 'ci' ? 'release.yml · Run relizy' : `~/acme — relizy release${scenario.value === 'dry-run' ? ' --dry-run' : ''}`)

const TONES: Record<Tone, string> = {
  dim: 'text-terminal-dim',
  green: 'text-terminal-green',
  magenta: 'text-terminal-magenta',
  yellow: 'text-terminal-yellow',
  cyan: 'text-terminal-cyan',
  red: 'text-terminal-red',
  bold: 'font-semibold text-terminal-bright',
  badge: 'rounded-xs bg-terminal-yellow px-0.5 font-bold text-terminal',
  brand: 'text-gradient',
}

function toneClass(tone: Segment['tone']): string {
  return [tone ?? []].flat().map(name => TONES[name]).join(' ')
}

/**
 * The rail of the steps, a continuous line behind the symbols: from the first
 * symbol to the last one, along the boxes too
 */
const RAIL = 'relative min-h-[1.6em] before:absolute before:left-[0.5ch] before:w-px before:-translate-x-1/2 before:bg-terminal-line'

function railClass(row: Row): string {
  if (row.kind === 'command') {
    return ''
  }
  const edge = row.kind === 'line' ? row.edge : undefined
  return [RAIL, edge === 'start' ? 'before:top-[0.8em]' : 'before:top-0', edge === 'end' ? 'before:bottom-[calc(100%-0.8em)]' : 'before:bottom-0'].join(' ')
}

function elapsed(startedAt: number): string {
  const seconds = Math.floor((now.value - startedAt) / 1000 * TIME_SCALE)
  return seconds >= 2 ? `${seconds}s` : ''
}

type CommandRow = Extract<Row, { kind: 'command' }>
type LineRow = Extract<Row, { kind: 'line' }>
type SpinnerRow = Extract<Row, { kind: 'spinner' }>
type BoxRow = Extract<Row, { kind: 'box' }>
type ConfirmRow = Extract<Row, { kind: 'confirm' }>

function push<R extends Row>(row: Omit<R, 'id'>): R {
  rows.value.push({ ...row, id: nextId++ } as R)
  // The reactive row, to update it
  return rows.value.at(-1) as R
}

/** The space between two steps, on the rail */
function gap() {
  push<LineRow>({ kind: 'line', line: { segments: [] } })
}

function scrollToEnd() {
  void nextTick(() => {
    const element = screen.value
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' })
    }
  })
}

watch(() => [rows.value.length, ciGroups.value.length, ciDone.value], scrollToEnd)

/** Thrown by `sleep` when another play started: the current one stops there */
const CANCELLED = Symbol('cancelled')

type Sleep = (ms: number) => Promise<void>

async function typeCommand(text: string, sleep: Sleep) {
  const row = push<CommandRow>({ kind: 'command', text: '', typing: true })
  for (const char of text) {
    row.text += char
    await sleep(38)
  }
  await sleep(350)
  row.typing = false
}

async function confirm(action: Extract<Action, { do: 'confirm' }>, sleep: Sleep) {
  gap()
  const row = push<ConfirmRow>({ kind: 'confirm', question: action.question, options: action.options, answered: false })
  await sleep(1400)
  row.answered = true
  await sleep(300)
}

/** A step: its spinner and what it does, then its result */
async function runStep(action: Extract<Action, { do: 'step' }>, sleep: Sleep) {
  gap()
  const row = push<SpinnerRow>({ kind: 'spinner', label: action.running, ai: false, startedAt: Date.now() })

  for (const progress of action.progress ?? []) {
    row.label = progress.text
    row.ai = Boolean(progress.ai)
    row.startedAt = Date.now()
    await sleep(progress.ms)
  }
  if (!action.progress) {
    await sleep(action.ms ?? 600)
  }

  const dryRun: Segment[] = scenario.value === 'dry-run' ? [{ text: '  dry run', tone: 'yellow' }] : []
  const index = rows.value.findIndex(({ id }) => id === row.id)
  rows.value.splice(index, 1, { id: row.id, kind: 'line', line: { symbol: { text: '◇', tone: 'green' }, segments: [...action.done, { text: `  ${action.duration}`, tone: 'dim' }, ...dryRun] } })

  for (const line of action.after ?? []) {
    gap()
    push<LineRow>({ kind: 'line', line })
  }
}

function runAction(action: Action, sleep: Sleep): Promise<void> {
  switch (action.do) {
    case 'type':
      return typeCommand(action.text, sleep)
    case 'intro': {
      const badge: Segment[] = action.dryRun ? [{ text: '  ' }, { text: ' DRY RUN ', tone: 'badge' }, { text: ' nothing will be written', tone: 'dim' }] : []
      push<LineRow>({ kind: 'line', edge: 'start', line: { symbol: { text: '●', tone: 'magenta' }, segments: [{ text: action.title, tone: 'bold' }, ...badge] } })
      return sleep(300)
    }
    case 'line':
      push<LineRow>({ kind: 'line', line: action.line })
      return sleep(action.wait ?? 200)
    case 'box':
      gap()
      push<BoxRow>({ kind: 'box', box: action.box })
      return sleep(action.wait ?? 400)
    case 'confirm':
      return confirm(action, sleep)
    case 'step':
      return runStep(action, sleep)
    case 'outro':
      gap()
      push<LineRow>({ kind: 'line', edge: 'end', line: { symbol: { text: '●', tone: 'dim' }, segments: action.segments } })
      return Promise.resolve()
    case 'pause':
      return sleep(action.ms)
  }
}

async function playCi(sleep: Sleep) {
  for (const group of ciScenario) {
    const state: CiState = { group, status: 'running', open: false }
    ciGroups.value.push(state)
    await sleep(group.lines.length * 220 + 350)
    ciGroups.value[ciGroups.value.length - 1]!.status = 'done'
  }
  await sleep(300)
  ciDone.value = true
}

async function play() {
  const id = ++run
  const sleep: Sleep = async (ms) => {
    await new Promise<void>(resolve => setTimeout(resolve, reducedMotion ? 0 : ms))
    if (id !== run) {
      throw CANCELLED
    }
  }

  rows.value = []
  ciGroups.value = []
  ciDone.value = false
  playing.value = true

  try {
    if (scenario.value === 'ci') {
      await playCi(sleep)
    }
    else {
      for (const action of scenario.value === 'release' ? releaseScenario : dryRunScenario) {
        await runAction(action, sleep)
      }
    }
    playing.value = false
  }
  catch (error) {
    if (error !== CANCELLED) {
      throw error
    }
  }
}

watch(scenario, () => void play())

onMounted(() => {
  reducedMotion = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  ticker = setInterval(() => {
    frame.value++
    now.value = Date.now()
  }, 90)

  // Played once visible
  observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) {
      observer?.disconnect()
      void play()
    }
  }, { threshold: 0.35 })
  if (root.value) {
    observer.observe(root.value)
  }
})

onBeforeUnmount(() => {
  run++
  clearInterval(ticker)
  observer?.disconnect()
})

const lineNumbers = computed(() => {
  let line = 1
  return ciGroups.value.map((state) => {
    const start = line
    line += 1 + (state.open ? state.group.lines.length : 0) + 1 + (state.group.after?.length ?? 0)
    return start
  })
})
</script>

<template>
  <div ref="root" class="relative mx-auto w-full max-w-5xl">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <MazTabsBar v-model="scenario" :items="tabs" standalone />
      <MazBtn
        size="sm"
        color="transparent"
        :start-icon="MazArrowPath"
        :disabled="playing && scenario !== 'ci' && rows.length === 0"
        @click="play"
      >
        Replay
      </MazBtn>
    </div>

    <!-- Glow behind the window -->
    <div aria-hidden="true" class="pointer-events-none absolute inset-x-10 top-24 -z-1 h-3/4 rounded-full bg-linear-to-r from-primary/40 to-secondary/40 blur-3xl" />

    <TerminalWindow :title="title">
      <div
        ref="screen"
        class="h-136 overflow-auto p-5 font-mono text-[0.8125rem] leading-[1.6] text-terminal-fg max-tab-m:h-120 max-tab-m:p-3 max-tab-m:text-[0.6875rem]"
        aria-label="The output of relizy release"
      >
        <!-- Terminal -->
        <template v-if="scenario !== 'ci'">
          <div v-for="row in rows" :key="row.id" class="animate-[rise_0.25s_ease-out_backwards] whitespace-pre" :class="railClass(row)">
            <div v-if="row.kind === 'command'" class="mb-2">
              <span class="text-terminal-cyan">~/acme</span>
              <span class="text-terminal-magenta"> ❯ </span>
              <span class="text-terminal-bright">{{ row.text }}</span>
              <span v-if="row.typing" class="ml-px inline-block h-4 w-2 translate-y-0.5 animate-blink bg-terminal-fg" />
            </div>

            <div v-else-if="row.kind === 'line'" class="flex">
              <span class="w-[3ch] shrink-0">
                <span v-if="row.line.symbol" class="relative z-1 inline-block bg-terminal" :class="toneClass(row.line.symbol.tone)">{{ row.line.symbol.text }}</span>
              </span>
              <span><span v-for="(segment, index) in row.line.segments" :key="index" :class="toneClass(segment.tone)">{{ segment.text }}</span></span>
            </div>

            <div v-else-if="row.kind === 'spinner'" class="flex">
              <span class="w-[3ch] shrink-0"><span class="relative z-1 inline-block bg-terminal text-terminal-magenta">{{ SPINNER[frame % SPINNER.length] }}</span></span>
              <span v-if="row.ai">
                <span>✨ </span>
                <span class="animate-shimmer bg-[linear-gradient(90deg,var(--color-terminal-magenta)_30%,var(--color-terminal-bright)_50%,var(--color-terminal-magenta)_70%)] bg-size-[200%_100%] bg-clip-text text-transparent">{{ row.label }}</span>
                <span class="text-terminal-dim">  {{ elapsed(row.startedAt) }}</span>
              </span>
              <span v-else>{{ row.label }}<span class="text-terminal-dim">{{ '.'.repeat(1 + frame % 3) }}</span></span>
            </div>

            <div v-else-if="row.kind === 'box'" class="flex">
              <span class="w-[3ch] shrink-0" />
              <div class="relative mt-1 mb-1 rounded-lg border border-terminal-line px-4 pt-3 pb-2.5">
                <span class="absolute -top-2.5 left-3 bg-terminal px-1.5">
                  <span v-for="(segment, index) in row.box.title" :key="index" :class="toneClass(segment.tone)">{{ segment.text }}</span>
                </span>
                <div v-for="(boxRow, rowIndex) in row.box.rows" :key="rowIndex">
                  <span v-for="(segment, index) in boxRow" :key="index" :class="toneClass(segment.tone)">{{ segment.text }}</span>
                </div>
              </div>
            </div>

            <div v-else-if="row.kind === 'confirm'">
              <div class="flex">
                <span class="w-[3ch] shrink-0"><span class="relative z-1 inline-block bg-terminal" :class="row.answered ? 'text-terminal-green' : 'text-terminal-cyan'">{{ row.answered ? '◇' : '◆' }}</span></span>
                <span><span v-for="(segment, index) in row.question" :key="index" :class="toneClass(segment.tone)">{{ segment.text }}</span></span>
              </div>
              <div class="flex">
                <span class="w-[3ch] shrink-0" />
                <span v-if="row.answered" class="text-terminal-dim">{{ row.options[0] }}</span>
                <span v-else>
                  <span class="text-terminal-green">● </span><span class="text-terminal-bright underline underline-offset-4">{{ row.options[0] }}</span>
                  <span class="text-terminal-dim"> / ○ {{ row.options[1] }}</span>
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- GitHub Actions -->
        <template v-else>
          <div class="mb-3 flex items-center gap-2 text-terminal-bright">
            <span :class="ciDone ? 'text-terminal-green' : 'animate-spin text-terminal-yellow'">{{ ciDone ? '✔' : '◌' }}</span>
            <span class="font-semibold">Run pnpm relizy release --yes</span>
            <span class="ml-auto text-terminal-dim">{{ ciDone ? '34s' : '' }}</span>
          </div>
          <div class="text-terminal-dim">
            <span class="inline-block w-8 pr-3 text-right select-none">0</span><span class="font-semibold text-terminal-bright">relizy release</span> · github
          </div>
          <div v-for="(state, groupIndex) in ciGroups" :key="state.group.title" class="animate-[rise_0.25s_ease-out_backwards]">
            <button
              type="button"
              class="flex w-full cursor-pointer items-center rounded-sm text-left hover:bg-terminal-bar"
              :aria-expanded="state.open"
              @click="state.open = !state.open"
            >
              <span class="inline-block w-8 shrink-0 pr-3 text-right text-terminal-dim select-none">{{ lineNumbers[groupIndex] }}</span>
              <span class="mr-1.5 inline-block w-3 text-terminal-dim transition-transform" :class="state.open ? 'rotate-90' : ''">›</span>
              <span class="text-terminal-bright">{{ state.group.title }}</span>
              <span v-if="state.status === 'running'" class="ml-2 text-terminal-yellow">{{ SPINNER[frame % SPINNER.length] }}</span>
            </button>
            <div v-if="state.open">
              <div v-for="(line, index) in state.group.lines" :key="index" class="flex whitespace-pre">
                <span class="inline-block w-8 shrink-0 pr-3 text-right text-terminal-dim select-none">{{ lineNumbers[groupIndex]! + index + 1 }}</span>
                <span class="pl-4"><span v-for="(segment, segmentIndex) in line" :key="segmentIndex" :class="toneClass(segment.tone)">{{ segment.text }}</span></span>
              </div>
            </div>
            <div v-if="state.status === 'done'" class="flex whitespace-pre">
              <span class="inline-block w-8 shrink-0 pr-3 text-right text-terminal-dim select-none">{{ lineNumbers[groupIndex]! + 1 + (state.open ? state.group.lines.length : 0) }}</span>
              <span :class="state.group.failed ? 'text-terminal-yellow' : 'text-terminal-green'">{{ state.group.failed ? '▲ ' : '✔ ' }}</span>
              <span><span v-for="(segment, index) in state.group.result" :key="index" :class="toneClass(segment.tone)">{{ segment.text }}</span></span>
            </div>
            <template v-if="state.status === 'done'">
              <div v-for="(line, index) in state.group.after ?? []" :key="index" class="flex whitespace-pre">
                <span class="inline-block w-8 shrink-0 pr-3 text-right text-terminal-dim select-none" />
                <span><span v-for="(segment, segmentIndex) in line" :key="segmentIndex" :class="toneClass(segment.tone)">{{ segment.text }}</span></span>
              </div>
            </template>
          </div>

          <template v-if="ciDone">
            <div class="mt-2 animate-[rise_0.3s_ease-out_backwards]">
              <div v-for="(line, index) in ciSummary" :key="index" class="flex whitespace-pre">
                <span class="inline-block w-8 shrink-0 pr-3 text-right text-terminal-dim select-none" />
                <span><span v-for="(segment, segmentIndex) in line" :key="segmentIndex" :class="toneClass(segment.tone)">{{ segment.text }}</span></span>
              </div>
            </div>
            <div class="mt-4 grid animate-[rise_0.3s_ease-out_backwards] gap-2 font-sans text-xs">
              <div class="flex items-start gap-2 rounded-md border border-terminal-yellow/40 bg-terminal-yellow/10 px-3 py-2 text-terminal-yellow">
                <span class="font-bold">Warning</span>
                <span class="text-terminal-fg">relizy · Posted on twitter, slack failed: channel_not_found</span>
              </div>
              <div class="flex items-start gap-2 rounded-md border border-terminal-cyan/40 bg-terminal-cyan/10 px-3 py-2 text-terminal-cyan">
                <span class="font-bold">Notice</span>
                <span class="text-terminal-fg">relizy · Released acme 2.4.0</span>
              </div>
            </div>
            <p class="mt-3 font-sans text-xs text-terminal-dim">
              Click a step to unfold its logs. The summary also fills the summary of the run, the PR comment and the outputs of the step.
            </p>
          </template>
        </template>
      </div>
    </TerminalWindow>
  </div>
</template>
