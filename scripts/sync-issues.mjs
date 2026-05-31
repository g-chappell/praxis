#!/usr/bin/env node
// scripts/sync-issues.mjs — sync roadmap/roadmap.yml to GitHub issues + sub-issues + project board.
//
// Idempotent: each EPIC/STORY/TASK becomes an issue keyed by its roadmap ID
// (matched via the leading "ID:" in the title). Re-running updates bodies,
// links sub-issues, and ensures every issue is on the configured project.
//
// roadmap.yml is the canonical source; this script never reads from GitHub
// to mutate the roadmap.
//
// Usage:
//   node scripts/sync-issues.mjs           # apply changes
//   node scripts/sync-issues.mjs --dry-run # log what would happen
//   node scripts/sync-issues.mjs --no-project   # skip project board step
//   node scripts/sync-issues.mjs --no-subissues # skip sub-issue linking step

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../roadmap/yaml-lite.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const REPO = 'g-chappell/praxis';
const PROJECT_OWNER = 'g-chappell';
const PROJECT_NUMBER = 3;

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_PROJECT = process.argv.includes('--no-project');
const SKIP_SUBISSUES = process.argv.includes('--no-subissues');

function sh(cmd, { write = false } = {}) {
  if (DRY_RUN && write) {
    log(`  [dry-run] ${cmd.replace(/\n/g, ' ').slice(0, 200)}`);
    return '';
  }
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).trim();
}

function ghJson(cmd) {
  return JSON.parse(sh(cmd));
}

function log(msg) {
  process.stdout.write(msg + '\n');
}

function escapeForShellSingleQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ----- load roadmap -----
const yamlSrc = readFileSync(join(PROJECT_ROOT, 'roadmap/roadmap.yml'), 'utf8');
const roadmap = parse(yamlSrc);
const epics = roadmap.epics ?? [];
log(`Loaded roadmap: ${epics.length} epics`);

// ----- discover existing issues -----
log('Fetching existing repo issues…');
const existingIssues = ghJson(
  `gh issue list --repo ${REPO} --state all --limit 1000 --json number,title,labels,milestone,body`,
).map((i) => ({
  ...i,
  labelNames: (i.labels || []).map((l) => l.name).sort(),
  milestoneTitle: i.milestone?.title ?? null,
}));

const idRe = /^(EPIC-\d+|STORY-\d+|TASK-\d+):/;
const issueByRoadmapId = new Map();
for (const issue of existingIssues) {
  const m = issue.title.match(idRe);
  if (m) issueByRoadmapId.set(m[1], issue);
}
log(`  ${existingIssues.length} issues found; ${issueByRoadmapId.size} mapped by roadmap ID.`);

// ----- discover milestones -----
log('Fetching milestones…');
const milestones = ghJson(`gh api 'repos/${REPO}/milestones?state=all&per_page=100'`);
const milestoneByEpic = new Map();
for (const m of milestones) {
  const match = m.title.match(/^(EPIC-\d+):/);
  if (match) milestoneByEpic.set(match[1], { number: m.number, title: m.title });
}
log(`  ${milestoneByEpic.size} epic milestones found.`);

// ----- render bodies -----
function refMd(id, idToNum) {
  const n = idToNum.get(id);
  return n ? `[\`${id}\`](https://github.com/${REPO}/issues/${n}) (#${n})` : `\`${id}\``;
}

function renderEpicBody(epic, idToNum) {
  const stories = epic.stories.map((s) => `- ${refMd(s.id, idToNum)} — ${s.title}`).join('\n');
  return `**Epic** \`${epic.id}\` mirrors \`roadmap/roadmap.yml\`. Milestone: \`${epic.id}: ${epic.title}\`.

${(epic.description || '').trim()}

## Stories
${stories}

---
*Synced from \`roadmap/roadmap.yml\` by \`scripts/sync-issues.mjs\`. Edit the YAML and re-run the script.*
`;
}

function renderStoryBody(story, epic, idToNum) {
  const ac = (story.acceptance_criteria || []).map((a) => `- ${a}`).join('\n');
  const flow = (story.user_flow || []).map((s) => `1. ${s}`).join('\n');
  const oos = (story.out_of_scope || []).map((s) => `- ${s}`).join('\n');
  const tasks = story.tasks.map((t) => `- ${refMd(t.id, idToNum)} — ${t.title}`).join('\n');
  return `**Story** \`${story.id}\` mirrors \`roadmap/roadmap.yml\`. Parent epic: ${refMd(epic.id, idToNum)}.

${(story.description || '').trim()}

## Acceptance criteria
${ac || '_None recorded yet._'}

${flow ? `## User flow\n${flow}\n\n` : ''}${oos ? `## Out of scope\n${oos}\n\n` : ''}## Tasks
${tasks}

---
*Synced from \`roadmap/roadmap.yml\` by \`scripts/sync-issues.mjs\`.*
`;
}

