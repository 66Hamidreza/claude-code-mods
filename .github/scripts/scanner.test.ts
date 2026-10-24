import { test } from 'bun:test'
import { testScannerFixtures } from '../../agent-board/hooks/board.test'

test('embedded Python scanner handles rollout fixtures', async () => {
  await testScannerFixtures((async (argv: string[]) => {
    const child = Bun.spawn(argv, { stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ])
    return { stdout, stderr, exitCode }
  }) as Parameters<typeof testScannerFixtures>[0])
})
