#!/usr/bin/env python3
"""Print one Keep-a-Changelog version section, rejecting absent/empty entries."""
import pathlib
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: release-notes.py <version-or-v-tag>')
version = sys.argv[1].removeprefix('v')
if not re.fullmatch(r'\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?', version):
    raise SystemExit('invalid release version')
changelog = pathlib.Path(__file__).resolve().parents[2] / 'CHANGELOG.md'
match = re.search(
    r'^## \[' + re.escape(version) + r'\][^\n]*\n(.*?)(?=^## |^\[[^\n]+\]:|\Z)',
    changelog.read_text(), re.M | re.S,
)
if not match or not match.group(1).strip():
    raise SystemExit(f'missing or empty CHANGELOG.md entry for {version}')
print(match.group(1).strip())
