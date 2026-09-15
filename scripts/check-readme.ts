import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const before = await readFile('README.md', 'utf8');
await promisify(execFile)(process.execPath, ['scripts/generate-readme.ts']);
if (before !== await readFile('README.md', 'utf8')) {
  throw new Error('README.md block reference was not up to date.');
}
process.stdout.write('README block reference is up to date.\n');
