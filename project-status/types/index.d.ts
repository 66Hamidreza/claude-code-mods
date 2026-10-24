export type Project = {
  id: string
  name: string
  dir: string
  done: number
  total: number
  phase?: string
  nextTask?: string
  dirty: number
  ahead: number
  hasStatus: boolean
  isCurrent: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'project-status': { projects: Project[]; updatedAt: number }
  }
}
