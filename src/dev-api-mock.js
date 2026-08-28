// Dev-only mock for /api/goonet-stock so the "Japan dealer stock" page has
// something to show in local previews (no Supabase keys needed). Never used
// in production — Vercel routes /api/* to the real serverless functions.
// The sample rows mirror the real importer output shape exactly.
const STOCK = [
  {
    id: 'dev-g1', goonet_id: '0710232A30260801W001', stock_no: '0710232A30260801W001',
    make: 'Toyota', model: 'Harrier S', year: 2023, km: '24,204', fuel: 'Petrol',
    body: 'SUV', price: '$21,000', price_jpy: 3090000, price_usd: 21000,
    grade: '4.5', status: 'New Arrival', location: 'Hyogo', tr: 'AT', drv: '2WD',
    eng: '2,000cc', seats: 5, col: 'Black', st: 'RHD', photo_count: 24,
    quality_score: 82, available: true, promoted: 'none', vendor: 'Goo-net',
    goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/0710232A30260801W001.html',
    imported_at: new Date(Date.now() - 2 * 864e5).toISOString(),
    image: 'https://picture1.goo-net.com/7000710232/30260801/J/70007102323026080100100.jpg',
    images: [
      'https://picture1.goo-net.com/7000710232/30260801/J/70007102323026080100100.jpg',
      'https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00101.jpg',
      'https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00102.jpg',
      'https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00103.jpg',
      'https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00104.jpg'
    ]
  },
  {
    id: 'dev-g2', goonet_id: '0208264A20260802D002', stock_no: '0208264A20260802D002',
    make: 'Toyota', model: 'Harrier Z Leather Package', year: 2023, km: '14,000',
    fuel: 'Petrol', body: 'SUV', price: '$28,100', price_jpy: 4130000, price_usd: 28100,
    grade: '4.5', status: 'New Arrival', location: 'Gifu', tr: 'AT', drv: '2WD',
    eng: '2,000cc', seats: 5, col: 'Silver Metallic', st: 'RHD', photo_count: 24,
    quality_score: 85, available: true, promoted: 'listings', vendor: 'Goo-net',
    goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/0208264A20260802D002.html',
    imported_at: new Date(Date.now() - 4 * 864e5).toISOString(),
    image: '/assets/inventory/988026080300208264002.jpg',
    images: ['/assets/inventory/988026080300208264002.jpg',
      'https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00201.jpg',
      'https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00202.jpg']
  },
  {
    id: 'dev-g3', goonet_id: '0541413A30260802W005', stock_no: '0541413A30260802W005',
    make: 'Toyota', model: 'Alphard 2.5S C Package', year: 2021, km: '56,661',
    fuel: 'Petrol', body: 'MPV', price: '$27,700', price_jpy: 4070000, price_usd: 27700,
    grade: '4.0', status: 'New Arrival', location: 'Chiba', tr: 'AT', drv: '2WD',
    eng: '2,500cc', seats: 7, col: 'Black', st: 'RHD', photo_count: 24,
    quality_score: 76, available: true, promoted: 'none', vendor: 'Goo-net',
    goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/0541413A30260802W005.html',
    imported_at: new Date(Date.now() - 6 * 864e5).toISOString(),
    image: '/assets/inventory/700054141330260802005.jpg',
    images: ['/assets/inventory/700054141330260802005.jpg',
      'https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00501.jpg']
  },
  {
    id: 'dev-g4', goonet_id: '1001974A30260726W001', stock_no: '1001974A30260726W001',
    make: 'Mazda', model: 'CX-30 20S L Package', year: 2021, km: '41,000',
    fuel: 'Petrol', body: 'SUV', price: '$14,100', price_jpy: 2070000, price_usd: 14100,
    grade: '4.0', status: 'New Arrival', location: 'Hiroshima', tr: 'AT', drv: '2WD',
    eng: '2,000cc', seats: 5, col: 'Gray Metallic', st: 'RHD', photo_count: 24,
    quality_score: 74, available: true, promoted: 'none', vendor: 'Goo-net',
    goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/1001974A30260726W001.html',
    imported_at: new Date(Date.now() - 8 * 864e5).toISOString(),
    image: '/assets/inventory/700100197430260726001.jpg',
    images: ['/assets/inventory/700100197430260726001.jpg',
      'https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00101.jpg']
  },
  {
    id: 'dev-g5', goonet_id: '0561037A30260717W002', stock_no: '0561037A30260717W002',
    make: 'Honda', model: 'Vezel Hybrid Z Honda Sensing', year: 2016, km: '46,353',
    fuel: 'Hybrid', body: 'SUV', price: '$21,100', price_jpy: 3100000, price_usd: 21100,
    grade: '4.5', status: 'New Arrival', location: 'Chiba', tr: 'AT', drv: '2WD',
    eng: '1,500cc', seats: 5, col: 'Pearl White', st: 'RHD', photo_count: 24,
    quality_score: 78, available: true, promoted: 'none', vendor: 'Goo-net',
    goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/0561037A30260717W002.html',
    imported_at: new Date(Date.now() - 10 * 864e5).toISOString(),
    image: '/assets/inventory/700056103730260717002.jpg',
    images: ['/assets/inventory/700056103730260717002.jpg',
      'https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00201.jpg']
  },
  {
    id: 'dev-g6', goonet_id: '0206487A30260816W003', stock_no: '0206487A30260816W003',
    make: 'Toyota', model: 'Crown Sports Z', year: 2025, km: '7,000', fuel: 'Hybrid',
    body: 'SUV', price: '$38,800', price_jpy: 5700000, price_usd: 38800,
    grade: '5.0', status: 'New Arrival', location: 'Aichi', tr: 'AT', drv: '4WD',
    eng: '2,500cc', seats: 5, col: 'Black', st: 'RHD', photo_count: 24,
    quality_score: 91, available: true, promoted: 'none', vendor: 'Goo-net',
    goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/0206487A30260816W003.html',
    imported_at: new Date(Date.now() - 3 * 864e5).toISOString(),
    image: 'https://picture1.goo-net.com/7000206487/30260816/J/70002064873026081600300.jpg',
    images: ['https://picture1.goo-net.com/7000206487/30260816/J/70002064873026081600300.jpg',
      'https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00301.jpg']
  },
  {
    id: 'dev-g7', goonet_id: '0200421A30260821W004', stock_no: '0200421A30260821W004',
    make: 'Toyota', model: 'Alphard Z', year: 2026, km: '101', fuel: 'Hybrid',
    body: 'MPV', price: '$42,100', price_jpy: 6190000, price_usd: 42100,
    grade: 'S', status: 'New Arrival', location: 'Aichi', tr: 'AT', drv: '2WD',
    eng: '2,500cc', seats: 7, col: 'Black', st: 'RHD', photo_count: 24,
    quality_score: 94, available: true, promoted: 'none', vendor: 'Goo-net',
    goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/0200421A30260821W004.html',
    imported_at: new Date(Date.now() - 1 * 864e5).toISOString(),
    image: 'https://picture1.goo-net.com/7000200421/30260821/Q/70002004213026082100400.jpg',
    images: ['https://picture1.goo-net.com/7000200421/30260821/Q/70002004213026082100400.jpg',
      'https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00401.jpg']
  },
  {
    id: 'dev-g8', goonet_id: '0207429A30260819W007', stock_no: '0207429A30260819W007',
    make: 'Toyota', model: 'Land Cruiser 250 VX', year: 2024, km: '15,000',
    fuel: 'Petrol', body: 'SUV', price: '$38,700', price_jpy: 5690000, price_usd: 38700,
    grade: '5.0', status: 'New Arrival', location: 'Aichi', tr: 'AT', drv: '4WD',
    eng: '2,700cc', seats: 7, col: 'Black', st: 'RHD', photo_count: 24,
    quality_score: 89, available: true, promoted: 'none', vendor: 'Goo-net',
    goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/0207429A30260819W007.html',
    imported_at: new Date(Date.now() - 5 * 864e5).toISOString(),
    image: 'https://picture1.goo-net.com/7000207429/30260819/Q/70002074293026081900700.jpg',
    images: ['https://picture1.goo-net.com/7000207429/30260819/Q/70002074293026081900700.jpg',
      'https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00701.jpg']
  }
];

export function devApiMock() {
  return {
    name: 'ar7-dev-api-mock',
    configureServer(server) {
      server.middlewares.use('/api/goonet-stock', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(STOCK));
      });
    }
  };
}
