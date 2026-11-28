// The 360° walkaround (npm run test:spin-view).
//
// 2026-11-25 (owner: "add a 3D/4D walkaround / 360° view with its own dedicated
// button, using the best free AI/tech for it"). What this suite pins:
//   • the frames are the listing's OWN photographs — evenly sampled, deduped,
//     bounded — so a phone never pulls a hundred images to turn a car around;
//   • the wording stays honest about how many photographs actually back the
//     spin (a three-photo "360°" is a slideshow and says so);
//   • it is free: no third-party viewer, no key, no network call, no new
//     dependency — only the photos the listing already ships;
//   • it has its OWN button on the vehicle page, separate from Enlarge/zoom.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

const { spinFrames, spinLabel, MAX_FRAMES, PX_PER_FRAME } = await import('../src/spin-frames.js');
const { readFileSync } = await import('node:fs');

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

say('\n1) frames come from the listing, evenly and cheaply');
{
  const photos = Array.from({ length: 24 }, (_, i) => `/assets/inventory/car-${i}.webp`);
  ok(spinFrames(photos).length === 24, '24 photographs spin on all 24 frames');
  const many = Array.from({ length: 120 }, (_, i) => `/assets/inventory/big-${i}.webp`);
  const sampled = spinFrames(many);
  ok(sampled.length === MAX_FRAMES, `120 photographs are sampled down to ${MAX_FRAMES} frames`);
  ok(sampled.every(src => many.includes(src)), 'and every frame is a real photograph from that listing');
  ok(new Set(sampled).size === sampled.length, 'no frame repeats');
  ok(spinFrames([...photos, photos[0], photos[1]]).length === 24, 'duplicate paths are dropped');
  ok(spinFrames([]).length === 0 && spinFrames(null).length === 0, 'no photographs, no frames — never an invented one');
  ok(spinFrames([{ src: '/a.webp' }, '/b.webp', { nope: 1 }]).length === 2, 'object-shaped images are understood too');
}

say('\n2) the count is stated honestly');
{
  ok(/No photographs/.test(spinLabel(0)), 'zero photographs says so plainly');
  ok(/One photograph/.test(spinLabel(1)), 'one photograph is not called a 360°');
  ok(/3 photographs/.test(spinLabel(3)) && /Ask us for a full studio set/.test(spinLabel(3)),
    'three photographs are described as a loop, with the ask for a proper set');
  ok(/360° spin/.test(spinLabel(16)) && /16 photographs/.test(spinLabel(16)),
    'a full set is described as a 360° spin, with its real frame count');
}

say('\n3) free tech only');
{
  const view = read('src/spin-view.jsx');
  const frames = read('src/spin-frames.js');
  ok(!/https?:\/\//.test(view) && !/https?:\/\//.test(frames), 'no third-party viewer, CDN or API is called');
  const imports = (view.match(/^import .*$/gm) || []).join('\n');
  ok(!/babylon|model-viewer|sirv|cloudimage|@google/i.test(imports),
    'no paid spin service and no hosted viewer — only our own modules are imported');
  ok(/\nimport Walkaround3D from '\.\/walkaround-3d\.jsx';/.test(imports),
    'the 3D tab comes from our own module');
  // three.js is allowed, but ONLY behind a dynamic import in that module: it is
  // ~170 kB and no visitor should download it to look at a photograph.
  const three3d = read('src/walkaround-3d.jsx');
  ok(/await import\('three'\)/.test(three3d) && !/^import .*from 'three'/m.test(three3d),
    'three.js is fetched lazily, never on first paint');
  ok(/deviceorientation/.test(view), 'tilt steering uses the phone’s own sensor — free where it exists');
  ok(/requestPermission/.test(view), 'and asks iOS for permission instead of silently doing nothing');
  ok(/ArrowLeft/.test(view) && /ArrowRight/.test(view), 'the arrow keys turn the vehicle');
  ok(/onPointerDown/.test(view) && /onPointerMove/.test(view), 'and so does a drag or a swipe');
  ok(PX_PER_FRAME > 0, 'the drag ratio is a real number, not a magic constant in the component');
}

say('\n4) its own dedicated button, not folded into the gallery');
{
  const page = read('src/inner-page.jsx');
  ok(/className="gallery-spin"/.test(page), 'the vehicle page has a dedicated 360° button');
  ok(/<Rotate3d\/> 360° view/.test(page), 'labelled "360° view" with a rotation icon');
  ok(/const \[spinOpen, setSpinOpen\] = useState\(false\)/.test(page),
    'and its own state, so opening the spin never opens the zoom lightbox');
  ok(/spinOpen && <SpinView/.test(page), 'the viewer is mounted by that state alone');
  ok(/setSpinOpen\(false\)/.test(page), 'and closes on its own');
  const css = read('src/detail-v2.css');
  ok(/\.gallery-spin \{/.test(css) && /\.spin-overlay \{/.test(css), 'both the button and the overlay are styled');
  ok(/min-height: 44px/.test(css) || /min-height: 40px/.test(css), 'the controls keep a touch-sized target');
  ok(/position: fixed/.test(css), 'the viewer is a full-screen overlay');
}

say('');
say(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
