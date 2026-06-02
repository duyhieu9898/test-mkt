/**
 * Codegen: read the vendored marketing-skill SKILL.md files and emit a single
 * TS module (`src/knowledge/skill-knowledge.generated.ts`) so the framework text
 * is available at runtime without any filesystem reads — works under both
 * `tsx watch` (dev) and `tsup` bundles (prod).
 *
 * Run: pnpm --filter @1person/core gen:skills
 * Source of truth: src/knowledge/marketing-skills/<name>/SKILL.md (MIT, Corey Haines)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'src', 'knowledge', 'marketing-skills');
const OUT_FILE = join(__dirname, '..', 'src', 'knowledge', 'skill-knowledge.generated.ts');

/** Parse the YAML frontmatter (name + description) and return [meta, body]. */
function parse(md: string): { name?: string; description?: string; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { body: md.trim() };
  const fm = m[1];
  const body = m[2].trim();
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  // description may be a single long line
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, description, body };
}

const entries: Record<string, { name: string; description: string; body: string }> = {};

for (const dir of readdirSync(SKILLS_DIR)) {
  const skillPath = join(SKILLS_DIR, dir);
  if (!statSync(skillPath).isDirectory()) continue;
  const file = join(skillPath, 'SKILL.md');
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    continue; // no SKILL.md (e.g. stray dir)
  }
  const { name, description, body } = parse(raw);
  const key = name || dir;
  entries[key] = { name: key, description: description || '', body };
}

const sorted = Object.keys(entries).sort();
const banner = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: src/knowledge/marketing-skills/<name>/SKILL.md (MIT, Corey Haines).
 * Regenerate: pnpm --filter @1person/core gen:skills
 * ${sorted.length} marketing-skill frameworks.
 */`;

const body = `${banner}

export interface SkillKnowledge {
  name: string;
  description: string;
  body: string;
}

export const MARKETING_SKILL_KNOWLEDGE: Record<string, SkillKnowledge> = ${JSON.stringify(
  Object.fromEntries(sorted.map((k) => [k, entries[k]])),
  null,
  2,
)};

export const MARKETING_SKILL_NAMES = ${JSON.stringify(sorted)} as const;

export type MarketingSkillName = (typeof MARKETING_SKILL_NAMES)[number];
`;

writeFileSync(OUT_FILE, body, 'utf8');
console.log(`Generated ${OUT_FILE} with ${sorted.length} skills: ${sorted.join(', ')}`);
