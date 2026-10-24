import { expect, test } from 'claude-code/testing'

import { formatTag, matchPeer, parseTag } from './chat'

const peers = [
  { sessionId: 'abcd1234', name: 'shop-abcd', cwd: '/p/shop', lastSeen: 1 },
  { sessionId: 'ef561234', name: 'board-ef56', cwd: '/p/board', lastSeen: 1 },
  { sessionId: 'ef997777', name: 'plugin-ef99', cwd: '/p/plugin', lastSeen: 1 },
]

test('tag round-trips sender and body', async () => {
  expect(parseTag(formatTag('me-1', 'hello\nworld'))).toEqual({ from: 'me-1', body: 'hello\nworld' })
  expect(parseTag('plain text')).toEqual({ body: 'plain text' })
})

test('matchPeer prefers exact, then id prefix, then unique name prefix', async () => {
  expect(matchPeer(peers, 'Shop-abcd')?.sessionId).toBe('abcd1234')
  expect(matchPeer(peers, 'ef99')?.name).toBe('plugin-ef99')
  expect(matchPeer(peers, 'boar')?.sessionId).toBe('ef561234')
  expect(matchPeer(peers, 'w')).toBeUndefined()
  expect(matchPeer(peers, 'nobody')).toBeUndefined()
})
