#!/usr/bin/env node
// Video studio — renders copyright-safe promo videos from AR7-OWNED media.
//
// 2026-11-11 owner request: "for youtube you can generate copyright free
// videos … and edit them in a way that they can go viral without getting
// copyright strike".
//
// THE RIGHTS RULE, ENCODED IN CODE: this studio only accepts local
// /assets/… files — media that ships in this repository and that AR7 owns.
// It REFUSES remote URLs (supplier CDNs, marketplaces, other platforms):
// downloading someone else's footage and re-editing it to dodge detection is
// not "copyright-free", it is infringement — Content ID fingerprints survive
// trims, crops, speed changes and filters, and strikes terminate channels.
// A video built from owned photographs has nothing to strike.
//
// Output: Ken Burns slideshow (slow zoom per photo, crossfades), 9:16
// (Shorts/TikTok/Reels) by default or 16:9 with --format wide. Text hooks
// and spec overlays are deliberately left to each platform's NATIVE editor —
// native text renders sharper and platforms distribute native-tooled posts
// better (see src/social-playbooks.js).
//
// Usage:
//   npm run video -- --ref AR7-MC-001                 # machine's own gallery
//   npm run video -- --images /assets/a.webp,/assets/b.webp --out .tmp/videos/x.mp4
//   npm run video -- --ref AR7-MC-003 --format wide --seconds 4
//
// ffmpeg: uses `ffmpeg` from PATH, or the optional `ffmpeg-static` package
// (npm i --no-save ffmpeg-static). Without either it prints what to install
// and exits 1 — it never pretends a render happened.

import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Only AR7-owned media: local /assets paths that exist in public/. */
export function resolveOwnedImages(images, { root = ROOT } = {}) {
  const accepted = [], refused = [];
  for (const raw of images || []) {
    const img = String(raw || '').trim();
    if (!img) continue;
    if (/^https?:\/\//i.test(img)) { refused.push({ img, reason: 'remote URL — not AR7-owned media; the studio never edits third-party footage' }); continue; }
    if (!img.startsWith('/assets/')) { refused.push({ img, reason: 'outside /assets/ — only repository media is accepted' }); continue; }
    const onDisk = join(root, 'public', img.replace(/^\//, ''));
    if (!existsSync(onDisk)) { refused.push({ img, reason: 'file not found in public/' }); continue; }
    accepted.push({ img, path: onDisk });
  }
  return { accepted, refused };
}

/** The ffmpeg invocation, pure — tested without running ffmpeg. */
export function ffmpegArgs({ files = [], out, format = 'shorts', seconds = 3.5, fps = 30 } = {}) {
  if (!files.length) throw new Error('No owned images to render — nothing was produced.');
  if (!out) throw new Error('An --out path is required.');
  const [w, h] = format === 'wide' ? [1920, 1080] : [1080, 1920];
  const frames = Math.max(1, Math.round(seconds * fps));
  const args = ['-y'];
  for (const f of files) args.push('-loop', '1', '-t', String(seconds), '-i', f);
  // Per input: cover-scale to the frame, then a slow Ken Burns zoom (1.0→1.12).
  const chains = files.map((_, i) =>
    `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
    `zoompan=z='min(zoom+0.0016,1.12)':d=${frames}:s=${w}x${h}:fps=${fps}[v${i}]`);
  let filter = chains.join(';');
  if (files.length > 1) {
    // Chained crossfades, 0.5s each.
    let acc = 'v0';
    const fadeParts = [];
    for (let i = 1; i < files.length; i++) {
      const next = i === files.length - 1 ? 'vout' : `x${i}`;
      const offset = (seconds - 0.5) * i;
      fadeParts.push(`[${acc}][v${i}]xfade=transition=fade:duration=0.5:offset=${offset.toFixed(2)}[${next}]`);
      acc = next;
    }
    filter += ';' + fadeParts.join(';');
  } else {
    filter += ';[v0]copy[vout]';
  }
  args.push('-filter_complex', filter, '-map', '[vout]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', out);
  return { args, width: w, height: h, durationSeconds: seconds * files.length - 0.5 * Math.max(0, files.length - 1) };
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = name => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : null; };
  const ref = opt('ref');
  let images = (opt('images') || '').split(',').map(s => s.trim()).filter(Boolean);
  const format = opt('format') === 'wide' ? 'wide' : 'shorts';
  const seconds = Math.min(8, Math.max(2, Number(opt('seconds')) || 3.5));

  if (ref) {
    const { MACHINES } = await import('../src/machinery-data.js');
    const machine = MACHINES.find(m => m.ref === ref);
    if (!machine) { console.error(`No machine with ref ${ref} in the catalogue.`); process.exit(1); }
    images = (machine.images || []).map(i => (typeof i === 'string' ? i : i?.src)).filter(Boolean);
    console.log(`# ${machine.brand} ${machine.model} (${ref}) — ${images.length} catalogue photo(s)`);
  }
  const { accepted, refused } = resolveOwnedImages(images);
  for (const r of refused) console.error(`refused: ${r.img} — ${r.reason}`);
  if (!accepted.length) {
    console.error('Nothing to render: no AR7-owned images were accepted. Only local /assets/… files are allowed.');
    process.exit(1);
  }
  const out = opt('out') || join(ROOT, '.tmp', 'videos', `${(ref || 'ar7-video').toLowerCase()}-${format}.mp4`);
  mkdirSync(dirname(out), { recursive: true });
  const plan = ffmpegArgs({ files: accepted.map(a => a.path), out, format, seconds });

  const bin = await (async () => {
    const onPath = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (!onPath.error) return 'ffmpeg';
    try {
      const staticPath = (await import('ffmpeg-static')).default;
      if (staticPath && existsSync(staticPath)) return staticPath;
    } catch { /* not installed */ }
    return null;
  })();
  if (!bin) {
    console.error('ffmpeg is not available. Install it (apt install ffmpeg) or run: npm i --no-save ffmpeg-static');
    console.error('No video was produced.');
    process.exit(1);
  }
  console.log(`Rendering ${accepted.length} photo(s) → ${plan.width}x${plan.height}, ~${plan.durationSeconds.toFixed(1)}s`);
  execFileSync(bin, plan.args, { stdio: 'inherit' });
  console.log(`\nDone: ${out}`);
  console.log('Add the hook text and spec overlays in the platform\u2019s NATIVE editor (sharper rendering, better distribution).');
  console.log('Upload with the Social agent\u2019s prepared title/description/tags from the draft\u2019s youtube caption.');
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) main().catch(e => { console.error(e.message); process.exit(1); });
