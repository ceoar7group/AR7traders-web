// Stable catalogue entry points shared by the public footer and raw HTML.
// These describe categories rather than promising that a particular car is in
// stock. Model-specific links are generated from the current inventory instead.
export const CATALOGUE_LINKS = Object.freeze([
  ['/inventory', 'All Japanese vehicles'],
  ['/brands', 'Browse car brands'],
  ['/cars/toyota', 'Toyota vehicles'],
  ['/cars/nissan', 'Nissan vehicles'],
  ['/machinery', 'All construction machinery'],
  ['/machinery/excavators', 'Excavators'],
  ['/machinery/loaders', 'Wheel loaders'],
  ['/machinery/trucks', 'Trucks'],
  ['/machinery/cranes', 'Cranes']
]);
