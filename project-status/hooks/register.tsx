import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Project } from '../types'
import { parseTasks } from './parse'
import { projectConfig, syncMessage } from './config'

const REFRESH_MS = 60_000
const VISIBLE_KEY = 'visible'
const projects = atom({ plugin: 'project-status', key: 'projects' } as const, [])
const updatedAt = atom({ plugin: 'project-status', key: 'updatedAt' } as const, 0)

type ProjectEntry = { id: string; name: string; dir: string }

const git = async ($: EngineInterface, dir: string, args: string[]) => {
  try {
    const run = await $.process.run(['git', '-C', dir, ...args], { timeoutMs: 10_000 })
    return run.exitCode === 0 ? run.stdout : undefined
  } catch {
    return undefined
  }
}

const loadProject = async (
  $: EngineInterface,
  root: string,
  cwd: string,
  entry: ProjectEntry,
): Promise<Project> => {
  const dir = `${root}/${entry.dir}`
  let tasks = parseTasks('')
  let hasStatus = false
  try {
    tasks = parseTasks(await $.fs.read(`${dir}/STATUS.md`))
    hasStatus = true
  } catch {}
  const porcelain = await git($, dir, ['status', '--porcelain'])
  const ahead = await git($, dir, ['rev-list', '--count', '@{u}..HEAD'])

  return {
    id: entry.id,
    name: entry.name,
    dir,
    ...tasks,
    dirty: porcelain ? porcelain.split('\n').filter(Boolean).length : 0,
    ahead: Number(ahead?.trim() ?? 0) || 0,
    hasStatus,
    isCurrent: cwd === dir || cwd.startsWith(`${dir}/`),
  }
}

const refresh = async ($: EngineInterface) => {
  const home = (await $.env.get('HOME')) ?? ''
  const { root, projectsFile } = projectConfig(
    home,
    await $.env.get('CLAUDE_MODS_PROJECTS_DIR'),
    await $.env.get('CLAUDE_MODS_PROJECTS_FILE'),
  )
  const cwd = await $.session.cwd()
  let entries: ProjectEntry[] = []
  if (projectsFile) {
    try {
      entries = JSON.parse(await $.fs.read(projectsFile))
    } catch {}
  }
  // Projects with a STATUS.md that the optional registry does not list yet.
  const known = new Set(entries.map(entry => entry.dir))
  for (const item of await $.fs.list(root).catch(() => [])) {
    if (item.kind !== 'dir' || known.has(item.name)) continue
    if (await $.fs.exists(`${root}/${item.name}/STATUS.md`)) {
      entries.push({ id: item.name, name: item.name, dir: item.name })
    }
  }
  const list = await Promise.all(entries.map(entry => loadProject($, root, cwd, entry)))
  // The project this session runs in goes first.
  list.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent))
  await update($, projects, () => list)
  await update($, updatedAt, () => Date.now())
  const unsynced = list.filter(project => project.dirty > 0 || project.ahead > 0).length
  $.ui.status(`projects ${list.length}${unsynced ? ` · ${unsynced} unsynced` : ''}`)
}

const bar = (done: number, total: number, width = 10) => {
  const filled = total ? Math.round((done / total) * width) : 0
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const syncProject = async ($: EngineInterface, project: Project) =>
  $.prompt.submit({
    text: syncMessage(await $.env.get('CLAUDE_MODS_SYNC_PHRASE'), project),
    asUser: true,
  })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'projects',
      description: 'Show or hide the status band of every project',
    })
    void refresh($)
    $.clock.every(REFRESH_MS, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'projects' }, async $ => {
    const isVisible = !((await $.store.get(VISIBLE_KEY)) ?? false)
    await $.store.set(VISIBLE_KEY, isVisible)
    if (isVisible) await refresh($)
    $.ui.invalidate('ui.render')

    return { text: isVisible ? 'Projects band shown.' : 'Projects band hidden.' }
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    void refresh($)

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await $.store.get(VISIBLE_KEY))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, projects)
    const at = await read($, updatedAt)
    const nameWidth = Math.max(8, ...list.map(project => project.name.length))

    return (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        {list.length === 0 && <Text dimColor>Reading projects…</Text>}
        {list.map((project, index) => {
          const complete = project.total > 0 && project.done === project.total
          const unsynced = project.dirty > 0 || project.ahead > 0
          const sync = [
            project.dirty ? `${project.dirty} changed` : '',
            project.ahead ? `${project.ahead} unpushed` : '',
          ].filter(Boolean).join(' · ')
          const nextLine = project.nextTask
            ? `${project.phase ? `[${project.phase}] ` : ''}${project.nextTask}`
            : ''

          return (
            <Box key={project.id} flexDirection="row" gap={1}>
              <Text color={project.isCurrent ? 'magenta' : undefined} bold>
                {`${project.isCurrent ? '▸' : ' '} ${project.name.padEnd(nameWidth)}`}
              </Text>
              <Text color={complete ? 'green' : 'cyan'}>{bar(project.done, project.total)}</Text>
              <Text>{(project.hasStatus ? `${project.done}/${project.total}` : '—').padEnd(7)}</Text>
              <Text color="yellow">{sync.padEnd(22)}</Text>
              <Box flexGrow={1} flexShrink={1}>
                <Text dimColor wrap="truncate-end">{nextLine}</Text>
              </Box>
              <Button
                key={`sync-${project.id}`}
                label={`${index + 1} sync`}
                hotkey={index < 9 ? String(index + 1) : undefined}
                variant={unsynced ? 'primary' : 'secondary'}
                dimColor={!unsynced}
                onPress={() => void syncProject($, project)}
              />
            </Box>
          )
        })}
        {at > 0 && (
          <Text dimColor>
            {`updated ${new Date(at).toLocaleTimeString()} · ▸ this session · ctrl+x tab then 1-9 = sync · /projects hides`}
          </Text>
        )}
      </Box>
    )
  })
}
