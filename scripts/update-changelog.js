#!/usr/bin/env node
// Called by Claude Code PostToolUse hook after git commit.
// Reads the latest commit and prepends it to the [Unreleased] section of CHANGELOG.md.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const stdin = fs.readFileSync(0, 'utf8').trim();
if (!stdin) process.exit(0);

let hookData;
try {
  hookData = JSON.parse(stdin);
} catch {
  process.exit(0);
}

const command = hookData?.tool_input?.command ?? '';

// Only act on git commit (not push, status, log, etc.)
if (!command.match(/^git\s+commit\b/)) {
  process.exit(0);
}

const root = path.resolve(__dirname, '..');
const changelogPath = path.join(root, 'CHANGELOG.md');

let changelog;
try {
  changelog = fs.readFileSync(changelogPath, 'utf8');
} catch {
  process.exit(0);
}

let log;
try {
  log = execFileSync(
    'git',
    ['log', '-1', '--pretty=format:%h|%ad|%s', '--date=short'],
    { cwd: root, encoding: 'utf8' }
  ).trim();
} catch {
  process.exit(0);
}

if (!log) process.exit(0);

const [hash, date, ...msgParts] = log.split('|');
const message = msgParts.join('|');

// Format as a changelog bullet
const bullet = `- \`${hash}\` ${message} _(${date})_`;

// Insert under ## [Unreleased] heading
const marker = '## [Unreleased]';
const idx = changelog.indexOf(marker);
if (idx === -1) process.exit(0);

// Find the next blank line after the marker to insert after it
const afterMarker = idx + marker.length;
const nextNewline = changelog.indexOf('\n', afterMarker);
const insertAt = nextNewline + 1;

// Avoid duplicate entries (same hash already present)
if (changelog.includes(hash)) process.exit(0);

changelog = changelog.slice(0, insertAt) + bullet + '\n' + changelog.slice(insertAt);
fs.writeFileSync(changelogPath, changelog);
