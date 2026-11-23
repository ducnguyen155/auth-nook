import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve('.');
const distNeuDir = join(root, 'dist', 'AuthNook');
const outDir = join(root, 'release', 'AuthNook-win-x64');
const zipPath = join(root, 'release', 'AuthNook-win-x64.zip');

const winExe = join(distNeuDir, 'AuthNook-win_x64.exe');
const resourcesNeu = join(distNeuDir, 'resources.neu');
const helperExe = join(root, 'bin', 'authnook-dpapi.exe');

if (!existsSync(winExe) || !existsSync(resourcesNeu)) {
  throw new Error('Missing Neutralino release build. Run "npm run build" first.');
}
if (!existsSync(helperExe)) {
  throw new Error('Missing Windows DPAPI helper. Run "npm run build:helper" first.');
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'bin'), { recursive: true });

cpSync(winExe, join(outDir, 'AuthNook.exe'));
cpSync(resourcesNeu, join(outDir, 'resources.neu'));
cpSync(helperExe, join(outDir, 'bin', 'authnook-dpapi.exe'));

rmSync(zipPath, { force: true });
execFileSync(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipPath}' -Force`,
  ],
  { stdio: 'inherit' }
);

console.log(`Packaged Windows portable bundle: ${outDir}`);
console.log(`Packaged Windows zip: ${zipPath}`);
