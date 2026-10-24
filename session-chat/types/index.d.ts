export type Peer = {
  sessionId: string
  name: string
  cwd: string
  lastSeen: number
}

export type ChatMessage = {
  id: string
  at: number
  direction: 'in' | 'out'
  peer: string
  text: string
  by: 'model' | 'person'
}

declare module 'claude-code' {
  interface PluginState {
    'session-chat': {
      peers: Peer[]
      messages: ChatMessage[]
      unread: number
      isHidden: boolean
      me: string
    }
  }
}
