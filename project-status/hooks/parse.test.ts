import { expect, test } from 'claude-code/testing'

import { parseTasks } from './parse'

const status = `# X
## Plan
- [ ] not a task
## Tasks
### Phase 1
- [x] one
- [x] two
### Phase 2
- [ ] three
- [ ] four
## Notes
- [ ] ignored
`

test('counts only the Tasks section and finds the first open task', async () => {
  expect(parseTasks(status)).toEqual({ done: 2, total: 4, phase: 'Phase 2', nextTask: 'three' })
})

test('empty file has no tasks', async () => {
  expect(parseTasks('')).toEqual({ done: 0, total: 0 })
})
