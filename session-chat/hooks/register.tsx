import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChatMessage, Peer } from '../types'
import { formatTag, matchPeer, parseTag } from './chat'

const HEARTBEAT_MS = 10_000
const ALIVE_MS = 45_000
const KEEP = 100

const peers = atom({ plugin: 'session-chat', key: 'peers' } as const, [])
const messages = atom({ plugin: 'session-chat', key: 'messages' } as const, [])
const unread = atom({ plugin: 'session-chat', key: 'unread' } as const, 0)
const isHidden = atom({ plugin: 'session-chat', key: 'isHidden' } as const, false)
const me = atom({ plugin: 'session-chat', key: 'me' } as const, '')

const PEERS_TOOL = 'mcp__session-chat__peers'
const BROADCAST_TOOL = 'mcp__session-chat__broadcast'

const peersDir = async ($: EngineInterface) =>
  `${(await $.env.get('HOME')) ?? ''}/.claude/mods-data/session-chat/peers`

const remember = async ($: EngineInterface, message: Omit<ChatMessage, 'id' | 'at'>) => {
  const at = await $.clock.now()
  const entry: ChatMessage = { ...message, at, id: `${at}-${Math.random().toString(36).slice(2, 6)}` }
  await update($, messages, list => [...list, entry].slice(-KEEP))
  if (message.direction === 'in') await update($, unread, n => n + 1)
}

const heartbeat = async ($: EngineInterface, sessionId: string) => {
  const dir = await peersDir($)
  const self: Peer = {
    sessionId,
    name: await read($, me),
    cwd: await $.session.cwd(),
    lastSeen: await $.clock.now(),
  }
  await $.fs.write(`${dir}/${sessionId}.json`, JSON.stringify(self))

  const now = self.lastSeen
  const found: Peer[] = []
  for (const entry of await $.fs.list(dir).catch(() => [])) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    try {
      const peer: Peer = JSON.parse(await $.fs.read(`${dir}/${entry.name}`))
      if (peer.sessionId !== sessionId && now - peer.lastSeen < ALIVE_MS) found.push(peer)
    } catch {}
  }
  found.sort((a, b) => a.name.localeCompare(b.name))
  await update($, peers, () => found)
}

const send = async ($: EngineInterface, peer: Peer, text: string, by: ChatMessage['by']) => {
  const sent = await $.session.send({
    to: { sessionId: peer.sessionId },
    text: formatTag(await read($, me), text),
  })
  const isDelivered = sent.isDelivered !== false
  if (isDelivered) await remember($, { direction: 'out', peer: peer.name, text, by })

  return isDelivered
}

const broadcast = async ($: EngineInterface, text: string, by: ChatMessage['by']) => {
  const list = await read($, peers)
  let delivered = 0
  for (const peer of list) if (await send($, peer, text, by).catch(() => false)) delivered += 1

  return { delivered, total: list.length }
}

