import type { Peer } from '../types'

const TAG = /^\[chat:([^\]\s]+)\]\s?/

export const formatTag = (from: string, text: string) => `[chat:${from}] ${text}`

export const parseTag = (text: string): { from?: string; body: string } => {
  const found = TAG.exec(text)

  return found ? { from: found[1], body: text.slice(found[0].length) } : { body: text }
}

// Exact name, then sessionId prefix, then a unique name prefix.
export const matchPeer = (peers: readonly Peer[], target: string): Peer | undefined => {
  const wanted = target.toLowerCase()
  const exact = peers.find(peer => peer.name.toLowerCase() === wanted)
  if (exact) return exact
  const byId = peers.find(peer => peer.sessionId.startsWith(target))
  if (byId) return byId
  const byPrefix = peers.filter(peer => peer.name.toLowerCase().startsWith(wanted))

  return byPrefix.length === 1 ? byPrefix[0] : undefined
}
