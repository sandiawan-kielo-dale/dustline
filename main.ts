// DUSTLINE — Meridian Depot: the entrypoint for the threejs-fps-02 bounty.
// Node 22, standard library only. The playable game lives in game/ beside this
// file (plain static ES modules, three.js via an import map), and this program
// hands it in: it copies game/ and screenshots/ to the output directory and
// writes dossier.json there, the summary the judge reads, using the vendored
// make.fun library. Run it with `node main.ts` — outside the grader's
// container, MAKEFUN_OUTPUT_DIR=out node main.ts writes to ./out instead of
// /output. Serve the game locally with `node serve.ts`, then open
// http://localhost:8080.

import {
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(joinPath(root, 'game'), joinPath(outDir, 'game'), { recursive: true });
mkdirSync(joinPath(outDir, 'screenshots'), { recursive: true });
if (existsSync(joinPath(root, 'screenshots'))) {
  cpSync(joinPath(root, 'screenshots'), joinPath(outDir, 'screenshots'), { recursive: true });
}

// The scorer's caps (reference/gate.json) that shape this hand-in: at most 4
// screenshots, each at most 256 KiB; at most 993 files and 48 MiB under game/;
// the dossier's source text is capped at 163,840 bytes for the judge.
const dossierOptions = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};
writeFileSync(joinPath(outDir, 'dossier.json'), buildDossier(outDir, dossierOptions));
