export type TaskSummary = { done: number; total: number; phase?: string; nextTask?: string }

// Reads the `## Tasks` section of a STATUS.md: checkbox counts and the first open task with its `###` heading.
export const parseTasks = (markdown: string): TaskSummary => {
  const summary: TaskSummary = { done: 0, total: 0 }
  let inTasks = false
  let heading: string | undefined
  for (const line of markdown.split('\n')) {
    if (/^## /.test(line)) {
      inTasks = /^## Tasks\b/.test(line)
      continue
    }
    if (!inTasks) continue
    const sub = line.match(/^###\s+(.*)/)
    if (sub) {
      heading = (sub[1] ?? '').trim()
      continue
    }
    const box = line.match(/^\s*[-*] \[([ xX])\]\s+(.*)/)
    if (!box) continue
    summary.total++
    if (box[1] !== ' ') summary.done++
    else if (summary.nextTask === undefined) {
      summary.nextTask = (box[2] ?? '').trim()
      summary.phase = heading
    }
  }
  return summary
}
