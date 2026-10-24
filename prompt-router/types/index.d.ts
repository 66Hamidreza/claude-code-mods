export type Tier = 'light' | 'standard' | 'heavy' | 'max' | 'codex'

export type Decision = {
  tier: Tier
  model: string
  reason: string
  source: 'prefix' | 'rule' | 'haiku' | 'keep' | 'fallback'
  at: number
}

export type CodexJob = {
  id: number
  prompt: string
  cwd: string
  status: 'queued' | 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
  tail?: string
}

export type AdvicePart = {
  title: string
  executor: 'claude' | 'codex'
  model: string
  effort?: 'low' | 'medium' | 'high'
}

export type Advice = {
  at: number
  prompt: string
  mode: 'single' | 'parallel'
  parts: AdvicePart[]
  reason: string
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-router': {
      decision: Decision | null
      lastModel: string | null
      badModels: string[]
      emptyModel: string | null
      isEnabled: boolean
      stats: Record<string, number>
      jobs: CodexJob[]
    }
  }
}