const peerList = (list: readonly Peer[]) =>
  list.length === 0
    ? 'No other sessions with session-chat are running.'
    : list.map(peer => `${peer.name}  (${peer.cwd})  sessionId=${peer.sessionId}`).join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const sessionId = await $.session.id()
    const cwd = await $.session.cwd()
    const base = cwd.split('/').filter(Boolean).pop() ?? 'session'
    const saved = (await $.store.get(`name:${sessionId}`)) as string | undefined
    await update($, me, () => saved ?? `${base}-${sessionId.slice(0, 4)}`)
    await $.process.run(['mkdir', '-p', await peersDir($)]).catch(() => undefined)

    for (const [name, description] of [
      ['msg', 'Send a message to another session: /msg <name> <text>'],
      ['all', 'Send a message to every other session: /all <text>'],
      ['who', 'List the other sessions on this machine'],
      ['chat', 'Show or hide the chat band; /chat name <new name> renames this session'],
    ] as const) {
      // One refused name (a built-in took it) must not skip the rest.
      await $.command.register({ name, description }).catch(err => $.ui.toast(`session-chat: /${name} not registered: ${err}`))
    }

    await $.tool.register({
      name: 'peers',
      description:
        'List the other Claude Code sessions running on this machine (name, working directory, sessionId). ' +
        'Message one with SendMessage (to = its name) or several with the broadcast tool.',
      inputSchema: { type: 'object', properties: {} },
    })
    await $.tool.register({
      name: 'broadcast',
      description: 'Send one plain-text message to every other Claude Code session on this machine.',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string', description: 'The message; first line is the preview' } },
        required: ['message'],
      },
    })

    await heartbeat($, sessionId).catch(() => undefined)
    $.clock.every(HEARTBEAT_MS, () => void heartbeat($, sessionId).catch(() => undefined))

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const sessionId = await $.session.id()
    const gone: Peer = { sessionId, name: await read($, me), cwd: '', lastSeen: 0 }
    await $.fs.write(`${await peersDir($)}/${sessionId}.json`, JSON.stringify(gone)).catch(() => undefined)

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const name = await read($, me)

    return {
      sections: [
        ...composed.sections,
        {
          id: 'session-chat:peers',
          scope: 'session',
          text:
            `This session is "${name}" to other Claude Code sessions on this machine. ` +
            'When your work overlaps another session (same repo, shared files, a task they own), coordinate: ' +
            `list them with ${PEERS_TOOL}, message one with SendMessage, or all with ${BROADCAST_TOOL}. ` +
            'Keep messages short and actionable; do not chat for its own sake.',
        },
      ],
    }
  })

  on('session.receive', async ($, e, next) => {
    const kind = e.origin.kind
    if (kind === 'peer-send-message' || (kind === 'peer' && !('teammate' in e.origin))) {
      const { from, body } = parseTag(e.text)
      await remember($, { direction: 'in', peer: from ?? 'peer', text: body, by: 'model' })
      $.ui.toast(`message from ${from ?? 'a session'}: ${body.split('\n')[0]?.slice(0, 80)}`)
    }

    return next(e)
  })

  on('session.send', async ($, e, next) => {
    if (e.origin.kind !== 'model' || parseTag(e.text).from !== undefined) return next(e)
    const list = await read($, peers)
    const peer = list.find(one => one.name === e.to || one.sessionId === e.to)
    const sent = await next({ ...e, text: formatTag(await read($, me), e.text) })
    if (peer && sent.isDelivered !== false) {
      await remember($, { direction: 'out', peer: peer.name, text: e.text, by: 'model' })
    }

    return sent
  })

  on('tool.call', { tool: new RegExp(`^${PEERS_TOOL}$`) }, async $ => {
    await heartbeat($, await $.session.id()).catch(() => undefined)

    const text = peerList(await read($, peers))

    return { result: text, text }
  })

  on('tool.call', { tool: new RegExp(`^${BROADCAST_TOOL}$`) }, async ($, e) => {
    const call = e as unknown as { input?: { message?: unknown }; message?: unknown }
    const text = String(call.input?.message ?? call.message ?? '').trim()
    if (!text) return { result: 'Nothing sent: message is empty.', isError: true }
    const { delivered, total } = await broadcast($, text, 'model')

    const done = `Delivered to ${delivered} of ${total} sessions.`

    return { result: done, text: done }
  })

  on('command.run', { command: 'who' }, async $ => {
    await heartbeat($, await $.session.id()).catch(() => undefined)

    return { text: `You are ${await read($, me)}.\n${peerList(await read($, peers))}` }
  })

  on('command.run', { command: 'msg' }, async ($, e) => {
    const [target = '', ...rest] = e.args.trim().split(/\s+/)
    const text = e.args.trim().slice(target.length).trim()
    if (!target || rest.length === 0) return { text: 'Usage: /msg <name> <text>' }
    const peer = matchPeer(await read($, peers), target)
    if (!peer) return { text: `No session matches "${target}".\n${peerList(await read($, peers))}` }
    const isDelivered = await send($, peer, text, 'person')

    return { text: isDelivered ? `Sent to ${peer.name}.` : `Could not deliver to ${peer.name}.` }
  })

  on('command.run', { command: 'all' }, async ($, e) => {
    const text = e.args.trim()
    if (!text) return { text: 'Usage: /all <text>' }
    const { delivered, total } = await broadcast($, text, 'person')

    return { text: `Delivered to ${delivered} of ${total} sessions.` }
  })

  on('command.run', { command: 'chat' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'name' && rest.length > 0) {
      const name = rest.join('-')
      await update($, me, () => name)
      await $.store.set(`name:${await $.session.id()}`, name)
      await heartbeat($, await $.session.id()).catch(() => undefined)

      return { text: `This session is now "${name}".` }
    }
    const hidden = await update($, isHidden, value => !value)
    await update($, unread, () => 0)

    return { text: hidden ? 'Chat band hidden.' : 'Chat band shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, messages)
    const others = await read($, peers)
    if (e.props.hasSurvey || (await read($, isHidden)) || (list.length === 0 && others.length === 0)) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const width = Math.max(20, (e.props.bodyColumns ?? 80) - 4)
    const count = await read($, unread)
    const recent = list.slice(-3)

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>chat </Text>
          <Text dimColor>
            {await read($, me)} · {others.length} peer{others.length === 1 ? '' : 's'}
            {others.length > 0 ? `: ${others.map(peer => peer.name).join(', ')}` : ''}
          </Text>
          {count > 0 && <Text color="yellow"> · {count} new</Text>}
          <Text> </Text>
          <Button key="seen" plain label="[seen]" onPress={() => update($, unread, () => 0)} />
          <Text> </Text>
          <Button key="hide" plain label="[hide]" onPress={() => update($, isHidden, () => true)} />
        </Box>
        {recent.map(message => (
          <Text key={message.id} dimColor={message.direction === 'out'} wrap="truncate">
            {message.direction === 'in' ? `${message.peer} → me` : `me → ${message.peer}`}
            {message.by === 'model' ? ' (model)' : ''}: {message.text.split('\n')[0]?.slice(0, width)}
          </Text>
        ))}
      </Box>
    )
  })
}
