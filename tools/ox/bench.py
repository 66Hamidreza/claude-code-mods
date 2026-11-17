#!/usr/bin/env python3
"""Sequential synthetic-only benchmark; no repository data sent to models."""
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
loader = importlib.machinery.SourceFileLoader('ox', str(HERE / 'ox'))
spec = importlib.util.spec_from_loader(loader.name, loader)
ox = importlib.util.module_from_spec(spec)
loader.exec_module(ox)
MODELS = ['beam-free', 'big-pickle', 'deepseek-v4.1-flash-free', 'flint-40b-free',
          'glm-5.3-flash-free', 'hy4-flash-free', 'iceman-free', 'inkling-2-small-free',
          'longcat-2.5-free', 'mimo-v2.6-flash-free', 'nemotron-3.5-lightning-free',
          'nemotron-3.5-super-vl-free']
FUNCTION = '''def shipping_cost(weight, express=False):
    """Cost for a nonnegative weight; express adds 7."""
    if weight < 0:
        raise ValueError("negative weight")
    if weight == 0:
        return 0
    base = 5
    extra = max(0, weight - 1) * 2
    fee = 7 if express else 0
    return base + extra + fee
'''


def prepare(root, task):
    if task == 'rename':
        (root / 'calc.py').write_text('def add_nums(a, b):\n    return a + b\n')
        (root / 'cli.py').write_text('from calc import add_nums\nprint(add_nums(2, 3))\n')
        (root / 'worker.py').write_text('import calc\nresult = calc.add_nums(4, 5)\n')
        return ('Rename add_nums to sum_values across calc.py, cli.py and worker.py. '
                'Preserve behavior; change all definitions, imports and calls. Edit those 3 files only.')
    if task == 'summary':
        events = {8: 'ERROR database connection timeout', 19: 'WARN retry succeeded',
                  32: 'ERROR disk full', 44: 'INFO cleanup reclaimed space',
                  55: 'INFO recovery complete'}
        (root / 'service.log').write_text('\n'.join(
            f'2026-01-01T00:00:{i:02d}Z {events.get(i, "INFO heartbeat healthy")}'
            for i in range(60)) + '\n')
        return ('Read service.log and write summary.md with exactly 5 bullet lines summarizing '
                'the significant events; ignore routine heartbeats. Include the words database, '
                'timeout, retry, disk, cleanup and recovery where relevant. Edit summary.md only.')
    (root / 'shipping.py').write_text(FUNCTION)
    return ('Read shipping.py. Write test_shipping.py using stdlib unittest with at least 3 test '
            'methods covering zero, positive and express costs, and negative weight raising ValueError. '
            'Do not modify shipping.py. Tests must run with python3 -m unittest discover.')


def command(root, args):
    p = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=15)
    if p.returncode:
        raise ValueError((p.stderr or p.stdout or 'check failed')[-350:].strip())
    return p.stdout + p.stderr


def verify(root, task):
    if task == 'rename':
        files = ['calc.py', 'cli.py', 'worker.py']
        old = subprocess.run(['grep', '-n', 'add_nums', *files], cwd=root, capture_output=True)
        if old.returncode != 1:
            raise ValueError('old name remains or grep failed')
        command(root, [sys.executable, '-m', 'py_compile', *files])
        command(root, [sys.executable, '-c',
                       'import calc, worker; assert calc.sum_values(2,3)==5; assert worker.result==9'])
        if command(root, [sys.executable, 'cli.py']).strip() != '5':
            raise ValueError('CLI behavior changed')
    elif task == 'summary':
        text = (root / 'summary.md').read_text()
        if len(text.splitlines()) != 5 or any(not re.match(r'^\s*[-*] ', x) for x in text.splitlines()):
            raise ValueError('expected exactly five bullet lines')
        if not all(k in text.lower() for k in ['database', 'timeout', 'retry', 'disk', 'cleanup', 'recovery']):
            raise ValueError('missing required keywords')
    else:
        if (root / 'shipping.py').read_text() != FUNCTION:
            raise ValueError('source function modified')
        if not (root / 'test_shipping.py').is_file():
            raise ValueError('test_shipping.py missing')
        out = command(root, [sys.executable, '-m', 'unittest', 'discover', '-v'])
        count = re.search(r'Ran (\d+) tests?', out)
        if not count or int(count[1]) < 3:
            raise ValueError('fewer than three tests executed')
        # Reject vacuous tests: the suite must detect an obviously broken implementation.
        (root / 'shipping.py').write_text('def shipping_cost(weight, express=False):\n    return -999\n')
        p = subprocess.run([sys.executable, '-B', '-m', 'unittest', 'discover'],
                           cwd=root, capture_output=True, timeout=15)
        if not p.returncode:
            raise ValueError('tests also pass with deliberately broken implementation')


