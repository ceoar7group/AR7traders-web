#!/usr/bin/env node
// Extract the small Amazon Linux compatibility set shipped with
// @sparticuz/chromium. This lets the bundled browser run in slim CI/dev
// containers without apt, while keeping the libraries and tarball in /tmp.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const archive = resolve(here, '../node_modules/@sparticuz/chromium/bin/al2023.tar.br');
const output = join(tmpdir(), 'chromelibs');

export function extractChromiumLibraries() {
  if (!existsSync(archive)) {
    throw new Error('Missing @sparticuz/chromium/al2023.tar.br — install @sparticuz/chromium first.');
  }
  mkdirSync(output, { recursive: true });
  if (existsSync(join(output, 'libnspr4.so')) && existsSync(join(output, 'libnss3.so'))) return output;

  const scratch = mkdtempSync(join(tmpdir(), 'ar7-chromium-libs-'));
  const tarball = join(scratch, 'al2023.tar');
  try {
    writeFileSync(tarball, brotliDecompressSync(readFileSync(archive)));
    // The archive contains only the browser compatibility libraries under
    // `lib/`; strip that one directory so LD_LIBRARY_PATH can name `output`.
    execFileSync('tar', ['-xf', tarball, '-C', output, '--strip-components=1'], { stdio: 'ignore' });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  if (!existsSync(join(output, 'libnspr4.so')) || !existsSync(join(output, 'libnss3.so'))) {
    throw new Error('Chromium compatibility libraries were not extracted correctly.');
  }
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(`Chromium compatibility libraries ready in ${extractChromiumLibraries()}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
