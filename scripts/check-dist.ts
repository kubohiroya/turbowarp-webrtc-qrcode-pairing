import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readdir, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const execFileAsync = promisify(execFile);

async function snapshot(): Promise<string> {
  const names = (await readdir('dist')).sort();
  const hash = createHash('sha256');
  for (const name of names) {
    hash.update(name);
    hash.update(await readFile(`dist/${name}`));
  }
  return hash.digest('hex');
}

const before = await snapshot();
await execFileAsync('pnpm', ['run', 'build']);
if (before !== await snapshot()) {
  throw new Error('Generated dist files are not reproducible.');
}
process.stdout.write('Generated dist files are reproducible.\n');