def report(rows):
    rank = sorted(MODELS, key=lambda m: (-sum(r['pass'] for r in rows if r['model'] == m),
                                       sum(r['seconds'] for r in rows if r['model'] == m)))
    lines = ['# OpenCode free-model benchmark', '',
             f'Run: {datetime.now(timezone.utc).isoformat(timespec="seconds")}. OpenCode 2.3.0.', '',
             '36 sequential runs, 120s per-run timeout, 5s gap between runs. Synthetic files in fresh',
             'temporary directories outside the repository; no repository content supplied.',
             'Pass means generated artifacts passed local checks, not model self-report.', '',
             '| Model | Task | Result | Seconds | Error |', '|---|---|---|---:|---|']
    for r in rows:
        error = r['error'].replace('|', '/').replace('\n', ' ')[:250] or '—'
        lines.append(f'| {r["model"]} | {r["task"]} | {"PASS" if r["pass"] else "FAIL"} | {r["seconds"]:.1f} | {error} |')
    lines += ['', '## Ranking', '', 'Ordered by passed tasks descending, then total elapsed seconds ascending.', '',
              '| Rank | Model | Passed | Total seconds |', '|---:|---|---:|---:|']
    for i, m in enumerate(rank, 1):
        subset = [r for r in rows if r['model'] == m]
        lines.append(f'| {i} | {m} | {sum(r["pass"] for r in subset)}/3 | {sum(r["seconds"] for r in subset):.1f} |')
    lines += ['', f'Recommended default: `opencode/{rank[0]}`.', '',
              'Fallback order: ' + ', '.join(f'`{m}`' for m in rank) + '.', '',
              'One run per task is a small smoke benchmark; latency and availability can vary.',
              'Rename checks old-name absence, compilation and behavior. Summary checks five bullets',
              'and event keywords. Tests must execute ≥3 cases, pass, preserve source and reject a broken function.']
    (HERE / 'BENCH.md').write_text('\n'.join(lines) + '\n')
    (HERE / 'models.txt').write_text(''.join('opencode/' + m + '\n' for m in rank))
    (HERE / 'bench-results.json').write_text(json.dumps(rows, indent=2) + '\n')


def main():
    rows = []
    for model in MODELS:
        for task in ['rename', 'summary', 'tests']:
            if rows:
                time.sleep(5)
            with tempfile.TemporaryDirectory(prefix='ox-bench-', dir='/tmp') as tmp:
                root = Path(tmp)
                prompt = (f'Your task directory is {root}. Use absolute paths or cd to it in every shell command. '
                          'Actually edit the requested files using your tools, rather than describing edits. '
                          'Work only there. Never ask questions, run git, access secrets '
                          'or read files outside this directory. ' + prepare(root, task))
                output, elapsed, error = ox.run_model('opencode/' + model, prompt, root, 120)
                if not error:
                    try:
                        verify(root, task)
                    except (OSError, ValueError, subprocess.SubprocessError) as exc:
                        error = str(exc)
                rows.append(dict(model=model, task=task, seconds=round(elapsed, 3),
                                 **{'pass': not bool(error)}, error=error, output=output[-2000:]))
                # Checkpoint actual completed runs; final report is written after all 36.
                (HERE / 'bench-results.json').write_text(json.dumps(rows, indent=2) + '\n')
                print(f'{len(rows)}/36 {model} {task}: {"FAIL " + error if error else "PASS"} ({elapsed:.1f}s)', flush=True)
    report(rows)


if __name__ == '__main__':
    main()
