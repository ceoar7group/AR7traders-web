# Supplier inbox

Drop a folder per supplier here. `npm run machinery:import` reads them and turns
them into catalogue listings — the same way Goo-net feeds the car side.

```
machinery-suppliers/
  shandong-partner/
    supplier.json
    photos/
      unit-1.jpg      ← photos of the actual machine, straight from the supplier
      unit-2.jpg
      unit-3.jpg
```

Run `npm run machinery:import` to preview, `npm run machinery:import -- --write`
to merge into the catalogue. The photos are branded with the AR7 mark and the
stock reference automatically.

The `_example/` folder is a template — delete it once you have a real one.

**Why the photos come from your supplier and not from a marketplace:**
see `MACHINERY-SOURCES.md`. Short version: the seller sends you photos because
they want the sale, and those photos are yours to use. Copying photographs off
a marketplace listing — watermarked or not — is not yours to use, and removing
a watermark makes it worse rather than better.

This folder is gitignored except for the README and the template, so supplier
commercial terms never land in the repository.
