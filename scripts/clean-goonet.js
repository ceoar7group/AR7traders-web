// Run this once to clean up all bad data in the Goo-net importer pipeline.
//
// What it does:
//   1. Finds all cars with fewer than 8 photos → adds to blocklist → deletes
//   2. Finds all cars with missing/incorrect details → adds to blocklist → deletes
//
// After running, the scraper will no longer re-import these cars because
// their goonet_ids are stored in the goonet_blocklist table.
//
// Usage:
//   node scripts/clean-goonet.js
//
// Environment:
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const db = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function cleanup() {
  console.log('Starting Goo-net cleanup...\n');

  // 1. Find all cars with < 8 photos
  const { data: badPhotos, error: photosErr } = await db.from('japan_dealer_stock')
    .select('id, goonet_id, stock_no, make, model, photo_count, images')
    .or('photo_count.lt.8,images.is.null');

  if (photosErr) {
    console.error('Error fetching bad photos:', photosErr.message);
  }

  // Also check jsonb_array_length for images that exist but have fewer than 8
  const { data: carsWithImages, error: imgErr } = await db.from('japan_dealer_stock')
    .select('id, goonet_id, stock_no, make, model, photo_count, images')
    .not('images', 'is', null);

  let badImgCount = [];
  if (!imgErr && carsWithImages) {
    badImgCount = carsWithImages.filter(c => {
      try {
        const arr = typeof c.images === 'string' ? JSON.parse(c.images) : c.images;
        return Array.isArray(arr) && arr.length < 8;
      } catch { return false; }
    });
  }

  // Combine both sets of bad-photo cars
  const allBadPhotos = [...(badPhotos || []), ...badImgCount];
  // Deduplicate by id
  const seen = new Set();
  const uniqueBadPhotos = allBadPhotos.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  console.log(`Found ${uniqueBadPhotos.length} cars with insufficient photos (<8)`);

  // 2. Add to blocklist
  for (const car of uniqueBadPhotos) {
    await db.from('goonet_blocklist').upsert({
      goonet_id: car.goonet_id,
      stock_no: car.stock_no,
      reason: `Cleanup: only ${car.photo_count || 0} photos`,
      blocked_at: new Date().toISOString()
    }, { onConflict: 'goonet_id' });
  }

  // 3. Delete bad cars
  if (uniqueBadPhotos.length > 0) {
    const ids = uniqueBadPhotos.map(c => c.id);
    const { error: delErr } = await db.from('japan_dealer_stock')
      .delete()
      .in('id', ids);
    if (delErr) {
      console.error('Error deleting bad photo cars:', delErr.message);
    } else {
      console.log(`Deleted ${ids.length} cars with insufficient photos`);
    }
  }

  // 4. Find cars with missing details
  const { data: allCars, error: allErr } = await db.from('japan_dealer_stock')
    .select('id, goonet_id, stock_no, make, model, year, price_jpy, price');

  if (allErr) {
    console.error('Error fetching all cars:', allErr.message);
  }

  const badDetails = (allCars || []).filter(c =>
    !c.make || c.make === '' || c.make === 'Unknown' ||
    !c.model || c.model === '' || c.model === 'Car' ||
    !c.year || c.year < 2000 ||
    ((c.price_jpy === null || c.price_jpy === undefined || String(c.price_jpy) === '0') &&
     (c.price === null || c.price === undefined || String(c.price) === '0'))
  );

  console.log(`Found ${badDetails.length} cars with missing/incorrect details`);

  // 5. Add to blocklist and delete
  for (const car of badDetails) {
    await db.from('goonet_blocklist').upsert({
      goonet_id: car.goonet_id,
      stock_no: car.stock_no,
      reason: `Cleanup: missing details (make:${car.make}, model:${car.model}, year:${car.year}, price:${car.price_jpy || car.price})`,
      blocked_at: new Date().toISOString()
    }, { onConflict: 'goonet_id' });
  }

  if (badDetails.length > 0) {
    const ids = badDetails.map(c => c.id);
    const { error: delErr } = await db.from('japan_dealer_stock')
      .delete()
      .in('id', ids);
    if (delErr) {
      console.error('Error deleting bad detail cars:', delErr.message);
    } else {
      console.log(`Deleted ${ids.length} cars with bad details`);
    }
  }

  // 6. Summary
  const { count: remaining } = await db.from('japan_dealer_stock').select('*', { count: 'exact', head: true });
  const { count: blocked } = await db.from('goonet_blocklist').select('*', { count: 'exact', head: true });

  console.log('\n--- Cleanup Summary ---');
  console.log(`Cars with <8 photos deleted: ${uniqueBadPhotos.length}`);
  console.log(`Cars with bad details deleted: ${badDetails.length}`);
  console.log(`Remaining cars in stock: ${remaining || 0}`);
  console.log(`Total blocked IDs: ${blocked || 0}`);
  console.log('\nCleanup complete!');
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
