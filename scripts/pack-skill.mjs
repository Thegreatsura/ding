import { copyFileSync, mkdirSync } from 'node:fs';

const skill = new URL('../.agents/skills/ding/SKILL.md', import.meta.url);
const destination = 'skills/ding';

mkdirSync(destination, { recursive: true });
copyFileSync(skill, `${destination}/SKILL.md`);
