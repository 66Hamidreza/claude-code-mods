import { expect, test } from 'claude-code/testing'
import { projectConfig, syncMessage } from './config'

test('default discovery needs no project registry', async () => {
  expect(projectConfig('/example')).toEqual({ root: '/example/projects', projectsFile: undefined })
})

test('configured discovery and registry paths expand home', async () => {
  const env: Record<string, string> = { CLAUDE_MODS_PROJECTS_DIR: '~/work', CLAUDE_MODS_PROJECTS_FILE: '~/registry.json' }
  expect(projectConfig('/example', env.CLAUDE_MODS_PROJECTS_DIR, env.CLAUDE_MODS_PROJECTS_FILE)).toEqual({ root: '/example/work', projectsFile: '/example/registry.json' })
})

test('sync phrase defaults and scopes only other projects', () => {
  const project = { isCurrent: true, name: 'demo', dir: '/example/demo' }
  expect(syncMessage(undefined, project)).toBe('sync')
  expect(syncMessage('', project)).toBe('sync')
  expect(syncMessage('refresh status', project)).toBe('refresh status')
  expect(syncMessage('refresh status', { ...project, isCurrent: false })).toBe('refresh status — only project demo (/example/demo)')
})
