import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type {
  AnalyticsInfo,
  AppInfo,
  AppSettings,
  AwarenessState,
  BrainSnapshot,
  CoreBlock,
  CoreBlockId,
  CursorInfo,
  Episode,
  MemoryEntry,
  MemoryKind,
  Observation,
  RecallHit,
  ReplyDirectives,
  UpdateState
} from '@shared/types'

export interface ChatResultDto {
  text: string
  directives: ReplyDirectives
}

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  chat: {
    send: (text: string): Promise<ChatResultDto | null> => ipcRenderer.invoke(IPC.chatSend, text),
    cancel: (): void => ipcRenderer.send(IPC.chatCancel),
    onChunk: (cb: (raw: string) => void) => subscribe(IPC.chatChunk, cb),
    onDone: (cb: (result: ChatResultDto) => void) => subscribe(IPC.chatDone, cb),
    onError: (cb: (message: string) => void) => subscribe(IPC.chatError, cb)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSet, patch),
    onChanged: (cb: (settings: AppSettings) => void) => subscribe(IPC.settingsChanged, cb)
  },
  /** The simple notebook view of her memory - every entry is a fact about you. */
  memory: {
    list: (): Promise<MemoryEntry[]> => ipcRenderer.invoke(IPC.memoryList),
    add: (kind: MemoryKind, text: string): Promise<MemoryEntry> =>
      ipcRenderer.invoke(IPC.memoryAdd, kind, text),
    update: (id: string, patch: { kind?: MemoryKind; text?: string }): Promise<MemoryEntry | null> =>
      ipcRenderer.invoke(IPC.memoryUpdate, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.memoryRemove, id),
    onChanged: (cb: () => void) => subscribe(IPC.memoryChanged, cb)
  },
  /** The whole brain: core blocks, knowledge graph, timeline, insights. */
  brain: {
    snapshot: (): Promise<BrainSnapshot> => ipcRenderer.invoke(IPC.brainSnapshot),
    timeline: (dayIso: string): Promise<Episode[]> => ipcRenderer.invoke(IPC.brainTimeline, dayIso),
    recall: (query: string): Promise<RecallHit[]> => ipcRenderer.invoke(IPC.brainRecall, query),
    setBlock: (id: CoreBlockId, text: string): Promise<CoreBlock> => ipcRenderer.invoke(IPC.brainSetBlock, id, text),
    forgetFact: (id: string): Promise<void> => ipcRenderer.invoke(IPC.brainForgetFact, id),
    forgetEntity: (id: string): Promise<void> => ipcRenderer.invoke(IPC.brainForgetEntity, id),
    reflect: (): Promise<{ insights: number; blocksChanged: number } | null> => ipcRenderer.invoke(IPC.brainReflect),
    export: (): Promise<Record<string, unknown>> => ipcRenderer.invoke(IPC.brainExport),
    onChanged: (cb: () => void) => subscribe(IPC.brainChanged, cb)
  },
  awareness: {
    state: (): Promise<AwarenessState> => ipcRenderer.invoke(IPC.awarenessState),
    pause: (ms: number): Promise<AwarenessState> => ipcRenderer.invoke(IPC.awarenessPause, ms),
    lookNow: (): Promise<AwarenessState> => ipcRenderer.invoke(IPC.awarenessLookNow),
    recent: (n: number): Promise<Observation[]> => ipcRenderer.invoke(IPC.awarenessRecent, n),
    onChanged: (cb: (state: AwarenessState) => void) => subscribe(IPC.awarenessChanged, cb),
    onObserved: (cb: (o: Observation) => void) => subscribe(IPC.awarenessObserved, cb)
  },
  /** What the once-a-day anonymous hello contains, so it can be shown verbatim. */
  analytics: {
    info: (): Promise<AnalyticsInfo> => ipcRenderer.invoke(IPC.analyticsInfo)
  },
  update: {
    state: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.updateState),
    check: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.updateCheck),
    download: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.updateDownload),
    install: (): void => ipcRenderer.send(IPC.updateInstall),
    onChanged: (cb: (state: UpdateState) => void) => subscribe(IPC.updateChanged, cb)
  },
  window: {
    setInteractive: (interactive: boolean): void =>
      ipcRenderer.send(IPC.setInteractive, interactive)
  },
  cursor: {
    onMove: (cb: (info: CursorInfo & { idleMs: number }) => void) => subscribe(IPC.cursorMove, cb)
  },
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),
    openDashboard: (): void => ipcRenderer.send(IPC.openDashboard),
    quit: (): void => ipcRenderer.send(IPC.quit)
  }
}

export type BeariApi = typeof api

contextBridge.exposeInMainWorld('beari', api)