function renderTaskBody(task, story, epic, idToNum) {
  const ac = (task.task_acceptance || []).map((a) => `- ${a}`).join('\n');
  const deps = (task.depends_on || []).map((d) => `- ${refMd(d, idToNum)}`).join('\n');
  const ws = (task.workspaces || []).map((w) => `\`${w}\``).join(', ');
  return `**Task** \`${task.id}\` mirrors \`roadmap/roadmap.yml\`. Parent story: ${refMd(story.id, idToNum)}. Epic: ${refMd(epic.id, idToNum)}.

${(task.description || '').trim()}

## Task acceptance
${ac || '_None recorded yet._'}

## Meta
- **Status:** \`${task.status}\`
- **Priority:** \`${task.priority}\`
- **Complexity:** \`${task.complexity}\`
- **Terminal:** ${task.is_terminal ? "yes — completing this satisfies the parent story's AC" : 'no'}
- **Workspaces:** ${ws || '_none_'}

${deps ? `## Depends on\n${deps}\n` : ''}
---
*Synced from \`roadmap/roadmap.yml\` by \`scripts/sync-issues.mjs\`.*
`;
}

// ----- ensure issue exists -----
function ensureIssue({ id, title, labels, milestone }) {
  const existing = issueByRoadmapId.get(id);
  if (existing) {
    log(`  exists: ${id} → #${existing.number}`);
    return existing.number;
  }
  const labelArgs = labels.map((l) => `--label ${escapeForShellSingleQuote(l)}`).join(' ');
  const milestoneArg = milestone ? `--milestone ${escapeForShellSingleQuote(milestone.title)}` : '';
  // Create with a stub body; we'll fill in the real body in pass B once IDs are known.
  const cmd = `gh issue create --repo ${REPO} --title ${escapeForShellSingleQuote(title)} --body ${escapeForShellSingleQuote(`(syncing from roadmap.yml — body will be filled by sync-issues.mjs)`)} ${labelArgs} ${milestoneArg}`;
  const url = sh(cmd, { write: true });
  if (DRY_RUN) return -1; // placeholder
  const num = parseInt(url.split('/').pop(), 10);
  log(`  created: ${id} → #${num} (${url})`);
  // Add it to the in-memory map so the second pass can reference it
  issueByRoadmapId.set(id, {
    number: num,
    title,
    labels: labels.map((name) => ({ name })),
    labelNames: [...labels].sort(),
    milestone: milestone ? { title: milestone.title } : null,
    milestoneTitle: milestone?.title ?? null,
    body: '',
  });
  return num;
}

function reconcileMeta({ id, title, labels, milestone }) {
  const existing = issueByRoadmapId.get(id);
  if (!existing) return; // created earlier in this run; no reconcile needed
  const num = existing.number;
  if (num < 0) return; // dry-run placeholder

  const wantedLabels = [...labels].sort();
  const labelsChanged =
    wantedLabels.length !== existing.labelNames.length ||
    wantedLabels.some((l, i) => l !== existing.labelNames[i]);
  const titleChanged = existing.title !== title;
  const wantedMs = milestone?.title ?? null;
  const milestoneChanged = existing.milestoneTitle !== wantedMs;

  if (!titleChanged && !labelsChanged && !milestoneChanged) return;

  const parts = [`gh issue edit ${num} --repo ${REPO}`];
  if (titleChanged) parts.push(`--title ${escapeForShellSingleQuote(title)}`);
  if (milestoneChanged) {
    parts.push(
      wantedMs ? `--milestone ${escapeForShellSingleQuote(wantedMs)}` : `--remove-milestone`,
    );
  }
  if (labelsChanged) {
    // remove every label that exists but isn't wanted, add every wanted that's missing
    for (const old of existing.labelNames) {
      if (!wantedLabels.includes(old))
        parts.push(`--remove-label ${escapeForShellSingleQuote(old)}`);
    }
    for (const w of wantedLabels) {
      if (!existing.labelNames.includes(w))
        parts.push(`--add-label ${escapeForShellSingleQuote(w)}`);
    }
  }
  sh(parts.join(' '), { write: true });
  const changedBits = [
    titleChanged && 'title',
    labelsChanged && 'labels',
    milestoneChanged && 'milestone',
  ]
    .filter(Boolean)
    .join('+');
  log(`  reconciled: ${id} (#${num}) — ${changedBits}`);
  // Reflect the change in the cache so subsequent passes see fresh values
  existing.title = title;
  existing.labelNames = wantedLabels;
  existing.labels = labels.map((name) => ({ name }));
  existing.milestoneTitle = wantedMs;
  existing.milestone = milestone ? { title: milestone.title } : null;
}

// ----- Pass A: ensure every epic/story/task has an issue -----
log('\n=== Pass A: ensure issues exist ===');
const idToNum = new Map();

for (const epic of epics) {
  const milestone = milestoneByEpic.get(epic.id);
  const spec = {
    id: epic.id,
    title: `${epic.id}: ${epic.title}`,
    labels: ['type:epic'],
    milestone,
  };
  const num = ensureIssue(spec);
  reconcileMeta(spec);
  idToNum.set(epic.id, num);
}

