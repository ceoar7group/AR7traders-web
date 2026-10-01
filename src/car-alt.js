// One descriptive alt for a vehicle photo, used everywhere a car picture
// appears (card, dashboard, compare, related stock, detail gallery).
//
// Why not just `${make} ${model}`: a page of identical "Honda Vezel" captions
// tells a screen-reader user and an image search nothing about which car this
// is, and two cards of the same model become indistinguishable. The year and
// the colour are what actually differentiate them.
//
// Colour is only added when the row states one — nothing is invented. Every
// field here already renders on the card, so the alt describes the same car
// the visitor can see rather than a different one.
//
// Pure module: no DOM, no network — pinned by scripts/car-alt.test.mjs.

/** `2023 Rolls-Royce Ghost in Two-tone`, or '' for a missing car. */
export function carAlt(car) {
  if (!car) return '';
  const bits = [car.year, car.make, car.model]
    .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
    .map(v => String(v).trim());
  if (!bits.length) return '';
  const colour = car.col === null || car.col === undefined ? '' : String(car.col).trim();
  return colour ? `${bits.join(' ')} in ${colour}` : bits.join(' ');
}
