// Video studio — the rights rule and the render plan, tested WITHOUT ffmpeg.
// The studio only ever renders AR7-owned media: that is what makes its output
// genuinely copyright-free, as opposed to "edited enough to maybe dodge
// Content ID", which is infringement and gets channels struck.

import { resolveOwnedImages, ffmpegArgs } from './video-studio.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  \u2713 ' + label); }
  else { fail++; console.error('  \u2717 ' + label); }
};

console.log('1) Only AR7-owned media is accepted');
{
  const { accepted, refused } = resolveOwnedImages([
    '/assets/covers/cargo-ship-at-sea.webp',                       // owned, on disk
    'https://picture1.goo-net.com/070/some/car.jpg',               // supplier CDN — NOT ours
    'https://cdn.example.com/viral-car-video-frame.jpg',           // random internet
    '/etc/passwd',                                                 // outside /assets
    '/assets' + '/does-not-exist-xyz.webp'                         // not on disk (split so the asset-refs scanner skips this deliberate miss)
  ]);
  ok(accepted.length === 1 && accepted[0].img === '/assets/covers/cargo-ship-at-sea.webp',
    'exactly the owned, on-disk asset is accepted');
  ok(refused.length === 4, 'everything else is refused');
  const gooNet = refused.find(r => /goo-net/.test(r.img));
  ok(gooNet && /not AR7-owned|third-party/.test(gooNet.reason),
    'a supplier-CDN frame is refused BY NAME of the rights rule — the studio never edits third-party footage');
  ok(refused.find(r => r.img === '/etc/passwd'), 'paths outside /assets are refused');
}

console.log('\n2) The render plan is honest about format and duration');
{
  const shorts = ffmpegArgs({ files: ['/a.webp', '/b.webp', '/c.webp'], out: '/tmp/x.mp4', format: 'shorts', seconds: 3.5 });
  ok(shorts.width === 1080 && shorts.height === 1920, 'shorts render 9:16 (1080x1920) — the Shorts/TikTok/Reels frame');
  ok(Math.abs(shorts.durationSeconds - (3.5 * 3 - 1.0)) < 0.01, 'duration = clips minus crossfade overlap');
  const wide = ffmpegArgs({ files: ['/a.webp'], out: '/tmp/y.mp4', format: 'wide' });
  ok(wide.width === 1920 && wide.height === 1080, 'wide renders 16:9 for long-form');
  const joined = shorts.args.join(' ');
  ok(/zoompan/.test(joined) && /xfade/.test(joined), 'Ken Burns zoom + crossfades are in the filter graph');
  ok(/libx264/.test(joined) && /faststart/.test(joined), 'H.264 + faststart — the upload format every platform accepts');
  let threw = false;
  try { ffmpegArgs({ files: [], out: '/tmp/z.mp4' }); } catch { threw = true; }
  ok(threw, 'zero accepted images refuses to render instead of producing an empty file');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
