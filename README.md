# AR7 TRADERS — Global Car Export Website

Multi-page animated website for AR7 TRADERS (vehicle sourcing from Japanese auctions + worldwide export).
Green / gold / white branding. Day & night mode. 3D motion animations, live demo data, customer portal, signup/login, device view modes.

## Pages
- Home (#home) — animated landing, 3D globe, moving ship/car/routes
- Inventory (#inventory) — 15 demo vehicles with 5-picture galleries
- Auction (#auction) — auction access demo
- Shipping (#shipping) — worldwide routes & process
- Services (#services), Destinations (#destinations), Reviews (#reviews), FAQ (#faq), About (#about), Contact (#contact)
- Portal (#portal) — Shipments / Auctions / Documents / Payments (demo)
- Account (#account) — customer signup / login (demo)
- Studio (#studio) — Phone / Tablet / Laptop / PC preview modes

## How to run (any platform)
Requirements: Node.js 18+ (https://nodejs.org)

```
cd ar7-traders
npm install
npm run dev
```
Open http://localhost:5173

## Production build
```
npm run build
```
Output goes to the `dist/` folder — deploy that anywhere (Vercel, Netlify, cPanel, any static host).

## Tech
React 19 + Vite + lucide-react. Hash-based routing (works on any static host, no server config needed).

## Already deployed at
https://ar7-traders.vercel.app
