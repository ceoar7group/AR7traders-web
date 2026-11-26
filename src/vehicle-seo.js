// Vehicle snippets shared by the browser, search crawlers and social previews.
// Use only published listing facts; never invent availability or shipping costs.
export function vehicleSeo(car) {
  const name = [car?.year, car?.make, car?.model].filter(Boolean).join(' ').trim() || 'Vehicle';
  const brandedTitle = `${name} — Japan export | AR7 Traders`;
  const title = brandedTitle.length <= 65 ? brandedTitle : `${name} | AR7 Traders`;
  const facts = [];
  if (car?.km != null && String(car.km).trim()) facts.push(`${String(car.km).trim()} km`);
  if (car?.fuel) facts.push(String(car.fuel).trim());
  if (car?.tr) facts.push(String(car.tr).trim());
  if (car?.price != null && String(car.price).trim()) {
    const price = typeof car.price === 'number' && Number.isFinite(car.price) && car.price > 0
      ? `$${car.price.toLocaleString('en-US')}`
      : typeof car.price === 'string' && /^(?:(?:US\$|USD\s*|\$|JPY\s*|¥|EUR\s*|€|GBP\s*|£|AED\s*|PKR\s*)\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/i.test(car.price.trim())
        ? car.price.trim() : null;
    if (price && Number(String(price).replace(/[^0-9.]/g, '')) > 0) facts.push(`price ${price}`);
  }
  const detail = facts.length ? ` ${facts.join(' · ')}.` : '';
  const prefix = `${name} for export from Japan.${detail}`;
  const tail = ' View photos and specifications; request a quote for your port.';
  return [title, prefix.length + tail.length <= 165 ? prefix + tail : prefix];
}
