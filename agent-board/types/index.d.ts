export type NodeStatus = 'running' | 'waiting' | 'idle' | 'done' | 'failed'

// ok: nothing to say; idle: waiting for the person; approval: a permission ask is open;
// stalled: running but nothing happened for a while; looping: the same call over and over.
export type Health = 'ok' | 'idle' | 'approval' | 'stalled' | 'looping'

export type RecentCall = { tool: string; detail: string; at: number; ok?: boolean }

// What a Codex run's rollout log says about it, read live from ~/.codex/sessions.
export type CodexInfo = {
  rollout: string
  threadId: string
  owner: string
  run: string
  cwd: string
  prompt: string
  tasks: string[]
  startedAt: number
  commands: number
  recentCommands: string[]
  files: string[]
  tokens: number
  lastAction?: string
  lastMessage?: string
  summary?: string
  isComplete: boolean
  activityAt: number
}

// A child T3 Code delegated through delegate_task, read from T3's own store.
export type T3Info = { threadId: string; driver: string; effort?: string; result?: string }

export type AgentNode = {
  id: string
  parentId?: string
  kind: 'main' | 'agent' | 'workflow' | 'codex'
  label: string
  type: string
  model: string
  status: NodeStatus
  tool?: string
  detail?: string
  toolStartedAt?: number
  tools: number
  errors: number
  steps: number
  turns: number
  tokens: number
  startedAt: number
  endedAt?: number
  lastEventAt: number
  approvalSince?: number
  recent: RecentCall[]
  health: Health
  healthNote?: string
  codex?: CodexInfo
  toolUseId?: string
  t3?: T3Info
}

export type BoardEvent = { at: number; level: 'info' | 'done' | 'warn' | 'fail'; text: string; nodeId?: string }

// Another session's heartbeat, read from its snapshot under mods-data.
export type PeerSession = {
  sessionId: string
  name: string
  state: 'working' | 'idle' | 'approval' | 'stalled' | 'looping' | 'silent' | 'ended'
  note: string
  since: number
  running: number
  updatedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-board': {
      agents: AgentNode[]
      activity: number[]
      now: number
      webUrl: string | null
      events: BoardEvent[]
      peers: PeerSession[]
    }
  }
}
