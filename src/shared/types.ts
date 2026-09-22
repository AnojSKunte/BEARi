/**
 * Shared contracts between main, preload and renderer processes.
 * Every engine speaks through these types — keep them dependency-free.
 */

// ---------------------------------------------------------------- Emotions

export const EMOTIONS = [
  'neutral',
  'happy',
  'excited',
  'thinking',
  'confused',
  'sad',
  'surprised',
  'blushing',
  'sleepy',
  'celebrating',
  'focused'
] as const

export type Emotion = (typeof EMOTIONS)[number]

// ---------------------------------------------------------------- Outfit

/** Every independently recolorable part of BEARi's outfit. */
export interface OutfitColors {
  dress: string
  dressTrim: string
  scarf: string
  leggings: string
  shoes: string
  glasses: string
  hairAccessory: string
}

export interface OutfitPreset {
  id: string
  name: string
  colors: OutfitColors
}

/** Garment styles she can wear (each recolored by OutfitColors). */
export const OUTFIT_STYLES = ['kurta', 'frock', 'croptop', 'hoodie'] as const
export type OutfitStyle = (typeof OUTFIT_STYLES)[number]

export const DEFAULT_OUTFIT: OutfitColors = {
  dress: '#D6B4F5',
  dressTrim: '#B08DF0',
  scarf: '#FBF7F2',
  leggings: '#FFFFFF',
  shoes: '#A9714B',
  glasses: '#F2A9C4',
  hairAccessory: '#F2A9C4'
}

// ---------------------------------------------------------------- AI

export type ProviderId = 'anthropic' | 'openai' | 'gemini'

export interface ProviderConfig {
  apiKey: string
  model: string
}

export interface AiSettings {
  activeProvider: ProviderId
  providers: Record<ProviderId, ProviderConfig>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Directives BEARi's brain can embed in a reply (parsed out before display). */
export interface ReplyDirectives {
  emotion?: Emotion
  outfitColor?: string
  outfitStyle?: OutfitStyle
  remember?: string
}

// ---------------------------------------------------------------- Memory

export type MemoryKind = 'person' | 'project' | 'preference' | 'fact' | 'event'

/** Legacy flat notebook entry - still the shape the simple list API speaks. */
export interface MemoryEntry {
  id: string
  kind: MemoryKind
  text: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------- Brain
// Her long-term memory is layered, after the systems that work in practice:
//   core blocks    always in context, LLM-editable (Letta / MemGPT)
//   episodes       everything that happened, time-stamped (Generative Agents)
//   knowledge      entities + bi-temporal facts that get invalidated, never
//                  silently overwritten (Zep / Graphiti), maintained by an
//                  extract-then-ADD/UPDATE/INVALIDATE pass (Mem0)
//   insights       higher-level reflections written while she sleeps

export type CoreBlockId = 'profile' | 'focus' | 'style'

export interface CoreBlock {
  id: CoreBlockId
  label: string
  text: string
  updatedAt: string
}

export type EpisodeKind = 'chat_user' | 'chat_assistant' | 'observation' | 'note' | 'system'

export interface Episode {
  id: string
  at: string
  kind: EpisodeKind
  text: string
  meta: Record<string, unknown>
  importance: number
}

export const ENTITY_TYPES = [
  'person',
  'project',
  'organization',
  'place',
  'tool',
  'topic',
  'event',
  'other'
] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export interface Entity {
  id: string
  name: string
  type: EntityType
  aliases: string[]
  summary: string
  mentions: number
  createdAt: string
  updatedAt: string
}

export type FactKind = 'fact' | 'preference' | 'event' | 'relationship' | 'goal' | 'habit'

export interface Fact {
  id: string
  subjectId: string
  subject: string
  predicate: string
  objectId: string | null
  object: string | null
  text: string
  kind: FactKind
  confidence: number
  importance: number
  /** When the fact was true in the world (may be open-ended). */
  validFrom: string | null
  validUntil: string | null
  /** When she learned it, and when it was superseded (system time). */
  createdAt: string
  invalidatedAt: string | null
  sourceEpisodeId: string | null
  supersededBy: string | null
  recallCount: number
}

export interface Insight {
  id: string
  at: string
  text: string
  importance: number
  evidence: string[]
}

export interface BrainStats {
  episodes: number
  observations: number
  entities: number
  facts: number
  invalidated: number
  insights: number
  lastReflectionAt: string | null
  lastExtractionAt: string | null
  /** Provider-level problem she hit while thinking in the background, if any. */
  lastError: string | null
}

export interface BrainSnapshot {
  blocks: CoreBlock[]
  entities: Entity[]
  facts: Fact[]
  insights: Insight[]
  stats: BrainStats
}

export interface RecallHit {
  kind: 'fact' | 'episode' | 'insight'
  id: string
  text: string
  at: string
  score: number
}

// ---------------------------------------------------------------- Awareness

export interface AwarenessSettings {
  /** Off until the user turns it on - watching a screen is theirs to allow. */
  enabled: boolean
  /** Seconds between looks while the user is active. */
  intervalSec: number
  /** Window titles containing any of these are never looked at. */
  excludeTitles: string[]
  /** Never look while the foreground process name matches one of these. */
  excludeApps: string[]
}

export interface Observation {
  id: string
  at: string
  app: string
  title: string
  activity: string
  topic: string
}

export interface AwarenessState {
  enabled: boolean
  /** Epoch ms until which watching is paused, 0 = not paused. */
  pausedUntil: number
  lastLookAt: string | null
  lastSkipReason: string | null
  looksToday: number
  running: boolean
}

// ---------------------------------------------------------------- Updates

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  latestVersion: string | null
  releaseNotes: string | null
  releaseDate: string | null
  percent: number
  message: string | null
  checkedAt: string | null
}

export interface AppInfo {
  version: string
  isPackaged: boolean
  platform: string
}

// ---------------------------------------------------------------- Settings

/**
 * How the character is drawn:
 * - 'model3d' — a real 3D BEARi (three.js): lit, shadowed, turns her head in
 *               true depth, performs every action with a full skeleton (default)
 * - 'vector'  — the 2D animated performer: parametric, fully recolorable SVG
 * - 'sprite'  — cut-out artwork frames
 * - 'puppet'  — BEARi's real artwork cut into moving layers (experimental)
 * - 'live2d'  — Cubism rig (needs a real BEARi model; hidden until then)
 */
export type RenderMode = 'frames' | 'model3d' | 'puppet' | 'vector' | 'sprite' | 'live2d'

export interface AppSettings {
  ai: AiSettings
  outfit: OutfitColors
  outfitStyle: OutfitStyle
  renderMode: RenderMode
  characterScale: number
  userName: string
  personaExtra: string
  sleepAfterMinutes: number
  alwaysOnTop: boolean
  launchAtStartup: boolean
  awareness: AwarenessSettings
  /** Let her learn from conversations in the background (extraction + reflection). */
  learnFromChat: boolean
  /** Check GitHub Releases for a newer BEARi on launch and every few hours. */
  autoCheckUpdates: boolean
}

export const DEFAULT_AWARENESS: AwarenessSettings = {
  enabled: false,
  intervalSec: 90,
  excludeTitles: ['password', 'bank', 'private', 'incognito', 'inprivate', 'signal', 'whatsapp', 'telegram'],
  excludeApps: ['KeePass', '1Password', 'Bitwarden']
}

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    activeProvider: 'anthropic',
    providers: {
      anthropic: { apiKey: '', model: 'claude-opus-5' },
      openai: { apiKey: '', model: 'gpt-4o-mini' },
      gemini: { apiKey: '', model: 'gemini-2.0-flash' }
    }
  },
  outfit: DEFAULT_OUTFIT,
  outfitStyle: 'kurta',
  renderMode: 'frames',
  characterScale: 1,
  userName: '',
  personaExtra: '',
  sleepAfterMinutes: 5,
  alwaysOnTop: true,
  launchAtStartup: false,
  awareness: DEFAULT_AWARENESS,
  learnFromChat: true,
  autoCheckUpdates: true
}

