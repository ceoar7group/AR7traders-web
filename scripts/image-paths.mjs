// The photographs the 2026-10 WebP pass (B1) renamed.
//
// Single source of truth for the photo hotfix. The pass moved each of these
// from `<stem>.jpg` to `<stem>.webp` in public/assets and rewrote every
// reference in the repo — but not the rows already stored in Supabase, so cars
// uploaded before the pass still ask for the old name and render as ALT text.
//
// Three layers repair that, and all three are generated from this list so they
// can never drift:
//   1. vercel.json rewrites  — old URL -> .webp sibling (network layer);
//   2. src/image-fallback.js — one retry per <img> against the sibling
//                              extension (app layer);
//   3. supabase/MIGRATION-2026-10-image-paths.sql — UPDATEs that clean the
//                              stored paths (database layer).
//
// Stems only, on purpose: scripts/asset-refs.test.mjs fails on a literal
// `.jpg` that names a photo now shipping as `.webp`, so no file in the repo
// may spell the old extension out next to one of these names.
//
// Regenerate with: node scripts/generate-image-hotfix.mjs

export const RENAMED_PHOTOS = [
  'gallery/lexus-lc-500-01',
  'gallery/lexus-lc-500-02',
  'gallery/lexus-lc-500-03',
  'gallery/lexus-lc-500-04',
  'gallery/lexus-lc-500-05',
  'inventory/700052000730260404001',
  'inventory/700054141330260802005',
  'inventory/700056103730260717002',
  'inventory/700071023230260801001',
  'inventory/700100197430260726001',
  'inventory/988026080300208264002',
  'japan-used-car-export-inventory-toyota-h-1',
  'japan-used-car-export-inventory-toyota-h-2',
  'japan-used-car-export-inventory-toyota-h-3',
  'japan-used-car-export-inventory-toyota-h-4',
  'japan-used-car-export-inventory-toyota-h-5',
  'japan-used-car-export-stock-honda-vezel--1',
  'japan-used-car-export-stock-honda-vezel--2',
  'japan-used-car-export-stock-honda-vezel--3',
  'japan-used-car-export-stock-honda-vezel--4',
  'japan-used-car-export-stock-honda-vezel--5',
  'japanese-car-auction-inspection-shipping-1',
  'japanese-car-auction-inspection-shipping-2',
  'japanese-car-auction-inspection-shipping-3',
  'lux/audi-r8',
  'lux/bentley-continental-gt',
  'lux/bmw-m8-competition',
  'lux/bugatti-chiron',
  'lux/ferrari-f8-tributo',
  'lux/lamborghini-huracan',
  'lux/lexus-lc-500',
  'lux/mclaren-720s',
  'lux/mercedes-amg-gt',
  'lux/porsche-911-turbo-s',
  'lux/rolls-royce-cullinan',
  'lux/rolls-royce-ghost',
  'used-japanese-cars-auction-export-toyota-1',
  'used-japanese-cars-auction-export-toyota-2',
  'used-japanese-cars-auction-export-toyota-4',
  'used-japanese-cars-auction-export-toyota-5',];

/** Old URL for a renamed photo. */
export const oldPath = stem => '/assets/' + stem + '.jpg';

/** New URL for a renamed photo (the file that actually ships). */
export const newPath = stem => '/assets/' + stem + '.webp';