for (const epic of epics) {
  const milestone = milestoneByEpic.get(epic.id);
  for (const story of epic.stories) {
    const spec = {
      id: story.id,
      title: `${story.id}: ${story.title}`,
      labels: ['type:story'],
      milestone,
    };
    const num = ensureIssue(spec);
    reconcileMeta(spec);
    idToNum.set(story.id, num);
  }
}

for (const epic of epics) {
  const milestone = milestoneByEpic.get(epic.id);
  for (const story of epic.stories) {
    for (const task of story.tasks) {
      const labels = ['type:task', `priority:${task.priority}`, `complexity:${task.complexity}`];
      if (task.is_terminal) labels.push('is-terminal');
      const spec = {
        id: task.id,
        title: `${task.id}: ${task.title}`,
        labels,
        milestone,
      };
      const num = ensureIssue(spec);
      reconcileMeta(spec);
      idToNum.set(task.id, num);
    }
  }
}

// ----- Pass B: update bodies with cross-references -----
log('\n=== Pass B: update issue bodies ===');

function updateBody(id, body) {
  const num = idToNum.get(id);
  if (!num || num < 0) return;
  const existing = issueByRoadmapId.get(id);
  if (existing && existing.body === body) {
    log(`  unchanged: ${id} (#${num})`);
    return;
  }
  const cmd = `gh issue edit ${num} --repo ${REPO} --body ${escapeForShellSingleQuote(body)}`;
  sh(cmd, { write: true });
  log(`  updated:   ${id} (#${num})`);
}

for (const epic of epics) {
  updateBody(epic.id, renderEpicBody(epic, idToNum));
}
for (const epic of epics) {
  for (const story of epic.stories) {
    updateBody(story.id, renderStoryBody(story, epic, idToNum));
  }
}
for (const epic of epics) {
  for (const story of epic.stories) {
    for (const task of story.tasks) {
      updateBody(task.id, renderTaskBody(task, story, epic, idToNum));
    }
  }
}

// ----- Pass C: link sub-issues via GraphQL -----
if (!SKIP_SUBISSUES) {
  log('\n=== Pass C: link sub-issues ===');

  // We need GitHub node IDs (not numbers) for the addSubIssue mutation.
  const nodeIdCache = new Map();
  function nodeId(num) {
    if (nodeIdCache.has(num)) return nodeIdCache.get(num);
    const q = `repository(owner:"${PROJECT_OWNER}",name:"praxis"){issue(number:${num}){id}}`;
    const out = sh(
      `gh api graphql -f query=${escapeForShellSingleQuote(`{${q}}`)} --jq .data.repository.issue.id`,
    );
    nodeIdCache.set(num, out);
    return out;
  }

  function linkSubIssue(parentNum, childNum) {
    if (parentNum < 0 || childNum < 0) return; // dry-run placeholders
    const parentId = nodeId(parentNum);
    const childId = nodeId(childNum);
    const mutation = `mutation { addSubIssue(input: { issueId: "${parentId}", subIssueId: "${childId}" }) { issue { number } subIssue { number } } }`;
    try {
      sh(`gh api graphql -f query=${escapeForShellSingleQuote(mutation)}`, { write: true });
      log(`  linked: #${childNum} → parent #${parentNum}`);
    } catch {
      // Likely already linked, or sub-issues not enabled. Surface message but continue.
      log(`  skip:   #${childNum} → #${parentNum} (already linked or API rejected)`);
    }
  }

  for (const epic of epics) {
    const epicNum = idToNum.get(epic.id);
    for (const story of epic.stories) {
      const storyNum = idToNum.get(story.id);
      linkSubIssue(epicNum, storyNum);
      for (const task of story.tasks) {
        const taskNum = idToNum.get(task.id);
        linkSubIssue(storyNum, taskNum);
      }
    }
  }
}

// ----- Pass D: ensure each issue is on the project board -----
if (!SKIP_PROJECT) {
  log('\n=== Pass D: add issues to project board ===');

  // Fetch existing project items once
  const items = ghJson(
    `gh project item-list ${PROJECT_NUMBER} --owner ${PROJECT_OWNER} --format json --limit 1000`,
  );
  const itemsOnBoard = new Set();
  for (const it of items.items ?? []) {
    if (it?.content?.url) itemsOnBoard.add(it.content.url);
  }
  log(`  ${itemsOnBoard.size} items already on board.`);

  for (const [id, num] of idToNum) {
    if (num < 0) continue;
    const url = `https://github.com/${REPO}/issues/${num}`;
    if (itemsOnBoard.has(url)) {
      // already there
      continue;
    }
    sh(`gh project item-add ${PROJECT_NUMBER} --owner ${PROJECT_OWNER} --url ${url}`, {
      write: true,
    });
    log(`  added: ${id} (#${num}) → board`);
  }
}

log('\nDone.');