// ---------------------------------------------------------------- IPC

export const IPC = {
  // chat
  chatSend: 'chat:send',
  chatChunk: 'chat:chunk',
  chatDone: 'chat:done',
  chatError: 'chat:error',
  chatCancel: 'chat:cancel',
  // settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsChanged: 'settings:changed',
  // memory
  memoryList: 'memory:list',
  memoryAdd: 'memory:add',
  memoryUpdate: 'memory:update',
  memoryRemove: 'memory:remove',
  memoryChanged: 'memory:changed',
  // brain
  brainSnapshot: 'brain:snapshot',
  brainTimeline: 'brain:timeline',
  brainRecall: 'brain:recall',
  brainSetBlock: 'brain:set-block',
  brainForgetFact: 'brain:forget-fact',
  brainForgetEntity: 'brain:forget-entity',
  brainReflect: 'brain:reflect',
  brainExport: 'brain:export',
  brainChanged: 'brain:changed',
  // awareness
  awarenessState: 'awareness:state',
  awarenessPause: 'awareness:pause',
  awarenessLookNow: 'awareness:look-now',
  awarenessRecent: 'awareness:recent',
  awarenessChanged: 'awareness:changed',
  awarenessObserved: 'awareness:observed',
  // updates
  updateState: 'update:state',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateChanged: 'update:changed',
  // character window
  setInteractive: 'window:set-interactive',
  cursorMove: 'cursor:move',
  userActivity: 'user:activity',
  // app
  appInfo: 'app:info',
  openDashboard: 'app:open-dashboard',
  quit: 'app:quit'
} as const

export interface CursorInfo {
  /** Cursor position in screen coordinates. */
  x: number
  y: number
  /** Character window bounds in screen coordinates. */
  winX: number
  winY: number
  winW: number
  winH: number
}
