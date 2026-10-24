#!/usr/bin/env python3
"""Run pure hook suites with Bun without requiring Claude's embedded test kit."""
import argparse
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODS = ('project-status', 'session-chat', 'agent-board', 'prompt-router')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('mods', nargs='*', metavar='MOD', help='mods to test; defaults to all four')
selected = parser.parse_args().mods or list(MODS)
if any(mod not in MODS for mod in selected):
    parser.error('unknown mod; choose from ' + ', '.join(MODS))
with tempfile.TemporaryDirectory(prefix='claude-mods-tests-') as directory:
    work = pathlib.Path(directory)
    for mod in MODS:
        shutil.copytree(ROOT / mod, work / mod)
    fixtures = work / '.github/scripts'
    fixtures.mkdir(parents=True)
    shutil.copy2(ROOT / '.github/scripts/scanner.test.ts', fixtures)
    for path in work.rglob('*.test.ts'):
        path.write_text(path.read_text().replace("from 'claude-code/testing'", "from 'bun:test'"))
    paths = ['./' + mod for mod in selected]
    if 'agent-board' in selected:
        paths.append('./.github/scripts/scanner.test.ts')
    raise SystemExit(subprocess.call(['bun', 'test', *paths], cwd=work))
