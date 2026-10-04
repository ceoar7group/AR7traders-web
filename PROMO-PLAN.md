# AR7 promotion plan

Generated: 2026-10-04T10:04:02.851Z

19 campaigns available, 1 already run.

A promotion here is a reason to buy, not a countdown. Nothing in this plan
claims a deadline, a stock count or a discount that is not real — see the
header of scripts/promo-agent.mjs.

## Excavators on the China desk

- id: `machinery-excavators`  ·  kind: machinery-type  ·  **already run**
- target: `/machinery/excavators`
- channels: site, whatsapp, facebook, email
- From $46,500 FOB — 7 excavators on the desk

## Loaders on the China desk

- id: `machinery-loaders`  ·  kind: machinery-type  ·  not yet run
- target: `/machinery/loaders`
- channels: site, whatsapp, facebook, email
- From $34,500 FOB — 2 loaders on the desk

## Trucks on the China desk

- id: `machinery-trucks`  ·  kind: machinery-type  ·  not yet run
- target: `/machinery/trucks`
- channels: site, whatsapp, facebook, email
- From $39,400 FOB — 2 trucks on the desk

## Cranes on the China desk

- id: `machinery-cranes`  ·  kind: machinery-type  ·  not yet run
- target: `/machinery/cranes`
- channels: site, whatsapp, facebook, email
- From $120,000 FOB — 1 cranes on the desk

## Shipping to Kenya this month

- id: `destination-kenya`  ·  kind: destination  ·  not yet run
- target: `/destinations`
- channels: site, whatsapp, email
- Cars from Japan and machinery from China, quoted to Mombasa with the documents handled

## Shipping to Pakistan this month

- id: `destination-pakistan`  ·  kind: destination  ·  not yet run
- target: `/destinations`
- channels: site, whatsapp, email
- Cars from Japan and machinery from China, quoted to Karachi / Port Qasim with the documents handled

## Shipping to the UAE this month

- id: `destination-uae`  ·  kind: destination  ·  not yet run
- target: `/destinations`
- channels: site, whatsapp, email
- Cars from Japan and machinery from China, quoted to Jebel Ali with the documents handled

## Shipping to Tanzania this month

- id: `destination-tanzania`  ·  kind: destination  ·  not yet run
- target: `/destinations`
- channels: site, whatsapp, email
- Cars from Japan and machinery from China, quoted to Dar es Salaam with the documents handled

## Shipping to the UK this month

- id: `destination-uk`  ·  kind: destination  ·  not yet run
- target: `/destinations`
- channels: site, whatsapp, email
- Cars from Japan and machinery from China, quoted to Southampton / Felixstowe with the documents handled

## Shipping to Nigeria this month

- id: `destination-nigeria`  ·  kind: destination  ·  not yet run
- target: `/destinations`
- channels: site, whatsapp, email
- Cars from Japan and machinery from China, quoted to Lagos / Tin Can with the documents handled

## Fresh Toyota stock at Japanese auctions

- id: `brand-toyota`  ·  kind: brand  ·  not yet run
- target: `/cars/toyota`
- channels: site, whatsapp, facebook
- Auction sheets translated, condition reported honestly, shipped to your port

## Fresh Lexus stock at Japanese auctions

- id: `brand-lexus`  ·  kind: brand  ·  not yet run
- target: `/cars/lexus`
- channels: site, whatsapp, facebook
- Auction sheets translated, condition reported honestly, shipped to your port

## Fresh Nissan stock at Japanese auctions

- id: `brand-nissan`  ·  kind: brand  ·  not yet run
- target: `/cars/nissan`
- channels: site, whatsapp, facebook
- Auction sheets translated, condition reported honestly, shipped to your port

## Fresh Honda stock at Japanese auctions

- id: `brand-honda`  ·  kind: brand  ·  not yet run
- target: `/cars/honda`
- channels: site, whatsapp, facebook
- Auction sheets translated, condition reported honestly, shipped to your port

## Fresh Mazda stock at Japanese auctions

- id: `brand-mazda`  ·  kind: brand  ·  not yet run
- target: `/cars/mazda`
- channels: site, whatsapp, facebook
- Auction sheets translated, condition reported honestly, shipped to your port

## Fresh Mercedes-Benz stock at Japanese auctions

- id: `brand-mercedes-benz`  ·  kind: brand  ·  not yet run
- target: `/cars/mercedes-benz`
- channels: site, whatsapp, facebook
- Auction sheets translated, condition reported honestly, shipped to your port

## Fresh BMW stock at Japanese auctions

- id: `brand-bmw`  ·  kind: brand  ·  not yet run
- target: `/cars/bmw`
- channels: site, whatsapp, facebook
- Auction sheets translated, condition reported honestly, shipped to your port

## RoRo or container? The answer depends on your car

- id: `guide-roto-vs-container`  ·  kind: education  ·  not yet run
- target: `/news/roro-vs-container-which-shipping-method-fits-your-car`
- channels: blog, facebook, whatsapp
- A short guide to choosing the cheaper method for your vehicle and port

## What R, A and 4.5 mean on a Japanese auction sheet

- id: `guide-auction-sheet`  ·  kind: education  ·  not yet run
- target: `/news/auction-sheet-decoded-what-r-a-and-4-5-really-mean`
- channels: blog, facebook
- Read the grade before you bid — our translation guide

## Publishing

```bash
npm run promo:publish -- --id machinery-excavators
npm run promo:social  -- --id machinery-excavators
npm run promo:publish -- --none        # take the banner down
```

Publishing writes `public/promo.json`, which the site's promo bar reads on
the next deploy. Social copy is printed for you to send from the real
accounts — see "Publishing to social" in scripts/promo-agent.mjs for why.