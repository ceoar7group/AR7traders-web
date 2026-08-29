import React, { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from './supabase-client.js';
import {
  LayoutDashboard, Users, UserRound, CarFront, FileText, Ship, CheckSquare,
  Activity, LogOut, Search, Plus, Mail, MessageCircle, ChevronRight, ChevronLeft,
  Clock3, DollarSign, TrendingUp, BadgeCheck, X, Save, RefreshCw, Menu,
  ShieldCheck, Database, Trash2, Globe, Globe2, Newspaper, UserCog, ShieldAlert,
  Wallet, Settings, KeyRound, LogIn, ArrowLeft, Check, Ban, Send, Link2,
  Phone, Briefcase, Camera, Image, Images, Sun, Moon, Sparkles, Star,
  MoveLeft, MoveRight, Eye, LayoutGrid, List, Layers, Upload, ArrowRight,
  Maximize2, ZoomIn, ZoomOut, Copy, Play, Truck, Download
} from 'lucide-react';
import siteSeed from './site-content.seed.json';
import { CurrencyProvider, CrmCurrencyPicker, RateManager, CurrencyAmount, readCurrencyAmount, CurrencyBadge, useCurrency } from './currency.jsx';
import './crm.css';

const DEMO = import.meta.env.VITE_CRM_DEMO === 'true';

const PHOTO_PRESETS = [
  {
    id: 'audi-r8',
    label: 'Audi R8 V10 Series (5 angles)',
    make: 'Audi',
    photos: [
      '/assets/gallery/audi-r8-v10-01.webp',
      '/assets/gallery/audi-r8-v10-02.webp',
      '/assets/gallery/audi-r8-v10-03.webp',
      '/assets/gallery/audi-r8-v10-04.webp',
      '/assets/gallery/audi-r8-v10-05.webp'
    ]
  },
  {
    id: 'lexus-lc500',
    label: 'Lexus LC 500 Series (5 angles)',
    make: 'Lexus',
    photos: [
      '/assets/gallery/lexus-lc-500-01.jpg',
      '/assets/gallery/lexus-lc-500-02.jpg',
      '/assets/gallery/lexus-lc-500-03.jpg',
      '/assets/gallery/lexus-lc-500-04.jpg',
      '/assets/gallery/lexus-lc-500-05.jpg'
    ]
  },
  {
    id: 'toyota-landcruiser',
    label: 'Toyota Land Cruiser ZX Series (6 photos)',
    make: 'Toyota',
    photos: [
      '/assets/used-japanese-cars-auction-export-toyota-3.jpg',
      '/assets/japan-used-car-export-inventory-toyota-h-1.jpg',
      '/assets/japan-used-car-export-inventory-toyota-h-2.jpg',
      '/assets/japan-used-car-export-inventory-toyota-h-3.jpg',
      '/assets/japan-used-car-export-inventory-toyota-h-4.jpg',
      '/assets/japan-used-car-export-inventory-toyota-h-5.jpg'
    ]
  },
  {
    id: 'honda-vezel',
    label: 'Honda Vezel Hybrid Stock (5 photos)',
    make: 'Honda',
    photos: [
      '/assets/japan-used-car-export-stock-honda-vezel--1.jpg',
      '/assets/japan-used-car-export-stock-honda-vezel--2.jpg',
      '/assets/japan-used-car-export-stock-honda-vezel--3.jpg',
      '/assets/japan-used-car-export-stock-honda-vezel--4.jpg',
      '/assets/japan-used-car-export-stock-honda-vezel--5.jpg'
    ]
  },
  {
    id: 'toyota-mpv',
    label: 'Toyota Alphard / Noah MPV Stock (5 photos)',
    make: 'Toyota',
    photos: [
      '/assets/used-japanese-cars-auction-export-toyota-1.jpg',
      '/assets/used-japanese-cars-auction-export-toyota-2.jpg',
      '/assets/used-japanese-cars-auction-export-toyota-4.jpg',
      '/assets/used-japanese-cars-auction-export-toyota-5.jpg',
      '/assets/used-japanese-cars-auction-export-toyota-3.jpg'
    ]
  },
  {
    id: 'rolls-royce',
    label: 'Rolls-Royce Ghost & Cullinan (2 photos)',
    make: 'Rolls-Royce',
    photos: [
      '/assets/lux/rolls-royce-ghost.jpg',
      '/assets/lux/rolls-royce-cullinan.jpg'
    ]
  },
  {
    id: 'supercars-collection',
    label: 'Supercar Set (Ferrari, Lambo, Porsche, McLaren)',
    make: 'Supercars',
    photos: [
      '/assets/lux/ferrari-f8-tributo.jpg',
      '/assets/lux/lamborghini-huracan.jpg',
      '/assets/lux/porsche-911-turbo-s.jpg',
      '/assets/lux/mclaren-720s.jpg'
    ]
  },
  {
    id: 'grand-tourers',
    label: 'Luxury GTs (Bentley, AMG GT, BMW M8, Chiron)',
    make: 'Luxury',
    photos: [
      '/assets/lux/bentley-continental-gt.jpg',
      '/assets/lux/mercedes-amg-gt.jpg',
      '/assets/lux/bmw-m8-competition.jpg',
      '/assets/lux/bugatti-chiron.jpg'
    ]
  },
  {
    id: 'auction-inspection',
    label: 'Japan Yard Inspection & Port Prep (4 photos)',
    make: 'Inspection',
    photos: [
      '/assets/japanese-car-auction-inspection-shipping-1.jpg',
      '/assets/japanese-car-auction-inspection-shipping-2.jpg',
      '/assets/japanese-car-auction-inspection-shipping-3.jpg',
      '/assets/japanese-car-auction-inspection-shipping-5.webp'
    ]
  }
];

export function extractPhotos(item) {
  if (!item) return [];
  if (Array.isArray(item.images) && item.images.length) return item.images.filter(Boolean);
  if (typeof item.images === 'string' && item.images.trim()) {
    try {
      const parsed = JSON.parse(item.images);
      if (Array.isArray(parsed) && parsed.length) return parsed.filter(Boolean);
    } catch {
      const parts = item.images.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length) return parts;
    }
  }
  if (item.image) return [item.image];
  return [];
}

const seed = {
  leads: [
    { id: 'l1', name: 'Ahmed Khan', email: 'ahmed@example.com', phone: '+92 300 1234567', country: 'Pakistan', vehicle_interest: 'Toyota Land Cruiser 2022+', source: 'Website', status: 'qualified', budget: 65000, assigned_to: 'Sara Malik', next_follow_up: '2026-08-25', created_at: '2026-08-23T08:30:00Z' },
    { id: 'l2', name: 'Daniel Mwangi', email: 'daniel@example.com', phone: '+254 711 223344', country: 'Kenya', vehicle_interest: 'Lexus RX 450h', source: 'WhatsApp', status: 'new', budget: 42000, assigned_to: 'Omar Ali', next_follow_up: '2026-08-24', created_at: '2026-08-23T11:10:00Z' },
    { id: 'l3', name: 'James Wilson', email: 'james@example.com', phone: '+44 7700 900123', country: 'United Kingdom', vehicle_interest: 'Audi R8 V10', source: 'Referral', status: 'proposal', budget: 165000, assigned_to: 'Sara Malik', next_follow_up: '2026-08-26', created_at: '2026-08-22T15:40:00Z' },
    { id: 'l4', name: 'Fatima Noor', email: 'fatima@example.com', phone: '+971 50 1234567', country: 'UAE', vehicle_interest: 'Rolls-Royce Cullinan', source: 'Website', status: 'negotiation', budget: 220000, assigned_to: 'Omar Ali', next_follow_up: '2026-08-24', created_at: '2026-08-21T09:20:00Z' }
  ],
  customers: [
    { id: 'c1', name: 'Imran Khan', email: 'imran@example.com', phone: '+92 333 7654321', country: 'Pakistan', total_spend: 128500, vehicles_bought: 2, status: 'active', created_at: '2026-05-10T09:00:00Z' },
    { id: 'c2', name: 'Mary Wanjiku', email: 'mary@example.com', phone: '+254 722 445566', country: 'Kenya', total_spend: 43800, vehicles_bought: 1, status: 'active', created_at: '2026-06-18T09:00:00Z' },
    { id: 'c3', name: 'Oliver Brown', email: 'oliver@example.com', phone: '+44 7911 123456', country: 'United Kingdom', total_spend: 189000, vehicles_bought: 1, status: 'vip', created_at: '2026-04-02T09:00:00Z' }
  ],
  vehicles: [
    { id: 'v1', stock_no: 'AR7-260184', make: 'Audi', model: 'R8 V10', year: 2021, price: 155000, vendor: 'USS Auction', cost_price: 128000, freight_cost: 3200, duty_cost: 0, other_cost: 1800, status: 'available', location: 'Tokyo', steering: 'RHD', image: '/assets/gallery/audi-r8-v10-01.webp', images: ['/assets/gallery/audi-r8-v10-01.webp', '/assets/gallery/audi-r8-v10-02.webp', '/assets/gallery/audi-r8-v10-03.webp', '/assets/gallery/audi-r8-v10-04.webp', '/assets/gallery/audi-r8-v10-05.webp'] },
    { id: 'v2', stock_no: 'AR7-260185', make: 'Lexus', model: 'LC 500', year: 2021, price: 95000, vendor: 'TAA Auction', cost_price: 74200, freight_cost: 2800, duty_cost: 0, other_cost: 1400, status: 'reserved', location: 'Yokohama', steering: 'LHD', image: '/assets/gallery/lexus-lc-500-01.jpg', images: ['/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-05.jpg'] },
    { id: 'v3', stock_no: 'AR7-260186', make: 'Rolls-Royce', model: 'Ghost', year: 2023, price: 189000, vendor: 'Dealer network', cost_price: 162000, freight_cost: 4100, duty_cost: 0, other_cost: 2200, status: 'available', location: 'Yokohama', steering: 'RHD', image: '/assets/lux/rolls-royce-ghost.jpg', images: ['/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-cullinan.jpg'] },
    { id: 'v4', stock_no: 'AR7-260187', make: 'Toyota', model: 'Land Cruiser ZX', year: 2022, price: 58900, vendor: 'Goo-net', cost_price: 46800, freight_cost: 2100, duty_cost: 0, other_cost: 900, status: 'in_transit', location: 'Yokohama', steering: 'RHD', image: '/assets/used-japanese-cars-auction-export-toyota-3.jpg', images: ['/assets/used-japanese-cars-auction-export-toyota-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.jpg'] }
  ],
  goonet: [
    { id: 'g1', goonet_id: '0710232A30260801W001', stock_no: '0710232A30260801W001', make: 'Toyota', model: 'Harrier S', year: 2023, km: '24,204', fuel: 'Petrol', body: 'SUV', price: '$21,000', price_jpy: 3090000, price_usd: 21000, grade: '4.5', status: 'New Arrival', location: 'Hyogo', tr: 'AT', drv: '2WD', eng: '2,000cc', seats: 5, col: 'Black', st: 'RHD', photo_count: 24, quality_score: 82, available: true, promoted: 'none', vendor: 'Goo-net', imported_at: '2026-08-26T09:00:00Z', image: 'https://picture1.goo-net.com/7000710232/30260801/J/70007102323026080100100.jpg', images: ['https://picture1.goo-net.com/7000710232/30260801/J/70007102323026080100100.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00101.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00102.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00103.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00104.jpg'] },
    { id: 'g2', goonet_id: '0208264A20260802D002', stock_no: '0208264A20260802D002', make: 'Toyota', model: 'Harrier Z Leather Package', year: 2023, km: '14,000', fuel: 'Petrol', body: 'SUV', price: '$28,100', price_jpy: 4130000, price_usd: 28100, grade: '4.5', status: 'New Arrival', location: 'Gifu', tr: 'AT', drv: '2WD', eng: '2,000cc', seats: 5, col: 'Silver Metallic', st: 'RHD', photo_count: 24, quality_score: 85, available: true, promoted: 'listings', vendor: 'Goo-net', imported_at: '2026-08-24T09:00:00Z', image: '/assets/inventory/988026080300208264002.jpg', images: ['/assets/inventory/988026080300208264002.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00201.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00202.jpg'] },
    { id: 'g3', goonet_id: '1001974A30260726W001', stock_no: '1001974A30260726W001', make: 'Mazda', model: 'CX-30 20S L Package', year: 2021, km: '41,000', fuel: 'Petrol', body: 'SUV', price: '$14,100', price_jpy: 2070000, price_usd: 14100, grade: '4.0', status: 'New Arrival', location: 'Hiroshima', tr: 'AT', drv: '2WD', eng: '2,000cc', seats: 5, col: 'Gray Metallic', st: 'RHD', photo_count: 24, quality_score: 74, available: true, promoted: 'none', vendor: 'Goo-net', imported_at: '2026-08-20T09:00:00Z', image: '/assets/inventory/700100197430260726001.jpg', images: ['/assets/inventory/700100197430260726001.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00101.jpg'] },
    { id: 'g4', goonet_id: '0561037A30260717W002', stock_no: '0561037A30260717W002', make: 'Honda', model: 'Vezel Hybrid Z Honda Sensing', year: 2016, km: '46,353', fuel: 'Hybrid', body: 'SUV', price: '$21,100', price_jpy: 3100000, price_usd: 21100, grade: '4.5', status: 'New Arrival', location: 'Chiba', tr: 'AT', drv: '2WD', eng: '1,500cc', seats: 5, col: 'Pearl White', st: 'RHD', photo_count: 24, quality_score: 78, available: true, promoted: 'vehicles', vendor: 'Goo-net', imported_at: '2026-08-18T09:00:00Z', image: '/assets/inventory/700056103730260717002.jpg', images: ['/assets/inventory/700056103730260717002.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00201.jpg'] }
  ],
  quotes: [
    { id: 'q1', quote_no: 'Q-2026-1042', customer_name: 'Ahmed Khan', vehicle: 'Toyota Land Cruiser ZX', amount: 62750, status: 'sent', valid_until: '2026-08-30', created_at: '2026-08-23T10:00:00Z' },
    { id: 'q2', quote_no: 'Q-2026-1041', customer_name: 'James Wilson', vehicle: 'Audi R8 V10', amount: 161800, status: 'accepted', valid_until: '2026-08-28', created_at: '2026-08-22T10:00:00Z' },
    { id: 'q3', quote_no: 'Q-2026-1039', customer_name: 'Fatima Noor', vehicle: 'Rolls-Royce Cullinan', amount: 214500, status: 'draft', valid_until: '2026-09-01', created_at: '2026-08-21T10:00:00Z' }
  ],
  shipments: [
    { id: 's1', tracking_no: 'AR7-260184', customer_name: 'Imran Khan', vehicle: 'Toyota Land Cruiser ZX', origin: 'Yokohama', destination: 'Karachi', vessel: 'AR7 Valiant', status: 'at_sea', eta: '2026-09-08', progress: 68 },
    { id: 's2', tracking_no: 'AR7-260191', customer_name: 'Mary Wanjiku', vehicle: 'Lexus RX 450h', origin: 'Kobe', destination: 'Mombasa', vessel: 'Pacific Trader', status: 'loaded', eta: '2026-09-16', progress: 42 },
    { id: 's3', tracking_no: 'AR7-260198', customer_name: 'Oliver Brown', vehicle: 'Rolls-Royce Ghost', origin: 'Tokyo', destination: 'Southampton', vessel: 'Ever Glory', status: 'booking', eta: '2026-10-02', progress: 18 }
  ],
  tasks: [
    { id: 't1', title: 'Follow up with Ahmed on Land Cruiser quote', owner: 'Sara Malik', priority: 'high', status: 'open', due_date: '2026-08-24' },
    { id: 't2', title: 'Upload translated auction sheet for Lot 38214', owner: 'Omar Ali', priority: 'medium', status: 'in_progress', due_date: '2026-08-24' },
    { id: 't3', title: 'Confirm Karachi vessel booking', owner: 'Sara Malik', priority: 'high', status: 'open', due_date: '2026-08-25' },
    { id: 't4', title: 'Send arrival documents to UK customer', owner: 'Omar Ali', priority: 'low', status: 'done', due_date: '2026-08-23' }
  ],
  activities: [
    { id: 'a1', action: 'Quote Q-2026-1042 sent to Ahmed Khan', actor: 'Sara Malik', entity_type: 'quote', created_at: '2026-08-23T12:42:00Z' },
    { id: 'a2', action: 'New website lead received from Kenya', actor: 'System', entity_type: 'lead', created_at: '2026-08-23T11:10:00Z' },
    { id: 'a3', action: 'Shipment AR7-260184 milestone updated to At Sea', actor: 'Omar Ali', entity_type: 'shipment', created_at: '2026-08-23T09:18:00Z' },
    { id: 'a4', action: 'Audi R8 inventory record updated with new photo gallery', actor: 'Sara Malik', entity_type: 'vehicle', created_at: '2026-08-23T08:33:00Z' }
  ]
};

const tabs = [
  ['dashboard', 'Overview', LayoutDashboard],
  ['leads', 'Leads', Users],
  ['customers', 'Customers', UserRound],
  ['accounts', 'Customer accounts', Wallet],
  ['vehicles', 'Inventory', CarFront],
  ['sourcing', 'Profit & sourcing', DollarSign],
  ['goonet', 'Japan dealer stock', Globe2],
  ['quotes', 'Quotes', FileText],
  ['shipments', 'Shipments', Ship],
  ['tasks', 'Tasks', CheckSquare],
  ['listings', 'Website cars', Globe],
  ['routes', 'Shipping routes', Ship],
  ['articles', 'News & guides', Newspaper],
  ['approvals', 'Approvals', ShieldAlert],
  ['team', 'Team & permissions', UserCog],
  ['people', 'People & payroll', Briefcase],
  ['settings', 'Website settings', Settings],
  ['activities', 'Activity log', Activity]
];

const PERM_LABELS = {
  'leads.write': 'Add / edit leads',
  'customers.write': 'Add / edit customers',
  'vehicles.write': 'Add / edit inventory',
  'orders.write': 'Add / edit orders',
  'payments.write': 'Record & apply payments',
  'site.write': 'Edit the public website',
  'team.manage': 'Manage team members',
  'approvals.decide': 'Approve or reject requests',
  'delete.direct': 'Delete without approval',
  'customer.login_as': 'Open a customer account',
  'settings.write': 'Change website settings',
  'hr.view': 'View staff & performance',
  'hr.manage': 'Add / edit staff records',
  'payroll.view': 'View salaries & payslips',
  'payroll.manage': 'Run payroll & mark paid'
};

const ROLE_LIST = ['admin', 'manager', 'sales', 'accounts', 'viewer'];
const SITE_ENTITIES = ['listings', 'routes', 'articles'];

// ---------------------------------------------------------------------------
//  Field option sets — dropdowns replace free text so records stay clean,
//  filterable and consistent across the team.
// ---------------------------------------------------------------------------
const OPT = {
  countries: ['Pakistan', 'UAE', 'Kenya', 'Tanzania', 'United Kingdom', 'New Zealand', 'Australia', 'USA', 'South Africa', 'Ghana', 'Nigeria', 'Egypt', 'Jordan', 'Qatar', 'Saudi Arabia', 'Bangladesh', 'Sri Lanka', 'Japan', 'Other'],
  leadStatus: ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'],
  leadSource: ['Website', 'WhatsApp', 'Referral', 'Instagram', 'Facebook', 'YouTube', 'Walk-in', 'Other'],
  customerStatus: ['active', 'vip', 'dormant', 'blocked'],
  vehicleStatus: ['available', 'reserved', 'sold', 'in_preparation', 'in_transit', 'auction_watch'],
  listingStatus: ['In Stock', 'New Arrival', 'Auction', 'Reserved', 'Sold'],
  quoteStatus: ['draft', 'sent', 'accepted', 'declined', 'expired'],
  shipmentStatus: ['booking', 'documents', 'loaded', 'at_sea', 'customs', 'delivered'],
  taskStatus: ['open', 'in_progress', 'done'],
  taskPriority: ['low', 'medium', 'high', 'urgent'],
  steering: ['RHD', 'LHD'],
  fuel: ['Petrol', 'Hybrid', 'Plug-in Hybrid', 'Diesel', 'Electric'],
  body: ['Sedan', 'SUV', 'MPV', 'Hatchback', 'Luxury', 'Supercar', 'Hypercar', 'Van', 'Kei', 'Truck'],
  transmission: ['AT', 'CVT', 'DCT', 'MT'],
  drivetrain: ['2WD', '4WD', 'AWD', 'RWD'],
  currencies: ['USD', 'JPY', 'EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'AED', 'SAR', 'PKR', 'KES'],
  grade: ['S', '5.0', '4.5', '4.0', '3.5', '3.0', '2.5', 'R', 'RA'],
  articleCategory: ['MARKET WATCH', 'BUYING GUIDE', 'LOGISTICS', 'AUCTION', 'COMPANY'],
  vendors: ['Goo-net', 'USS Auction', 'TAA Auction', 'JU Auction', 'CAA Auction', 'Other Auction', 'Dealer network', 'Private sale', 'Trade-in', 'Other']
};
const YEAR_THIS = new Date().getFullYear();
const YEARS = Array.from({ length: YEAR_THIS - 1994 }, (_, i) => YEAR_THIS + 1 - i);

// Field tuple: [key, label, type, opts] — type: text|number|date|select|textarea|check|year
const configs = {
  leads: {
    title: 'Sales leads', subtitle: 'Capture, qualify and convert enquiries into sales.',
    statusOptions: OPT.leadStatus,
    fields: [
      ['name', 'Full name', 'text', { required: true, placeholder: 'e.g. Ahmed Khan', section: 'Contact' }],
      ['email', 'Email', 'text', { placeholder: 'name@email.com', section: 'Contact' }],
      ['phone', 'Phone / WhatsApp', 'text', { placeholder: '+92 300 1234567', section: 'Contact' }],
      ['country', 'Country', 'select', { options: OPT.countries, section: 'Contact' }],
      ['vehicle_interest', 'Vehicle interest', 'text', { placeholder: 'e.g. Toyota Land Cruiser 2022+', section: 'Interest' }],
      ['budget', 'Budget (USD)', 'number', { min: 0, step: 100, placeholder: '65000', section: 'Interest' }],
      ['source', 'Lead source', 'select', { options: OPT.leadSource, section: 'Interest' }],
      ['status', 'Pipeline stage', 'select', { options: OPT.leadStatus, section: 'Pipeline' }],
      ['assigned_to', 'Assigned agent', 'text', { placeholder: 'Who owns this lead?', section: 'Pipeline' }],
      ['next_follow_up', 'Next follow-up', 'date', { section: 'Pipeline' }],
      ['notes', 'Notes', 'textarea', { placeholder: 'Requirements, auction sheet questions, agreed terms…', section: 'Pipeline' }]
    ]
  },
  customers: {
    title: 'Customers', subtitle: 'Buyer profiles, order history and customer lifetime value.',
    statusOptions: OPT.customerStatus,
    fields: [
      ['name', 'Full name', 'text', { required: true, section: 'Contact' }],
      ['email', 'Email', 'text', { section: 'Contact' }],
      ['phone', 'Phone / WhatsApp', 'text', { section: 'Contact' }],
      ['country', 'Country', 'select', { options: OPT.countries, section: 'Contact' }],
      ['status', 'Status', 'select', { options: OPT.customerStatus, section: 'Account' }],
      ['total_spend', 'Total spend (USD)', 'number', { min: 0, section: 'Account' }],
      ['vehicles_bought', 'Vehicles bought', 'number', { min: 0, section: 'Account' }],
      ['notes', 'Notes', 'textarea', { placeholder: 'Preferences, payment terms, port of choice…', section: 'Account' }]
    ]
  },
  vehicles: {
    title: 'Vehicle inventory', subtitle: 'Showroom stock, Japan auction purchases and vehicles in preparation.',
    statusOptions: OPT.vehicleStatus,
    fields: [
      ['stock_no', 'Stock no.', 'text', { required: true, placeholder: 'AR7-260184', section: 'Identity' }],
      ['make', 'Make', 'text', { required: true, placeholder: 'Toyota', section: 'Identity' }],
      ['model', 'Model', 'text', { required: true, placeholder: 'Land Cruiser ZX', section: 'Identity' }],
      ['year', 'Year', 'year', { section: 'Identity' }],
      ['price', 'Selling price (USD)', 'number', { min: 0, step: 100, placeholder: '58900', section: 'Pricing & status' }],
      ['vendor', 'Sourcing vendor', 'select', { options: OPT.vendors, section: 'Pricing & status', hint: 'Where this vehicle was sourced — used for profit reporting' }],
      ['cost_price', 'Purchase cost (USD)', 'number', { min: 0, step: 100, placeholder: '52000', section: 'Pricing & status', hint: 'What you paid the vendor' }],
      ['freight_cost', 'Freight cost (USD)', 'number', { min: 0, step: 50, placeholder: '1800', section: 'Pricing & status' }],
      ['duty_cost', 'Duty / tax (USD)', 'number', { min: 0, step: 50, placeholder: '2400', section: 'Pricing & status' }],
      ['other_cost', 'Other costs (USD)', 'number', { min: 0, step: 50, placeholder: '600', section: 'Pricing & status', hint: 'Inspection, prep, docs, insurance…' }],
      ['sourcing_currency', 'Sourcing currency', 'select', { options: OPT.currencies, section: 'Pricing & status', hint: 'Currency the vehicle was purchased in (JPY for auctions, USD default)' }],
      ['status', 'Status', 'select', { options: OPT.vehicleStatus, section: 'Pricing & status' }],
      ['location', 'Location', 'text', { placeholder: 'Yokohama yard / USS Tokyo', section: 'Pricing & status' }],
      ['steering', 'Steering', 'select', { options: OPT.steering, section: 'Specs' }],
      ['colour', 'Colour', 'text', { section: 'Specs' }],
      ['interior', 'Interior', 'text', { section: 'Specs' }],
      ['image', 'Cover photo path', 'text', { placeholder: '/assets/… or https://…', section: 'Media & notes' }],
      ['notes', 'Notes', 'textarea', { placeholder: 'Auction grade, inspection remarks, preparation to-do…', section: 'Media & notes' }]
    ]
  },
  quotes: {
    title: 'Quotes', subtitle: 'FOB, CIF and landed-cost export proposals.',
    statusOptions: OPT.quoteStatus,
    fields: [
      ['quote_no', 'Quote no.', 'text', { required: true, placeholder: 'Q-2026-1042' }],
      ['customer_name', 'Customer', 'text', { required: true }],
      ['vehicle', 'Vehicle', 'text', { placeholder: '2022 Toyota Land Cruiser ZX' }],
      ['amount', 'Amount (USD)', 'number', { min: 0, step: 50 }],
      ['status', 'Status', 'select', { options: OPT.quoteStatus }],
      ['valid_until', 'Valid until', 'date'],
      ['notes', 'Notes', 'textarea', { placeholder: 'CIF breakdown, inclusions, conditions…' }]
    ]
  },
  shipments: {
    title: 'Shipments', subtitle: 'Port-to-port tracking, vessel bookings and milestone updates.',
    statusOptions: OPT.shipmentStatus,
    fields: [
      ['tracking_no', 'Tracking no.', 'text', { required: true, placeholder: 'AR7-260184' }],
      ['customer_name', 'Customer', 'text'],
      ['vehicle', 'Vehicle', 'text', { required: true }],
      ['origin', 'Origin port', 'text', { placeholder: 'Yokohama' }],
      ['destination', 'Destination port', 'text', { placeholder: 'Karachi' }],
      ['vessel', 'Vessel', 'text'],
      ['status', 'Status', 'select', { options: OPT.shipmentStatus }],
      ['eta', 'ETA', 'date'],
      ['progress', 'Progress %', 'number', { min: 0, max: 100, hint: '0–100' }],
      ['notes', 'Notes', 'textarea', { placeholder: 'Documents handed over, customs agent, BL number…' }]
    ]
  },
  listings: {
    title: 'Website cars', subtitle: 'Live inventory published on the public AR7 website showroom.',
    statusOptions: OPT.listingStatus,
    fields: [
      ['stock_no', 'Stock no.', 'text', { required: true, placeholder: 'AR7-26001', section: 'Identity' }],
      ['make', 'Make', 'text', { required: true, section: 'Identity' }],
      ['model', 'Model', 'text', { required: true, section: 'Identity' }],
      ['year', 'Year', 'year', { section: 'Identity' }],
      ['price', 'Display price', 'text', { placeholder: '$58,900', section: 'Pricing & status', hint: 'Shown verbatim on the website' }],
      ['status', 'Status badge', 'select', { options: OPT.listingStatus, section: 'Pricing & status' }],
      ['location', 'Location', 'text', { section: 'Pricing & status' }],
      ['published', 'Visible on website', 'check', { section: 'Pricing & status' }],
      ['km', 'Mileage', 'text', { placeholder: '18,400', section: 'Specs' }],
      ['fuel', 'Fuel', 'select', { options: OPT.fuel, section: 'Specs' }],
      ['body', 'Body type', 'select', { options: OPT.body, section: 'Specs' }],
      ['grade', 'Auction grade', 'select', { options: OPT.grade, section: 'Specs' }],
      ['tr', 'Transmission', 'select', { options: OPT.transmission, section: 'Specs' }],
      ['drv', 'Drivetrain', 'select', { options: OPT.drivetrain, section: 'Specs' }],
      ['eng', 'Engine', 'text', { placeholder: '3,500cc', section: 'Specs' }],
      ['seats', 'Seats', 'number', { min: 1, max: 12, section: 'Specs' }],
      ['col', 'Colour', 'text', { section: 'Details' }],
      ['st', 'Steering', 'select', { options: OPT.steering, section: 'Details' }],
      ['image', 'Cover photo path', 'text', { placeholder: '/assets/… (first gallery photo is used)', section: 'Details' }],
      ['sort_order', 'Sort order', 'number', { min: 0, section: 'Details', hint: 'Lower numbers appear first' }]
    ]
  },
  goonet: {
    title: 'Japan dealer stock', subtitle: 'Cars imported from Goo-net with quality-gated photos. Move the best ones to the website or CRM inventory.',
    statusOptions: ['New Arrival', 'In Stock', 'Reserved', 'Sold'],
    fields: [
      ['make', 'Make', 'text', { required: true, section: 'Identity' }],
      ['model', 'Model', 'text', { required: true, section: 'Identity' }],
      ['year', 'Year', 'year', { section: 'Identity' }],
      ['stock_no', 'Goo-net stock no.', 'text', { section: 'Identity' }],
      ['goonet_id', 'Goo-net car id', 'text', { section: 'Identity' }],
      ['price', 'Display price', 'text', { placeholder: '$21,000', section: 'Pricing & status' }],
      ['price_jpy', 'Asking price (JPY)', 'number', { min: 0, section: 'Pricing & status' }],
      ['price_usd', 'Est. price (USD)', 'number', { min: 0, section: 'Pricing & status' }],
      ['status', 'Status', 'select', { options: ['New Arrival', 'In Stock', 'Reserved', 'Sold'], section: 'Pricing & status' }],
      ['available', 'Visible on website', 'check', { section: 'Pricing & status', hint: 'Untick to delist from the Japan dealer stock page' }],
      ['km', 'Mileage', 'text', { placeholder: '24,000', section: 'Specs' }],
      ['fuel', 'Fuel', 'select', { options: OPT.fuel, section: 'Specs' }],
      ['body', 'Body type', 'select', { options: OPT.body, section: 'Specs' }],
      ['grade', 'Grade', 'select', { options: OPT.grade, section: 'Specs' }],
      ['tr', 'Transmission', 'select', { options: OPT.transmission, section: 'Specs' }],
      ['drv', 'Drivetrain', 'select', { options: OPT.drivetrain, section: 'Specs' }],
      ['eng', 'Engine', 'text', { placeholder: '2,000cc', section: 'Specs' }],
      ['seats', 'Seats', 'number', { min: 1, max: 12, section: 'Specs' }],
      ['col', 'Colour', 'text', { section: 'Details' }],
      ['st', 'Steering', 'select', { options: OPT.steering, section: 'Details' }],
      ['location', 'Location', 'text', { placeholder: 'Aichi', section: 'Details' }],
      ['photo_count', 'Photo count', 'number', { min: 0, section: 'Details' }],
      ['quality_score', 'Quality score', 'number', { min: 0, section: 'Details', hint: 'Set by the importer — higher is better' }],
      ['promoted', 'Promoted to', 'text', { section: 'Details', hint: 'none · listings · vehicles · both' }],
      ['image', 'Cover photo path', 'text', { section: 'Media & notes' }],
      ['goonet_url', 'Goo-net URL', 'text', { placeholder: 'https://www.goo-net.com/usedcar/spread/…', section: 'Media & notes' }]
    ]
  },
  routes: {
    title: 'Shipping routes', subtitle: 'Destinations and freight rates used by the shipping calculator.',
    fields: [
      ['country', 'Country', 'text', { required: true, section: 'Route' }],
      ['port', 'Port', 'text', { section: 'Route' }],
      ['transit', 'Transit time', 'text', { placeholder: '18–24 days', section: 'Route' }],
      ['popular', 'Popular models', 'text', { placeholder: 'Land Cruiser · Vezel · Mira', section: 'Route' }],
      ['freight_base', 'Base freight (USD)', 'number', { min: 0, section: 'Rates' }],
      ['duty_pct', 'Import duty %', 'number', { min: 0, max: 200, section: 'Rates' }],
      ['lon', 'Map longitude', 'number', { min: -180, max: 180, step: 0.0001, section: 'Map & visibility' }],
      ['lat', 'Map latitude', 'number', { min: -90, max: 90, step: 0.0001, section: 'Map & visibility' }],
      ['sort_order', 'Sort order', 'number', { min: 0, section: 'Map & visibility' }],
      ['published', 'Visible on website', 'check', { section: 'Map & visibility' }]
    ]
  },
  articles: {
    title: 'News & guides', subtitle: 'Market insights, export guides and company updates published on the site.',
    fields: [
      ['title', 'Headline', 'text', { required: true }],
      ['category', 'Category', 'select', { options: OPT.articleCategory }],
      ['date', 'Published date', 'text', { placeholder: 'Aug 18, 2026' }],
      ['read_min', 'Read minutes', 'number', { min: 1 }],
      ['image', 'Image path', 'text', { placeholder: '/assets/…' }],
      ['published', 'Visible on website', 'check'],
      ['sort_order', 'Sort order', 'number', { min: 0 }],
      ['excerpt', 'Excerpt', 'textarea', { rows: 2, placeholder: 'One-sentence teaser shown on cards' }],
      ['body', 'Body text', 'textarea', { rows: 8, placeholder: 'Full article. Blank line = new paragraph.' }]
    ]
  },
  tasks: {
    title: 'Tasks', subtitle: 'Customer follow-ups, inspection sheets and operational workflows.',
    statusOptions: OPT.taskStatus,
    fields: [
      ['title', 'Task', 'text', { required: true, placeholder: 'Follow up with Ahmed on Land Cruiser quote' }],
      ['owner', 'Owner', 'text'],
      ['priority', 'Priority', 'select', { options: OPT.taskPriority }],
      ['status', 'Status', 'select', { options: OPT.taskStatus }],
      ['due_date', 'Due date', 'date'],
      ['notes', 'Notes', 'textarea']
    ]
  }
};

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);
const pretty = s => (s || '').replaceAll('_', ' ').replace(/\b\w/g, x => x.toUpperCase());
const date = s => s ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(s)) : '—';
const todayKey = () => new Date().toISOString().slice(0, 10);
const isOverdue = d => !!d && String(d).slice(0, 10) < todayKey();
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// Multi-word statuses like "In Stock" cannot be CSS classes as-is — slug them.
const statusClass = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Download the current view as CSV so records can move into spreadsheets,
// accounting tools or WhatsApp without copy-paste drudgery.
function exportCsv(entity, rows) {
  const cols = tableColumns(entity).length ? tableColumns(entity) : Object.keys(rows[0] || {});
  const esc = v => {
    if (v == null) return '';
    if (Array.isArray(v)) v = v.join(' | ');
    if (typeof v === 'object') v = JSON.stringify(v);
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  };
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ar7-${entity}-${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function baseData(entity) {
  return SITE_ENTITIES.includes(entity) ? (siteSeed[entity] || []) : (seed[entity] || []);
}
function demoRead(entity) {
  const k = 'ar7-crm-' + entity;
  const stored = localStorage.getItem(k);
  return stored ? JSON.parse(stored) : baseData(entity);
}
function demoWrite(entity, rows) {
  localStorage.setItem('ar7-crm-' + entity, JSON.stringify(rows));
}

async function api(entity, token, options = {}) {
  const { id, ...init } = options;
  const base = entity === 'goonet' ? '/api/goonet-stock'
    : (SITE_ENTITIES.includes(entity) ? '/api/site-content' : '/api/crm');
  const url = base + '?entity=' + encodeURIComponent(entity) + (id ? '&id=' + encodeURIComponent(id) : '') + (SITE_ENTITIES.includes(entity) ? '&all=1' : '');
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(init.headers || {}) } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  return res.json();
}

async function call(path, token, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(options.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export default function CrmApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [rows, setRows] = useState({});
  const [query, setQuery] = useState('');
  const [who, setWho] = useState(null);
  const [editor, setEditor] = useState(null);
  const [photoTarget, setPhotoTarget] = useState(null);
  const [galleryView, setGalleryView] = useState(null);
  const [notice, setNotice] = useState('');
  const [mobile, setMobile] = useState(false);
  const [perms, setPerms] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [openCustomer, setOpenCustomer] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('ar7-crm-theme') || 'emerald');

  const handleThemeChange = newTheme => {
    setTheme(newTheme);
    localStorage.setItem('ar7-crm-theme', newTheme);
    document.documentElement.setAttribute('data-crm-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-crm-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (DEMO) {
      setSession({ access_token: 'demo', user: { email: 'admin@ar7traders.com' } });
      setProfile({ full_name: 'Demo Administrator', role: 'admin' });
      setLoading(false);
      return;
    }
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadAll();
  }, [session]);

  async function loadAll() {
    setLoading(true);
    const keys = [...Object.keys(seed), ...SITE_ENTITIES];
    try {
      if (DEMO) {
        const out = {};
        keys.forEach(k => out[k] = demoRead(k));
        setRows(out);
      } else {
        const me = await api('me', session.access_token);
        setProfile(me);
        try {
          setPerms(await call('/api/team?action=permissions', session.access_token));
        } catch { }
        const entries = await Promise.all(keys.map(async k => {
          try {
            return [k, await api(k, session.access_token)];
          } catch {
            return [k, []];
          }
        }));
        setRows(Object.fromEntries(entries));
      }
    } catch (e) {
      setNotice(e.message);
    } finally {
      setLoading(false);
    }
  }

  // One-click stock sync (admin only): makes the public website's car list
  // match the latest seed. Cars not in the seed are hidden, never deleted.
  async function syncWebsiteStock() {
    if (DEMO) { setNotice('Stock sync needs the live database — it is disabled in demo mode.'); return; }
    const ok = window.confirm(
      'Sync the public website stock to the latest seed?\n\n' +
      'The 25 seed cars (12 showroom + 13 Goo-net) will be published with their photo galleries.\n' +
      'Any car in the database that is NOT in the seed will be hidden (published=false — you can re-publish it later from this tab).'
    );
    if (!ok) return;
    setSyncing(true);
    try {
      const result = await call('/api/site-sync', session.access_token, { method: 'POST' });
      setNotice('Website stock synced: ' + (result.summary || 'done'));
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function save(entity, data) {
    try {
      if (DEMO) {
        const list = rows[entity] || [];
        const item = { ...data, id: data.id || crypto.randomUUID(), created_at: data.created_at || new Date().toISOString() };
        const next = data.id ? list.map(x => x.id === data.id ? item : x) : [item, ...list];
        demoWrite(entity, next);
        setRows(v => ({ ...v, [entity]: next }));
      } else {
        const result = await api(entity, session.access_token, { method: data.id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
        setRows(v => ({ ...v, [entity]: data.id ? v[entity].map(x => x.id === result.id ? result : x) : [result, ...(v[entity] || [])] }));
      }
      setEditor(null);
      setNotice('Saved successfully');
    } catch (e) {
      setNotice(e.message);
    }
  }

  // Move an imported Goo-net car to the public website and/or CRM inventory.
  async function goonetAction(row, action, target) {
    if (!row?.id) return;
    const label = `${row.make || ''} ${row.model || ''} (${row.stock_no || row.goonet_id || ''})`.trim();
    if (action === 'promote') {
      const prettyTarget = target === 'listings' ? 'Website cars' : target === 'vehicles' ? 'Inventory' : 'both';
      if (!window.confirm(`Move ${label} to ${prettyTarget}? The car is copied there and marked as promoted so the importer does not re-import it.`)) return;
    }
    try {
      if (DEMO) {
        if (action === 'promote') {
          const promoted = { ...row };
          if (target === 'listings' || target === 'both') {
            const existing = (rows.listings || []).find(l => String(l.stock_no) === String(row.stock_no || row.goonet_id));
            const listing = {
              stock_no: row.stock_no || row.goonet_id, make: row.make, model: row.model, year: row.year,
              km: row.km, fuel: row.fuel || 'Petrol', body: row.body || 'SUV', price: row.price || '$15,000',
              image: row.image, images: row.images, grade: row.grade || '4.0', status: 'In Stock',
              location: row.location || 'Japan', tr: row.tr, drv: row.drv, eng: row.eng, seats: row.seats,
              col: row.col, st: row.st, published: true, sort_order: existing ? existing.sort_order : (rows.listings || []).length + 13
            };
            const nextL = existing ? (rows.listings || []).map(l => l.id === existing.id ? { ...existing, ...listing } : l) : [listing, ...(rows.listings || [])];
            demoWrite('listings', nextL);
            setRows(v => ({ ...v, listings: nextL }));
          }
          if (target === 'vehicles' || target === 'both') {
            const vehicle = { id: crypto.randomUUID(), stock_no: row.stock_no || row.goonet_id, make: row.make, model: row.model, year: row.year, price: row.price_usd || 0, vendor: 'Goo-net', cost_price: row.price_usd || 0, status: 'available', location: row.location || 'Japan', steering: row.st, colour: row.col, image: row.image, images: row.images };
            demoWrite('vehicles', [vehicle, ...(rows.vehicles || [])]);
            setRows(v => ({ ...v, vehicles: [vehicle, ...(v.vehicles || [])] }));
          }
          promoted.promoted = target === 'both' ? 'both' : target;
          const next = (rows.goonet || []).map(x => x.id === row.id ? promoted : x);
          demoWrite('goonet', next);
          setRows(v => ({ ...v, goonet: next }));
          setNotice(`Moved ${label} to ${prettyTarget} (demo)`);
        } else if (action === 'delist') {
          const next = (rows.goonet || []).map(x => x.id === row.id ? { ...x, available: false, delisted_at: new Date().toISOString() } : x);
          demoWrite('goonet', next);
          setRows(v => ({ ...v, goonet: next }));
          setNotice(`Delisted ${label} (demo)`);
        }
        return;
      }
      const r = await call('/api/goonet-stock?action=' + action, session.access_token, { method: 'POST', body: JSON.stringify({ id: row.id, target, available: action === 'delist' ? false : undefined }) });
      setNotice(r.message || 'Done');
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    }
  }

  // Trigger one importer run (admin) — same code the scheduled cron calls.
  async function runGoonetSync() {
    if (DEMO) { setNotice('The Goo-net importer needs the live database — disabled in demo mode.'); return; }
    setSyncing(true);
    try {
      const r = await call('/api/goonet-sync', session.access_token, { method: 'POST' });
      const skipped = r.skipped?.length ? ` · skipped ${r.skipped.length}` : '';
      // A blocked run must not read like a clean one: the report's own note
      // says the bookmark was held, so no pages were silently skipped.
      setNotice(r.blocked
        ? `Importer blocked by goo-net — page ${r.page || '?'} gave ${r.cardsSeen ?? 0} card(s), nothing imported.${skipped} ${r.note || ''}`.trim()
        : `Importer run finished — page ${r.page || '?'}: ${r.inserted} imported, ${r.delisted} delisted, ${r.promoted} promoted${skipped}`);
      await loadAll();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function savePhotos(entity, row, photos) {
    const updated = { ...row, images: photos, image: photos[0] || row.image || '' };
    try {
      if (DEMO) {
        const list = rows[entity] || [];
        const next = list.map(x => x.id === row.id ? updated : x);
        demoWrite(entity, next);
        setRows(v => ({ ...v, [entity]: next }));
      } else {
        await api(entity, session.access_token, { method: 'PATCH', body: JSON.stringify(updated) });
        setRows(v => ({ ...v, [entity]: (v[entity] || []).map(x => x.id === row.id ? updated : x) }));
      }
      setNotice(`Updated photos for ${row.make || ''} ${row.model || row.stock_no || 'vehicle'}`);
      setPhotoTarget(null);
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function remove(entity, row) {
    if (!row?.id) return;
    const label = row.name || row.title || row.stock_no || row.quote_no || row.tracking_no || 'this record';
    const direct = (profile?.role || '') === 'admin' || hasPerm(perms, profile?.role, 'delete.direct');
    if (!confirm(direct ? `Delete ${label}? This cannot be undone.`
      : `Request approval to delete ${label}? An administrator must approve it.`)) return;
    try {
      if (DEMO) {
        const next = (rows[entity] || []).filter(x => x.id !== row.id);
        demoWrite(entity, next);
        setRows(v => ({ ...v, [entity]: next }));
      } else {
        const r = await api(entity, session.access_token, { method: 'DELETE', id: row.id });
        if (r && r.pending) {
          setEditor(null);
          setNotice('Sent to an administrator for approval.');
          return;
        }
        setRows(v => ({ ...v, [entity]: (v[entity] || []).filter(x => x.id !== row.id) }));
      }
      setEditor(null);
      setNotice('Record deleted');
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function signOut() {
    if (DEMO) {
      location.assign('/');
      return;
    }
    await supabase.auth.signOut();
    setSession(null);
  }

  if (loading && !session) return <div className="crm-boot"><RefreshCw /><span>Loading AR7 CRM…</span></div>;
  if (!supabase && !DEMO) return <CrmSetup />;
  if (!session) return <CrmLogin />;

  // Fast inline updates from list views (status dropdowns, publish toggles).
  async function quickPatch(entity, row, patch) {
    try {
      if (DEMO) {
        const next = (rows[entity] || []).map(x => x.id === row.id ? { ...x, ...patch } : x);
        demoWrite(entity, next);
        setRows(v => ({ ...v, [entity]: next }));
      } else {
        const result = await api(entity, session.access_token, { method: 'PATCH', body: JSON.stringify({ ...row, ...patch }) });
        setRows(v => ({ ...v, [entity]: (v[entity] || []).map(x => x.id === result.id ? result : x) }));
      }
      setNotice('Updated');
    } catch (e) {
      setNotice(e.message);
    }
  }

  const canDelete = (profile?.role || '') !== 'viewer';
  const SPECIAL = { dashboard: 'Dashboard', activities: 'Activity log', team: 'Team & permissions', approvals: 'Approvals', settings: 'Website settings', accounts: 'Customer accounts', people: 'People & payroll', sourcing: 'Profit & sourcing', goonet: 'Japan dealer stock' };
  const current = configs[tab];
  const heading = tab === 'dashboard' ? 'Good day, ' + (profile?.full_name?.split(' ')[0] || 'Team') : (SPECIAL[tab] || current?.title || '');
  const data = rows[tab] || [];
  const filtered = data.filter(x => JSON.stringify(x).toLowerCase().includes(query.toLowerCase()));

  return (
    <CurrencyProvider displayKey="ar7-crm-currency">
    <div className="crm-shell" data-crm-theme={theme}>
      <aside className={'crm-side ' + (mobile ? 'open' : '')}>
        <div className="crm-brand">
          <img src="/assets/ar7-mark.png" alt="AR7" />
          <div>
            <b>AR7 CRM</b>
            <small>COMMAND CENTER</small>
          </div>
          <button onClick={() => setMobile(false)} aria-label="Close menu"><X /></button>
        </div>
        <nav>
          {tabs.map(([id, label, I]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setMobile(false); setQuery(''); }}>
              <I />
              <span>{label}</span>
              {id === 'leads' && <em>{(rows.leads || []).filter(x => x.status === 'new').length}</em>}
              {id === 'vehicles' && <span className="crm-nav-count">{(rows.vehicles || []).length}</span>}
              {id === 'listings' && <span className="crm-nav-count">{(rows.listings || []).length}</span>}
              {id === 'goonet' && <span className="crm-nav-count">{(rows.goonet || []).filter(x => x.available !== false).length}</span>}
            </button>
          ))}
        </nav>
        <div className="crm-user">
          <button className="crm-user-open" onClick={() => setWho({ self: true })} title="Edit your profile">
            <span>{(profile?.full_name || session.user?.email || 'AR7').slice(0, 2).toUpperCase()}</span>
            <div>
              <b>{profile?.full_name || session.user?.email}</b>
              <small>{pretty(profile?.role || 'admin')}</small>
            </div>
            <UserCog size={15} />
          </button>
          <button className="crm-user-out" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut /></button>
        </div>
      </aside>

      {mobile && <div className="crm-side-shade" onClick={() => setMobile(false)} />}

      <main className="crm-main">
        <header className="crm-top">
          <button className="crm-menu" onClick={() => setMobile(true)} aria-label="Open menu"><Menu /></button>
          <div className="crm-top-title">
            <small>AR7 TRADERS / {tab.toUpperCase()}</small>
            <h1>{heading}</h1>
          </div>

          <div className="crm-top-controls">
            <CrmCurrencyPicker />
            <div className="crm-theme-switcher" title="Choose CRM color theme">
              <button
                className={`theme-pill ${theme === 'emerald' ? 'active' : ''}`}
                onClick={() => handleThemeChange('emerald')}
                title="Emerald Luxury Dark Theme"
              >
                <Sparkles size={13} />
                <span>Emerald</span>
              </button>
              <button
                className={`theme-pill ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleThemeChange('dark')}
                title="Obsidian Carbon Dark Theme"
              >
                <Moon size={13} />
                <span>Midnight</span>
              </button>
              <button
                className={`theme-pill ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handleThemeChange('light')}
                title="Porcelain Light Theme"
              >
                <Sun size={13} />
                <span>Light</span>
              </button>
            </div>

            <div className="crm-live"><i /> LIVE OPS</div>
            <a className="crm-site" href="/" title="Return to public website">Website <ChevronRight /></a>
          </div>
        </header>

        {notice && (
          <div className="crm-notice" onClick={() => setNotice('')}>
            <span>{notice}</span>
            <X size={15} />
          </div>
        )}

        {tab === 'dashboard' ? (
          <Dashboard rows={rows} setTab={setTab} onOpenPhotos={car => setGalleryView(car)} onManagePhotos={(entity, car) => setPhotoTarget({ entity, row: car })} onRunScraper={runGoonetSync} scraperSyncing={syncing} />
        ) : tab === 'activities' ? (
          <ActivityView rows={rows.activities || []} />
        ) : tab === 'team' ? (
          <TeamView token={session.access_token} profile={profile} perms={perms} setPerms={setPerms} notify={setNotice} onEdit={m => setWho({ member: m })} />
        ) : tab === 'approvals' ? (
          <ApprovalsView token={session.access_token} profile={profile} perms={perms} notify={setNotice} onChange={loadAll} />
        ) : tab === 'people' ? (
          <PeopleView token={session.access_token} profile={profile} perms={perms} notify={setNotice} />
        ) : tab === 'settings' ? (
          <SettingsView token={session.access_token} profile={profile} perms={perms} notify={setNotice} />
        ) : tab === 'accounts' ? (
          openCustomer ? (
            <CustomerAccount token={session.access_token} profile={profile} perms={perms} customerId={openCustomer} onBack={() => setOpenCustomer(null)} notify={setNotice} listings={rows.listings || []} />
          ) : (
            <AccountsList customers={rows.customers || []} onOpen={setOpenCustomer} />
          )
        ) : tab === 'sourcing' ? (
          <SourcingView rows={rows.vehicles || []} onOpenInventory={() => setTab('vehicles')} />
        ) : tab === 'goonet' ? (
          <GoonetStockView
            token={session.access_token}
            rows={rows.goonet || []}
            profile={profile}
            notify={setNotice}
            onEdit={data => setEditor({ entity: 'goonet', data })}
            onDelete={canDelete ? row => remove('goonet', row) : null}
            onManagePhotos={row => setPhotoTarget({ entity: 'goonet', row })}
            onViewGallery={row => setGalleryView(row)}
            onPromote={(row, target) => goonetAction(row, 'promote', target)}
            onDelist={row => goonetAction(row, 'delist')}
            onRun={runGoonetSync}
            onRefresh={loadAll}
            syncing={syncing}
          />
        ) : (
          <>
            <div className="crm-page-head">
              <div><p>{current.subtitle}</p></div>
              <div className="crm-tools">
                <label>
                  <Search />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder={'Search ' + tab + '…'} />
                </label>
                {filtered.length > 0 && (
                  <button onClick={() => exportCsv(tab, filtered)} title="Download these records as a CSV file">CSV</button>
                )}
                <button onClick={loadAll} title="Refresh records"><RefreshCw /></button>
                {tab === 'listings' && profile?.role === 'admin' && (
                  <button
                    className="crm-sync"
                    onClick={syncWebsiteStock}
                    disabled={syncing}
                    title="Make the public website stock match the latest seed (25 cars: 12 showroom + 13 Goo-net). Cars not in the seed are hidden, not deleted."
                  >
                    <RefreshCw className={syncing ? 'crm-sync-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync website stock to latest'}
                  </button>
                )}
                <button className="crm-add" onClick={() => setEditor({ entity: tab, data: {} })}>
                  <Plus /> Add {tab.slice(0, -1)}
                </button>
              </div>
            </div>
            <EntityView
              entity={tab}
              rows={filtered}
              onEdit={data => setEditor({ entity: tab, data })}
              onDelete={canDelete ? row => remove(tab, row) : null}
              onManagePhotos={row => setPhotoTarget({ entity: tab, row })}
              onViewGallery={row => setGalleryView(row)}
              onQuickPatch={(row, patch) => quickPatch(tab, row, patch)}
              statusOptions={configs[tab]?.statusOptions}
              query={query}
              onClearSearch={() => setQuery('')}
            />
          </>
        )}
      </main>

      {who && (
        <ProfileModal who={who} token={session.access_token} profile={profile} perms={perms} notify={setNotice} onClose={() => setWho(null)} onChanged={loadAll} />
      )}

      {editor && (
        <Editor
          entity={editor.entity}
          data={editor.data}
          onClose={() => setEditor(null)}
          onSave={x => save(editor.entity, x)}
          onDelete={canDelete && editor.data?.id ? () => remove(editor.entity, editor.data) : null}
          onDuplicate={editor.data?.id ? () => {
            const copy = { ...editor.data };
            delete copy.id; delete copy.created_at; delete copy.updated_at;
            if (copy.stock_no) copy.stock_no = copy.stock_no + '-COPY';
            if (copy.quote_no) copy.quote_no = copy.quote_no + '-COPY';
            setEditor({ entity: editor.entity, data: copy });
          } : null}
        />
      )}

      {photoTarget && (
        <VehiclePhotoManager
          entity={photoTarget.entity}
          row={photoTarget.row}
          onClose={() => setPhotoTarget(null)}
          onSave={photos => savePhotos(photoTarget.entity, photoTarget.row, photos)}
        />
      )}

      {galleryView && (
        <VehicleGalleryModal
          row={galleryView}
          onClose={() => setGalleryView(null)}
          onManagePhotos={() => {
            const r = galleryView;
            setGalleryView(null);
            const inGoonet = (rows.goonet || []).some(x => x.id === r.id);
            const inVehicles = (rows.vehicles || []).some(x => x.id === r.id);
            setPhotoTarget({ entity: inGoonet ? 'goonet' : (inVehicles ? 'vehicles' : 'listings'), row: r });
          }}
        />
      )}
    </div>
    </CurrencyProvider>
  );
}

function CrmLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div className="crm-login">
      <div className="crm-login-visual">
        <img src="/assets/ar7-logo.png" alt="AR7 Traders" />
        <div>
          <small>AR7 OPERATIONS</small>
          <h1>Every lead.<br />Every vehicle.<br /><em>One command center.</em></h1>
          <p>Secure sales, inventory photo management and export operations for the AR7 global team.</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <div className="crm-login-mark"><ShieldCheck /><span>AUTHORIZED STAFF ACCESS</span></div>
        <h2>Welcome back.</h2>
        <p>Sign in with your verified AR7 staff account.</p>
        {error && <div className="crm-error">{error}</div>}
        <label>EMAIL<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>PASSWORD<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'} <ChevronRight /></button>
        <small>Protected by Supabase Auth · Admin, Sales, Logistics and Accounts</small>
      </form>
    </div>
  );
}

function CrmSetup() {
  return (
    <div className="crm-setup">
      <Database />
      <span>SUPABASE CONNECTION REQUIRED</span>
      <h1>CRM is ready to connect.</h1>
      <p>Add the Supabase environment variables in Vercel to activate secure authentication, persistent records and photo management.</p>
      <div>
        <code>VITE_SUPABASE_URL</code>
        <code>VITE_SUPABASE_ANON_KEY</code>
        <code>SUPABASE_SERVICE_ROLE_KEY</code>
      </div>
      <a href="/">Return to website</a>
    </div>
  );
}

function Dashboard({ rows, setTab, onOpenPhotos, onManagePhotos, onRunScraper, scraperSyncing }) {
  const { fmt } = useCurrency();
  const leads = rows.leads || [];
  const quotes = rows.quotes || [];
  const shipments = rows.shipments || [];
  const tasks = rows.tasks || [];
  const vehicles = rows.vehicles || [];
  const listings = rows.listings || [];

  const pipeline = leads.filter(x => !['won', 'lost'].includes(x.status)).reduce((a, x) => a + (Number(x.budget) || 0), 0);
  const won = quotes.filter(x => x.status === 'accepted').reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const openLeads = leads.filter(x => !['won', 'lost'].includes(x.status));
  const overdueLeads = openLeads.filter(x => isOverdue(x.next_follow_up));
  const overdueTasks = tasks.filter(x => x.status !== 'done' && isOverdue(x.due_date));
  const awaitingQuotes = quotes.filter(x => x.status === 'sent');

  return (
    <div className="crm-dashboard">
      {(overdueLeads.length > 0 || overdueTasks.length > 0 || awaitingQuotes.length > 0) && (
        <div className="crm-alerts">
          <div className="crm-alerts-head">
            <ShieldAlert />
            <b>Action needed</b>
            <small>{overdueLeads.length + overdueTasks.length + awaitingQuotes.length} item(s) waiting on the team</small>
          </div>
          <div className="crm-alerts-grid">
            {overdueLeads.length > 0 && (
              <button onClick={() => setTab('leads')}>
                <b>{overdueLeads.length} overdue follow-up{overdueLeads.length > 1 ? 's' : ''}</b>
                <small>{overdueLeads.slice(0, 2).map(x => x.name).join(', ')}{overdueLeads.length > 2 ? '…' : ''}</small>
              </button>
            )}
            {overdueTasks.length > 0 && (
              <button onClick={() => setTab('tasks')}>
                <b>{overdueTasks.length} overdue task{overdueTasks.length > 1 ? 's' : ''}</b>
                <small>{overdueTasks.slice(0, 2).map(x => x.title).join(', ')}{overdueTasks.length > 2 ? '…' : ''}</small>
              </button>
            )}
            {awaitingQuotes.length > 0 && (
              <button onClick={() => setTab('quotes')}>
                <b>{awaitingQuotes.length} quote{awaitingQuotes.length > 1 ? 's' : ''} awaiting reply</b>
                <small>{fmt(awaitingQuotes.reduce((a, x) => a + (Number(x.amount) || 0), 0))} on the table</small>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="crm-kpis">
        {[
          [Users, 'Open leads', openLeads.length, leads.filter(x => x.status === 'new').length + ' new · ' + overdueLeads.length + ' overdue', 'trend-up'],
          [DollarSign, 'Pipeline value', fmt(pipeline), 'Across open opportunities', 'trend-gold'],
          [TrendingUp, 'Accepted quotes', fmt(won), quotes.filter(x => x.status === 'accepted').length + ' converted deals', 'trend-green'],
          [CarFront, 'Managed stock', vehicles.length + listings.length, vehicles.length + ' internal · ' + listings.length + ' website', 'trend-blue'],
          [Wallet, 'Stock profit potential', fmt(vehicles.filter(vehicleCost).reduce((a, v) => a + vehicleProfit(v), 0)), vehicles.filter(vehicleCost).length + ' vehicles with cost data', 'trend-green']
        ].map(([I, l, v, s, cls]) => (
          <article key={l} className={`kpi-card ${cls}`}>
            <i><I /></i>
            <span>{l}</span>
            <b>{v}</b>
            <small>{s}</small>
          </article>
        ))}
      </div>

      <div className="crm-dash-grid">
        <section className="crm-panel crm-pipeline">
          <div className="crm-panel-head">
            <div>
              <small>SALES PIPELINE</small>
              <h3>Lead conversion stages</h3>
            </div>
            <button onClick={() => setTab('leads')}>View all leads <ChevronRight /></button>
          </div>
          <div className="pipeline-bars">
            {['new', 'qualified', 'proposal', 'negotiation'].map(status => {
              const list = leads.filter(x => x.status === status);
              const count = list.length;
              const totalVal = list.reduce((a, x) => a + (Number(x.budget) || 0), 0);
              return (
                <div key={status} className="pipeline-row">
                  <span>
                    <b>{pretty(status)}</b>
                    <em>{count} leads</em>
                  </span>
                  <i><u style={{ width: Math.max(10, (count / Math.max(1, leads.length)) * 100) + '%' }} /></i>
                  <small>{fmt(totalVal)}</small>
                </div>
              );
            })}
          </div>
        </section>

        <section className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <small>FOLLOW UPS</small>
              <h3>Today & upcoming tasks</h3>
            </div>
            <button onClick={() => setTab('tasks')}>
              {tasks.filter(x => x.status !== 'done' && String(x.due_date || '').slice(0, 10) === todayKey()).length} due today <ChevronRight />
            </button>
          </div>
          <div className="crm-task-list">
            {[...tasks].filter(x => x.status !== 'done')
              .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
              .slice(0, 5).map(x => (
              <div key={x.id} className={isOverdue(x.due_date) ? 'overdue' : ''}>
                <i className={x.priority} />
                <span>
                  <b>{x.title}</b>
                  <small><Clock3 /> {date(x.due_date)} · {x.owner || 'Unassigned'}</small>
                </span>
                {isOverdue(x.due_date) ? <em className="crm-status overdue">Overdue</em> : <em className={'crm-status ' + statusClass(x.status)}>{pretty(x.status)}</em>}
              </div>
            ))}
            {!tasks.some(x => x.status !== 'done') && <div className="crm-dim">All clear — no open tasks.</div>}
          </div>
        </section>

        <section className="crm-panel">
          <div className="crm-panel-head">
            <div>
              <small>AUDIT TRAIL</small>
              <h3>Latest activity</h3>
            </div>
            <button onClick={() => setTab('activities')}>Full log <ChevronRight /></button>
          </div>
          <div className="crm-task-list">
            {(rows.activities || []).slice(0, 5).map(a => (
              <div key={a.id}>
                <i className="activity-dot" />
                <span>
                  <b>{a.action}</b>
                  <small>{a.actor} · {new Date(a.created_at).toLocaleString()}</small>
                </span>
              </div>
            ))}
            {!(rows.activities || []).length && <div className="crm-dim">No activity recorded yet.</div>}
          </div>
        </section>

        <section className="crm-panel crm-span">
          <div className="crm-panel-head">
            <div>
              <small>FEATURED VEHICLE SHOWROOM & PHOTOS</small>
              <h3>Stock photo gallery preview</h3>
            </div>
            <button onClick={() => setTab('vehicles')}>Inventory <ChevronRight /></button>
          </div>
          <div className="crm-quick-vehicle-grid">
            {(vehicles.length ? vehicles : listings).slice(0, 4).map(v => {
              const photos = extractPhotos(v);
              const cover = photos[0] || v.image || '/assets/ar7-mark.png';
              return (
                <article key={v.id || v.stock_no} className="dash-car-card">
                  <div className="dash-car-img" onClick={() => onOpenPhotos && onOpenPhotos(v)}>
                    <img src={cover} alt={`${v.make} ${v.model}`} />
                    <span className="dash-photo-pill"><Camera size={11} /> {photos.length} photos</span>
                    <em className={'crm-status ' + statusClass(v.status || 'available')}>{pretty(v.status || 'available')}</em>
                  </div>
                  <div className="dash-car-info">
                    <h4>{v.year} {v.make} {v.model}</h4>
                    <p><b>{fmt(v.price)}</b> · {v.location || 'Yokohama'}</p>
                    <div className="dash-car-actions">
                      <button onClick={() => onOpenPhotos && onOpenPhotos(v)}><Eye size={12} /> View</button>
                      <button onClick={() => onManagePhotos && onManagePhotos('vehicles', v)}><Camera size={12} /> Photos</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="crm-panel crm-span">
          <div className="crm-panel-head">
            <div>
              <small>LIVE LOGISTICS</small>
              <h3>Vehicles in transit across global ports</h3>
            </div>
            <button onClick={() => setTab('shipments')}>Operations <ChevronRight /></button>
          </div>
          <div className="crm-shipment-grid">
            {shipments.map(x => (
              <article key={x.id}>
                <span>
                  <b>{x.tracking_no}</b>
                  <em className={'crm-status ' + statusClass(x.status)}>{pretty(x.status)}</em>
                </span>
                <h4>{x.vehicle}</h4>
                <p>{x.origin} <i /> {x.destination}</p>
                <div><u style={{ width: x.progress + '%' }} /></div>
                <small>{x.vessel} · ETA {date(x.eta)}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="crm-panel crm-scraper-panel">
          <div className="crm-panel-head">
            <div>
              <small>GOO-NET SCRAPER</small>
              <h3>Japan dealer stock importer</h3>
            </div>
            <button onClick={() => setTab('goonet')}>Manage stock <ChevronRight /></button>
          </div>
          <div className="crm-scraper-body">
            <div className="crm-scraper-info">
              <Globe2 size={20} />
              <div>
                <p>Crawls Goo-net dealer listings, quality-gates photos and imports fresh stock automatically. The scheduler runs daily at 03:00 UTC.</p>
                <div className="crm-scraper-stats">
                  <span><b>{(rows.goonet || []).filter(x => x.available !== false).length}</b> available</span>
                  <span><b>{(rows.goonet || []).filter(x => x.promoted && x.promoted !== 'none').length}</b> promoted</span>
                  <span><b>{(rows.goonet || []).filter(x => x.available === false).length}</b> delisted</span>
                </div>
              </div>
            </div>
            <div className="crm-scraper-actions">
              <button
                className={'crm-scraper-run ' + (scraperSyncing ? 'is-running' : '')}
                onClick={onRunScraper}
                disabled={scraperSyncing}
                title="Trigger one importer run now — same as the scheduled daily run"
              >
                <Play size={15} className={scraperSyncing ? 'crm-sync-spin' : ''} />
                {scraperSyncing ? 'Scraping…' : 'Run scraper now'}
              </button>
              <small className="crm-scraper-note">Auto-run: daily at 03:00 UTC via GitHub Actions</small>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// Image fallback: if a photo path 404s or fails to load, swap to the AR7
// mark once instead of leaving a broken-image glyph in the inventory views.
function imgFallback(e) {
  const el = e.currentTarget;
  if (el.dataset.fallbackApplied) return;
  el.dataset.fallbackApplied = '1';
  el.src = '/assets/ar7-mark.png';
}

export function EntityView({ entity, rows, onEdit, onDelete, onManagePhotos, onViewGallery, onQuickPatch, statusOptions, query, onClearSearch, defaultViewMode = 'table' }) {
  const { fmt } = useCurrency();
  const [viewMode, setViewMode] = useState(defaultViewMode);
  const [chipFilter, setChipFilter] = useState('all');
  const [sort, setSort] = useState(null); // { key, dir: 'asc' | 'desc' }
  const leadFilter = chipFilter; // shared chip state, named for the leads branch below
  const isVehicleType = entity === 'vehicles' || entity === 'listings';

  // Reset the quick filters whenever the operator switches entity tab, so a
  // stale "sold" chip from Inventory never bleeds into Website cars.
  useEffect(() => {
    setChipFilter('all');
    setSort(null);
  }, [entity]);

  // Status chips (vehicles + listings): one chip per status present in the
  // data — ordered by the configured status options, extras appended — plus a
  // "No photos" chip that surfaces records with an empty gallery.
  const chipStatuses = useMemo(() => {
    if (!isVehicleType) return [];
    const present = [...new Set(rows.map(r => r.status).filter(Boolean))];
    const ordered = (statusOptions || []).filter(s => present.includes(s));
    const extras = present.filter(s => !ordered.includes(s));
    return [...ordered, ...extras];
  }, [isVehicleType, rows, statusOptions]);
  const noPhotosCount = isVehicleType ? rows.filter(r => extractPhotos(r).length === 0).length : 0;
  const chipCounts = id => id === 'all' ? rows.length
    : id === 'no_photos' ? noPhotosCount
      : rows.filter(r => r.status === id).length;
  const chipVisible = !isVehicleType || chipFilter === 'all' ? rows : rows.filter(r =>
    chipFilter === 'no_photos' ? extractPhotos(r).length === 0 : r.status === chipFilter
  );

  // Sorting (vehicles + listings table view): click a header to sort ascending,
  // click again to flip direction. Nulls always sink to the bottom.
  const toggleSort = key => setSort(s => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const sortValue = (row, key) => {
    if (key === 'photos') return extractPhotos(row).length;
    return row[key];
  };
  const sortedRows = useMemo(() => {
    if (!isVehicleType || viewMode !== 'table' || !sort) return chipVisible;
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...chipVisible].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [chipVisible, sort, isVehicleType, viewMode]);

  const statusPicker = (row, current) => (
    <select
      className={'crm-status crm-status-select ' + statusClass(current)}
      value={current ?? ''}
      title="Change status"
      onClick={e => e.stopPropagation()}
      onChange={e => onQuickPatch(row, { status: e.target.value })}
    >
      {current && !(statusOptions || []).includes(current) && <option value={current}>{pretty(current)}</option>}
      {(statusOptions || []).map(o => <option key={o} value={o}>{pretty(o)}</option>)}
    </select>
  );

  if (!rows.length) {
    const searching = query && query.trim();
    return (
      <div className="crm-empty">
        <Search />
        <h3>{searching ? 'No records match your search' : 'No records yet'}</h3>
        <p>{searching
          ? <>Nothing found for “{query}”. Try a different keyword or clear the search.</>
          : <>Add your first record with the <b>Add</b> button above.</>}</p>
        {searching && onClearSearch && (
          <button className="crm-chip active" onClick={onClearSearch}>Clear search</button>
        )}
      </div>
    );
  }

  if (entity === 'leads') {
    const isOpenLead = x => !['won', 'lost'].includes(x.status);
    const counts = {
      all: rows.length,
      overdue: rows.filter(x => isOpenLead(x) && isOverdue(x.next_follow_up)).length,
      new: rows.filter(x => x.status === 'new').length,
      open: rows.filter(x => ['qualified', 'proposal', 'negotiation'].includes(x.status)).length,
      won: rows.filter(x => x.status === 'won').length,
      lost: rows.filter(x => x.status === 'lost').length
    };
    const leadRows = leadFilter === 'all' ? rows : rows.filter(x =>
      leadFilter === 'overdue' ? isOpenLead(x) && isOverdue(x.next_follow_up)
        : leadFilter === 'open' ? ['qualified', 'proposal', 'negotiation'].includes(x.status)
          : x.status === leadFilter
    );
    // Follow-up control: "Done" marks it complete and clears the overdue
    // warning; the "Next" row schedules the following touch separately, so
    // the two actions can never be confused.
    const followDone = (x, next) => onQuickPatch(x, { next_follow_up: next });
    return (
      <div className="crm-lead-wrap">
        <div className="crm-chips">
          {[['all', 'All'], ['overdue', 'Overdue'], ['new', 'New'], ['open', 'In progress'], ['won', 'Won'], ['lost', 'Lost']].map(([id, label]) => (
            <button key={id} className={'crm-chip ' + (leadFilter === id ? 'active' : '') + (id === 'overdue' && counts.overdue > 0 ? ' alert' : '')} onClick={() => setChipFilter(id)}>
              {label} <em>{counts[id]}</em>
            </button>
          ))}
        </div>
        {!leadRows.length ? (
          <div className="crm-empty"><Search /><h3>No leads in this view</h3><p>Switch filters or add a new lead.</p></div>
        ) : (
          <div className="crm-lead-grid">
            {leadRows.map(x => (
              <article key={x.id}>
                <div>
                  <span>{(x.name || '?').slice(0, 2).toUpperCase()}</span>
                  {onQuickPatch && statusOptions ? statusPicker(x, x.status) : <em className={'crm-status ' + statusClass(x.status)}>{pretty(x.status)}</em>}
                </div>
                <h3>{x.name}</h3>
                <p>{x.vehicle_interest}</p>
                <dl>
                  <div><dt>Market</dt><dd>{x.country}</dd></div>
                  <div><dt>Budget</dt><dd>{fmt(x.budget)}</dd></div>
                  <div><dt>Owner</dt><dd>{x.assigned_to || '—'}</dd></div>
                </dl>
                {isOpenLead(x) && (
                  <div className={'crm-follow ' + (isOverdue(x.next_follow_up) ? 'is-overdue' : '')}>
                    <div className="crm-follow-head">
                      <span className="crm-follow-due">
                        <Clock3 size={12} />
                        {x.next_follow_up
                          ? (isOverdue(x.next_follow_up) ? 'Overdue since ' + date(x.next_follow_up) : 'Next follow-up ' + date(x.next_follow_up))
                          : 'No follow-up scheduled'}
                      </span>
                      <button className="crm-follow-done" title="Mark this follow-up done and clear the warning" onClick={() => followDone(x, null)}>
                        <Check size={13} /> Done
                      </button>
                    </div>
                    <div className="crm-follow-next" title="Schedule the next follow-up from today">
                      <span>Schedule next</span>
                      <div className="crm-follow-next-opts">
                        <button onClick={() => followDone(x, addDays(3))}>+3 days</button>
                        <button onClick={() => followDone(x, addDays(7))}>+1 week</button>
                        <button onClick={() => followDone(x, addDays(14))}>+2 weeks</button>
                      </div>
                    </div>
                  </div>
                )}
                <footer>
                  <a href={'mailto:' + x.email} title="Send email"><Mail /></a>
                  <a href={'https://wa.me/' + (x.phone || '').replace(/\D/g, '')} target="_blank" rel="noreferrer" title="Chat on WhatsApp"><MessageCircle /></a>
                  <button onClick={() => onEdit(x)}>Open lead <ChevronRight /></button>
                  {onDelete && <button className="crm-del" title="Delete lead" onClick={() => onDelete(x)}><Trash2 /></button>}
                </footer>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="entity-view-container">
      {isVehicleType && (
        <div className="crm-chips entity-status-chips">
          {[['all', 'All'], ...chipStatuses.map(s => [s, pretty(s)])].map(([id, label]) => (
            <button
              key={id}
              className={'crm-chip ' + (chipFilter === id ? 'active' : '')}
              onClick={() => setChipFilter(id)}
            >
              {label} <em>{chipCounts(id)}</em>
            </button>
          ))}
          {noPhotosCount > 0 && (
            <button
              className={'crm-chip ' + (chipFilter === 'no_photos' ? 'active alert' : ' alert')}
              onClick={() => setChipFilter(chipFilter === 'no_photos' ? 'all' : 'no_photos')}
              title="Records whose photo gallery is empty"
            >
              No photos <em>{noPhotosCount}</em>
            </button>
          )}
        </div>
      )}

      {isVehicleType && (
        <div className="entity-view-toolbar">
          <div className="entity-count-badge">
            {chipVisible.length === rows.length
              ? <><b>{rows.length}</b> {entity === 'vehicles' ? 'inventory vehicles' : 'website showroom listings'}</>
              : <><b>{chipVisible.length}</b> of {rows.length} shown{chipFilter !== 'all' ? ' · ' + (chipFilter === 'no_photos' ? 'no photos' : pretty(chipFilter)) : ''}</>}
          </div>
          <div className="view-mode-toggle">
            <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')} title="Table view">
              <List size={14} /> <span>Table</span>
            </button>
            <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} title="Photo card grid view">
              <LayoutGrid size={14} /> <span>Photo Cards</span>
            </button>
          </div>
        </div>
      )}

      {isVehicleType && !chipVisible.length ? (
        <div className="crm-empty"><Search /><h3>No vehicles in this view</h3><p>Switch filters or add a new vehicle.</p></div>
      ) : isVehicleType && viewMode === 'grid' ? (
        <div className="vehicle-card-grid">
          {sortedRows.map(row => {
            const photos = extractPhotos(row);
            const cover = photos[0] || row.image || '/assets/ar7-mark.png';
            return (
              <article key={row.id || row.stock_no} className="vcard">
                <div className="vcard-hero" onClick={() => onViewGallery && onViewGallery(row)}>
                  <img src={cover} alt={`${row.make} ${row.model}`} loading="lazy" onError={imgFallback} />
                  <span className="vcard-photo-count"><Camera size={12} /> {photos.length} photos</span>
                  {onQuickPatch && statusOptions
                    ? statusPicker(row, row.status || 'available')
                    : <em className={'crm-status ' + statusClass(row.status || 'available')}>{pretty(row.status || 'available')}</em>}
                  <button className="vcard-expand" onClick={e => { e.stopPropagation(); onViewGallery && onViewGallery(row); }} title="Expand photo gallery">
                    <Maximize2 size={13} />
                  </button>
                </div>
                <div className="vcard-body">
                  <div className="vcard-top">
                    <span className="vcard-stock">{row.stock_no || 'AR7-STOCK'}</span>
                    <span className="vcard-loc">{row.location || 'Japan'}</span>
                  </div>
                  <h3>{row.year} {row.make} {row.model}</h3>
                  <div className="vcard-price">{row.price ? (typeof row.price === 'number' ? fmt(row.price) : row.price) : '—'}</div>
                  <div className="vcard-specs">
                    {row.km && <span>{row.km} km</span>}
                    {row.fuel && <span>{row.fuel}</span>}
                    {row.steering && <span>{row.steering}</span>}
                    {row.st && <span>{row.st}</span>}
                    {row.grade && <span>Grade {row.grade}</span>}
                  </div>
                  <div className="vcard-actions">
                    <button className="btn-photos" onClick={() => onManagePhotos && onManagePhotos(row)}>
                      <Camera size={13} /> Manage Photos ({photos.length})
                    </button>
                    <button className="btn-edit" onClick={() => onEdit(row)}>Edit</button>
                    {onDelete && <button className="crm-del" title="Delete record" onClick={() => onDelete(row)}><Trash2 size={13} /></button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="crm-table-wrap">
          <table>
            <thead>
              <tr>
                {isVehicleType && <th className="th-photo">Photo</th>}
                {tableColumns(entity).map(x => (
                  <th key={x}>
                    {isVehicleType ? (
                      <button
                        className={'th-sort' + (sort && sort.key === x ? ' sorted-' + sort.dir : '')}
                        onClick={() => toggleSort(x)}
                        title={'Sort by ' + pretty(x)}
                      >
                        {pretty(x)}
                        <span className="th-sort-arrow">{sort && sort.key === x ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    ) : pretty(x)}
                  </th>
                ))}
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => {
                const photos = isVehicleType ? extractPhotos(row) : [];
                const cover = photos[0] || row.image || '/assets/ar7-mark.png';
                return (
                  <tr key={row.id || row.stock_no}>
                    {isVehicleType && (
                      <td className="td-photo">
                        <div className="table-thumb-wrap" onClick={() => onViewGallery && onViewGallery(row)} title="Click to view photo gallery">
                          <img src={cover} alt="" loading="lazy" onError={imgFallback} />
                          <span className="thumb-count"><Camera size={10} /> {photos.length}</span>
                        </div>
                      </td>
                    )}
                    {tableColumns(entity).map(k => (
                      <td key={k}>
                        {k === 'status' && onQuickPatch && statusOptions
                          ? statusPicker(row, row.status)
                          : k === 'profit'
                            ? <em className={'crm-profit ' + profitTone(vehicleProfit(row))}>{vehicleProfit(row) > 0 ? '+' : ''}{fmt(vehicleProfit(row))}</em>
                            : k === 'margin'
                              ? <em className={'crm-margin ' + profitTone(vehicleMargin(row))}>{vehicleMargin(row).toFixed(1)}%</em>
                              : renderCell(k, row[k], fmt)}
                      </td>
                    ))}
                    <td className="crm-row-actions">
                      {isVehicleType && onManagePhotos && (
                        <button className="crm-btn-photo" onClick={() => onManagePhotos(row)} title="Manage vehicle gallery photos">
                          <Camera size={13} /> Photos ({photos.length})
                        </button>
                      )}
                      <button onClick={() => onEdit(row)}>Edit</button>
                      {onDelete && <button className="crm-del" title="Delete record" onClick={() => onDelete(row)}><Trash2 /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function tableColumns(e) {
  return {
    listings: ['stock_no', 'make', 'model', 'year', 'price', 'status', 'location', 'published'],
    routes: ['country', 'port', 'transit', 'freight_base', 'duty_pct', 'published'],
    articles: ['title', 'category', 'date', 'read_min', 'published'],
    customers: ['name', 'country', 'status', 'total_spend', 'vehicles_bought'],
    vehicles: ['stock_no', 'make', 'model', 'year', 'vendor', 'price', 'profit', 'margin', 'status', 'steering'],
    quotes: ['quote_no', 'customer_name', 'vehicle', 'amount', 'status', 'valid_until'],
    shipments: ['tracking_no', 'vehicle', 'destination', 'vessel', 'status', 'eta', 'progress'],
    tasks: ['title', 'owner', 'priority', 'status', 'due_date'],
    goonet: ['stock_no', 'make', 'model', 'year', 'price', 'photo_count', 'quality_score', 'status', 'location', 'available']
  }[e] || [];
}

// ---- Profit math used by the inventory table and the Profit & sourcing tab.
export function vehicleCost(v) {
  return [v.cost_price, v.freight_cost, v.duty_cost, v.other_cost]
    .reduce((a, x) => a + (Number(x) || 0), 0);
}
export function vehicleProfit(v) {
  return (Number(v.price) || 0) - vehicleCost(v);
}
export function vehicleMargin(v) {
  const price = Number(v.price) || 0;
  return price > 0 ? (vehicleProfit(v) / price) * 100 : 0;
}
const profitTone = n => n > 0 ? 'crm-profit-pos' : (n < 0 ? 'crm-profit-neg' : '');

function renderCell(k, v, fmt = money) {
  if (['price', 'amount', 'total_spend', 'budget'].includes(k)) {
    return typeof v === 'number' ? fmt(v) : (v ?? '—');
  }
  if (['valid_until', 'eta', 'due_date', 'next_follow_up'].includes(k)) {
    const overdue = isOverdue(v) && k !== 'valid_until';
    return <span className={overdue ? 'crm-cell-overdue' : ''}>{date(v)}</span>;
  }
  if (['status', 'priority'].includes(k)) return <em className={'crm-status ' + statusClass(v)}>{pretty(v)}</em>;
  if (k === 'published') {
    return v === false
      ? <em className="crm-status dormant">Hidden</em>
      : <em className="crm-status active">Live</em>;
  }
  if (k === 'progress') return <span className="table-progress"><i style={{ width: v + '%' }} /><b>{v}%</b></span>;
  return v ?? '—';
}

// ---------------------------------------------------------------------
//  Profit & sourcing — upgraded profit system with per-vendor breakdown.
// ---------------------------------------------------------------------
function sourcingCsv(rows) {
  const esc = v => {
    if (v == null) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    const s = String(v);
    return /[\",\n]/.test(s) ? '\"' + s.replaceAll('\"', '\"\"') + '\"' : s;
  };
  const head = ['Stock no.', 'Vehicle', 'Vendor', 'Purchase cost', 'Freight', 'Duty', 'Other costs', 'Total cost', 'Selling price', 'Profit', 'Margin %', 'Status'];
  const body = (rows || []).map(v => {
    const hasCost = vehicleCost(v) > 0;
    const profit = hasCost ? vehicleProfit(v) : null;
    const margin = hasCost ? vehicleMargin(v) : null;
    return [
      v.stock_no || '', `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim(), v.vendor || 'Other',
      v.cost_price || 0, v.freight_cost || 0, v.duty_cost || 0, v.other_cost || 0,
      hasCost ? vehicleCost(v).toFixed(2) : '', Number(v.price) || 0,
      profit === null ? '' : profit.toFixed(2),
      margin === null ? '' : margin.toFixed(1),
      v.status || 'available'
    ].map(esc).join(',');
  });
  const csv = [head.join(','), ...body].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ar7-sourcing-profit-${todayKey()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function SourcingView({ rows, onOpenInventory }) {
  const { fmt } = useCurrency();
  const withCost = (rows || []).filter(v => vehicleCost(v) > 0);
  const inventoryValue = rows.reduce((a, v) => a + (Number(v.price) || 0), 0);
  const totalCost = withCost.reduce((a, v) => a + vehicleCost(v), 0);
  const totalProfit = withCost.reduce((a, v) => a + vehicleProfit(v), 0);
  const avgMargin = totalCost > 0 ? (totalProfit / (totalCost + totalProfit)) * 100 : 0;

  const byVendor = {};
  (rows || []).forEach(v => {
    const key = v.vendor || 'Other';
    (byVendor[key] = byVendor[key] || []).push(v);
  });
  const vendorRows = Object.entries(byVendor).map(([vendor, list]) => {
    const priced = list.filter(x => Number(x.price) > 0);
    const units = list.length;
    const value = priced.reduce((a, x) => a + (Number(x.price) || 0), 0);
    const cost = list.filter(vehicleCost).reduce((a, x) => a + vehicleCost(x), 0);
    const profit = list.filter(vehicleCost).reduce((a, x) => a + vehicleProfit(x), 0);
    const margin = value > 0 ? (profit / value) * 100 : 0;
    return { vendor, units, value, cost, profit, margin };
  }).sort((a, b) => b.profit - a.profit);

  return (
    <div className="crm-sourcing">
      <div className="crm-page-head">
        <div><p>Every vehicle's purchase cost, freight, duty and other costs vs. its selling price — with a per-vendor breakdown.</p></div>
        <div className="crm-tools">
          <button onClick={() => sourcingCsv(rows)} title="Download per-vehicle profit report as CSV">CSV <Download size={14} /></button>
          <button onClick={onOpenInventory}>Open inventory <ChevronRight /></button>
        </div>
      </div>

      <div className="crm-kpis">
        {[
          [CarFront, 'Vehicles tracked', rows.length, withCost.length + ' with full cost data', 'trend-blue'],
          [DollarSign, 'Stock value', fmt(inventoryValue), 'Sum of selling prices', 'trend-gold'],
          [Wallet, 'Total cost', fmt(totalCost), 'Purchase + freight + duty + other', 'trend-blue'],
          [TrendingUp, 'Potential profit', fmt(totalProfit), fmt(avgMargin) + ' avg margin', 'trend-green']
        ].map(([I, l, v, s, cls]) => (
          <article key={l} className={`kpi-card ${cls}`}>
            <i><I /></i><span>{l}</span><b>{v}</b><small>{s}</small>
          </article>
        ))}
      </div>

      {vendorRows.length > 0 && (
        <section className="crm-panel crm-span">
          <div className="crm-panel-head">
            <div><small>SOURCING VENDORS</small><h3>Profit by sourcing channel</h3></div>
          </div>
          <div className="crm-table-wrap">
            <table>
              <thead><tr>{['Vendor', 'Units', 'Stock value', 'Total cost', 'Profit', 'Margin'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {vendorRows.map(vr => (
                  <tr key={vr.vendor}>
                    <td><b>{vr.vendor}</b></td>
                    <td>{vr.units}</td>
                    <td>{fmt(vr.value)}</td>
                    <td>{fmt(vr.cost)}</td>
                    <td><em className={'crm-profit ' + profitTone(vr.profit)}>{vr.profit > 0 ? '+' : ''}{fmt(vr.profit)}</em></td>
                    <td><em className={'crm-margin ' + profitTone(vr.margin)}>{vr.margin.toFixed(1)}%</em></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="crm-panel crm-span">
        <div className="crm-panel-head">
          <div><small>PER-VEHICLE PROFIT</small><h3>Costs, price and margin</h3></div>
        </div>
        <div className="crm-table-wrap">
          <table>
            <thead><tr>{['Stock no.', 'Vehicle', 'Vendor', 'Cost', 'Price', 'Profit', 'Margin', 'Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(v => {
                const hasCost = vehicleCost(v) > 0;
                const profit = hasCost ? vehicleProfit(v) : null;
                const margin = hasCost ? vehicleMargin(v) : null;
                return (
                  <tr key={v.id || v.stock_no}>
                    <td>{v.stock_no || '—'}</td>
                    <td><b>{v.year} {v.make} {v.model}</b></td>
                    <td>{v.vendor || 'Other'}</td>
                    <td>{hasCost ? fmt(vehicleCost(v)) : '—'}</td>
                    <td>{fmt(v.price)}</td>
                    <td>{profit === null ? '—' : <em className={'crm-profit ' + profitTone(profit)}>{profit > 0 ? '+' : ''}{fmt(profit)}</em>}</td>
                    <td>{margin === null ? '—' : <em className={'crm-margin ' + profitTone(margin)}>{margin.toFixed(1)}%</em>}</td>
                    <td><em className={'crm-status ' + statusClass(v.status || 'available')}>{pretty(v.status || 'available')}</em></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="crm-hint"><ShieldAlert size={13} /> Enter purchase cost, freight, duty and other costs in <b>Inventory</b> → Edit. Vehicles without cost data are excluded from profit totals so the books cannot be overstated.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
//  Japan dealer stock — manage cars imported from Goo-net.
// ---------------------------------------------------------------------
export function GoonetStockView({ token, rows, profile, notify, onEdit, onDelete, onManagePhotos, onViewGallery, onPromote, onDelist, onRun, onRefresh, syncing }) {
  const { fmt } = useCurrency();
  const [chip, setChip] = useState('all');
  const [query, setQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const isAdmin = profile?.role === 'admin';

  useEffect(() => { fetch('/api/settings').then(r => r.json()).then(setSettingsForm).catch(() => setSettingsForm({})); }, []);

  const now = Date.now();
  const weekAgo = new Date(now - 7 * 864e5).toISOString();
  const counts = {
    all: rows.length,
    available: rows.filter(x => x.available !== false).length,
    newweek: rows.filter(x => x.available !== false && String(x.imported_at || '') >= weekAgo).length,
    delisted: rows.filter(x => x.available === false).length,
    promoted: rows.filter(x => x.promoted && x.promoted !== 'none').length
  };
  const filtered = rows.filter(x => {
    const hay = (x.make + ' ' + x.model + ' ' + (x.stock_no || '') + ' ' + x.year).toLowerCase();
    const okChip = chip === 'all' ? true
      : chip === 'available' ? x.available !== false
        : chip === 'newweek' ? (x.available !== false && String(x.imported_at || '') >= weekAgo)
          : chip === 'delisted' ? x.available === false
            : chip === 'promoted' ? (x.promoted && x.promoted !== 'none') : true;
    return okChip && (!query.trim() || hay.includes(query.trim().toLowerCase()));
  });

  async function saveSettings(e) {
    e.preventDefault();
    setSettingsBusy(true);
    try {
      await call('/api/settings', token, { method: 'PATCH', body: JSON.stringify(settingsForm) });
      notify('Importer settings saved — the next scheduled run uses them.');
    } catch (err) { notify(err.message); } finally { setSettingsBusy(false); }
  }

  const settingsFields = [
    ['goonet_search_url', 'Goo-net search page', 'Newest-first listing to crawl, e.g. https://www.goo-net.com/usedcar/price-100-300/'],
    ['goonet_min_photos', 'Minimum photos (quality gate)', 'Cars with fewer good photos are skipped'],
    ['goonet_min_year', 'Oldest model year', 'Cars older than this year are skipped'],
    ['goonet_max_new_per_run', 'Max new cars per run', 'Small batches keep the site fast on free hosting'],
    ['goonet_max_delist_per_run', 'Delist checks per run', 'How many existing cars are verified per run'],
    ['goonet_weekly_delist_limit', 'Weekly delist limit', 'Max older cars the weekly maintenance removes'],
    ['goonet_weekly_promote_limit', 'Weekly auto-promote limit', 'Max fresh cars promoted to the website per week'],
    ['goonet_jpy_usd_rate', 'JPY → USD rate', 'Used for estimated US prices']
  ];

  return (
    <div className="crm-goonet">
      <div className="crm-page-head">
        <div><p>Cars the Goo-net importer brought in (quality-gated photos). Delisted cars disappear from the website automatically.</p></div>
        <div className="crm-tools">
          <label><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search dealer stock…" /></label>
          {filtered.length > 0 && <button onClick={() => exportCsv('goonet', filtered)} title="Download these records as CSV">CSV</button>}
          <button onClick={onRefresh} title="Refresh records"><RefreshCw /></button>
          <button className={showSettings ? 'active' : ''} onClick={() => setShowSettings(v => !v)} title="Importer rules and limits"><Settings /> Importer rules</button>
          {isAdmin && (
            <button className="crm-sync" onClick={onRun} disabled={syncing} title="Run one importer cycle now — crawls the next Goo-net page, quality-gates and imports">
              <Play className={syncing ? 'crm-sync-spin' : ''} size={13} /> {syncing ? 'Running…' : 'Run import now'}
            </button>
          )}
        </div>
      </div>

      {showSettings && (
        <form className="crm-settings-form crm-goonet-settings" onSubmit={saveSettings}>
          <div className="crm-editor-fields">
            {settingsFields.map(([k, label, hint]) => (
              <label key={k}>
                {label}
                <input value={settingsForm?.[k] ?? ''} disabled={!isAdmin} onChange={e => setSettingsForm(v => ({ ...v, [k]: e.target.value }))} />
                <small>{hint}</small>
              </label>
            ))}
            <label className="crm-check-field">
              <span>Auto-promote fresh cars to the website each week</span>
              <input type="checkbox" checked={(settingsForm?.goonet_auto_promote ?? 'true') === 'true'} disabled={!isAdmin}
                onChange={e => setSettingsForm(v => ({ ...v, goonet_auto_promote: e.target.checked ? 'true' : 'false' }))} />
            </label>
          </div>
          <footer>
            {isAdmin
              ? <button className="save" disabled={settingsBusy}><Save /> {settingsBusy ? 'Saving…' : 'Save importer rules'}</button>
              : <p className="crm-hint"><ShieldAlert size={13} /> Only administrators can change importer rules.</p>}
          </footer>
        </form>
      )}

      <div className="crm-chips">
        {[['all', 'All'], ['available', 'Available'], ['newweek', 'New this week'], ['promoted', 'Promoted'], ['delisted', 'Delisted']].map(([id, label]) => (
          <button key={id} className={'crm-chip ' + (chip === id ? 'active' : '') + (id === 'delisted' && counts.delisted > 0 ? ' alert' : '')} onClick={() => setChip(id)}>
            {label} <em>{counts[id]}</em>
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <div className="crm-empty"><Search /><h3>No imported cars in this view</h3><p>{rows.length ? 'Try another filter or search.' : 'Run the importer or add a car manually with Add.'}</p></div>
      ) : (
        <div className="crm-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="th-photo">Photo</th>
                <th>Stock no.</th><th>Vehicle</th><th>Year</th><th>Km</th><th>Price</th>
                <th>Photos</th><th>Quality</th><th>Status</th><th>Promoted</th><th>Imported</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const photos = extractPhotos(row);
                const cover = photos[0] || row.image || '/assets/ar7-mark.png';
                const importDate = row.imported_at ? new Date(row.imported_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';
                return (
                  <tr key={row.id || row.stock_no} className={row.available === false ? 'row-muted' : ''}>
                    <td className="td-photo">
                      <div className="table-thumb-wrap" onClick={() => onViewGallery && onViewGallery(row)} title="Click to view photos">
                        <img src={cover} alt="" loading="lazy" onError={imgFallback} />
                        <span className="thumb-count"><Camera size={10} /> {photos.length}</span>
                      </div>
                    </td>
                    <td>{row.stock_no || row.goonet_id || '—'}</td>
                    <td><b>{row.make} {row.model}</b></td>
                    <td>{row.year || '—'}</td>
                    <td>{row.km ? row.km + ' km' : '—'}</td>
                    <td>{row.price || (row.price_usd ? fmt(row.price_usd) : '—')}</td>
                    <td>{row.photo_count ?? photos.length}</td>
                    <td><span className="crm-score" title="Quality score set by the importer"><b>{row.quality_score ?? '—'}</b><i style={{ width: Math.min(100, row.quality_score || 0) + '%' }} /></span></td>
                    <td>
                      {row.available === false
                        ? <em className="crm-status dormant">Delisted</em>
                        : <em className={'crm-status ' + statusClass(row.status || 'New Arrival')}>{row.status || 'New Arrival'}</em>}
                    </td>
                    <td>{row.promoted && row.promoted !== 'none' ? <em className="crm-status active">{row.promoted}</em> : <em className="crm-status">—</em>}</td>
                    <td>{importDate}</td>
                    <td className="crm-row-actions">
                      <div className="goonet-actions">
                        {row.available !== false && (
                          <>
                            <button title="Publish this car on the website (Japan stock page + inventory)" onClick={() => onPromote(row, 'listings')}><Globe size={13} /> Website</button>
                            <button title="Copy this car into CRM inventory" onClick={() => onPromote(row, 'vehicles')}><CarFront size={13} /> Inventory</button>
                          </>
                        )}
                        {row.available !== false
                          ? <button className="crm-del" title="Delist (remove from website)" onClick={() => onDelist(row)}><Ban size={13} /> Delist</button>
                          : <button title="Re-list on the website" onClick={() => onDelist(row)}><Check size={13} /> Re-list</button>}
                        <button title="Manage photo gallery" onClick={() => onManagePhotos && onManagePhotos(row)}><Camera size={13} /> Photos</button>
                        <button onClick={() => onEdit(row)}>Edit</button>
                        {onDelete && <button className="crm-del" title="Delete record" onClick={() => onDelete(row)}><Trash2 /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!isAdmin && <p className="crm-hint"><ShieldAlert size={13} /> Moving cars to the website or inventory requires an administrator.</p>}
    </div>
  );
}

function ActivityView({ rows }) {
  return (
    <div className="crm-activity">
      <div className="crm-page-head"><p>A complete audit trail across sales, photos, operations and security.</p></div>
      {rows.map((x, i) => (
        <article key={x.id}>
          <i><Activity /></i>
          <div>
            <b>{x.action}</b>
            <span>{x.actor} · {new Date(x.created_at).toLocaleString()}</span>
          </div>
          <em>{pretty(x.entity_type)}</em>
          {i < rows.length - 1 && <u />}
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
//  Vehicle Photo Manager Modal
// ---------------------------------------------------------------------
export function VehiclePhotoManager({ entity, row, onClose, onSave }) {
  const initialPhotos = useMemo(() => extractPhotos(row), [row]);
  const [photos, setPhotos] = useState(initialPhotos);
  const [newUrl, setNewUrl] = useState('');
  const [batchText, setBatchText] = useState('');
  const [showBatch, setShowBatch] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [zoomImg, setZoomImg] = useState(null);

  const addPhoto = url => {
    const clean = url.trim();
    if (!clean) return;
    if (photos.includes(clean)) return;
    setPhotos([...photos, clean]);
    setNewUrl('');
  };

  const addBatch = () => {
    const urls = batchText
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s && !photos.includes(s));
    if (urls.length) {
      setPhotos([...photos, ...urls]);
      setBatchText('');
      setShowBatch(false);
    }
  };

  const applyPreset = presetId => {
    const p = PHOTO_PRESETS.find(x => x.id === presetId);
    if (!p) return;
    const combined = [...photos];
    p.photos.forEach(ph => {
      if (!combined.includes(ph)) combined.push(ph);
    });
    setPhotos(combined);
    setSelectedPreset('');
  };

  const setCover = idx => {
    if (idx === 0) return;
    const item = photos[idx];
    const rest = photos.filter((_, i) => i !== idx);
    setPhotos([item, ...rest]);
  };

  const move = (from, to) => {
    if (to < 0 || to >= photos.length) return;
    const copy = [...photos];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    setPhotos(copy);
  };

  const removePhoto = idx => {
    setPhotos(photos.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    onSave(photos);
  };

  return (
    <div className="crm-modal-bg" onMouseDown={onClose}>
      <div className="crm-photo-modal" onMouseDown={e => e.stopPropagation()}>
        <header className="photo-modal-head">
          <div>
            <small>VEHICLE PHOTO MANAGEMENT · {entity.toUpperCase()}</small>
            <h2>{row.year || ''} {row.make || ''} {row.model || row.stock_no || 'Vehicle'}</h2>
            <p className="photo-modal-subtitle">
              Stock #{row.stock_no || '—'} · {photos.length} photo{photos.length === 1 ? '' : 's'} in gallery
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X /></button>
        </header>

        <div className="photo-modal-body">
          {/* Add Photos Section */}
          <section className="photo-add-panel">
            <div className="photo-add-row">
              <label className="photo-url-input">
                <Camera size={14} />
                <input
                  type="text"
                  placeholder="Paste image path or URL (e.g. /assets/gallery/audi-r8-v10-01.webp or https://…)"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhoto(newUrl); } }}
                />
              </label>
              <button type="button" className="crm-btn-add-photo" onClick={() => addPhoto(newUrl)} disabled={!newUrl.trim()}>
                <Plus size={14} /> Add Photo
              </button>
            </div>

            <div className="photo-preset-row">
              <div className="preset-picker">
                <Images size={13} />
                <select value={selectedPreset} onChange={e => applyPreset(e.target.value)}>
                  <option value="" disabled>Import from AR7 Stock Photo Library…</option>
                  {PHOTO_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>+ {p.label}</option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn-batch-toggle" onClick={() => setShowBatch(!showBatch)}>
                <Layers size={13} /> {showBatch ? 'Hide Batch' : 'Batch URLs'}
              </button>
            </div>

            {showBatch && (
              <div className="photo-batch-box">
                <label>
                  <span>PASTE MULTIPLE IMAGE URLS (ONE PER LINE OR COMMA-SEPARATED)</span>
                  <textarea
                    rows={3}
                    value={batchText}
                    onChange={e => setBatchText(e.target.value)}
                    placeholder="/assets/gallery/lexus-lc-500-01.jpg&#10;/assets/gallery/lexus-lc-500-02.jpg&#10;/assets/gallery/lexus-lc-500-03.jpg"
                  />
                </label>
                <div className="batch-actions">
                  <button type="button" className="crm-btn-add-photo" onClick={addBatch}>Import URLs</button>
                  <button type="button" className="crm-ghost-btn" onClick={() => setShowBatch(false)}>Cancel</button>
                </div>
              </div>
            )}
          </section>

          {/* Current Gallery Grid */}
          <section className="photo-gallery-section">
            <div className="section-title-bar">
              <h3>Gallery Photos <em>(First photo is the main cover photo)</em></h3>
              <small>Drag or use arrows to reorder</small>
            </div>

            {!photos.length ? (
              <div className="photo-empty-state">
                <Camera size={36} />
                <h4>No photos assigned</h4>
                <p>Add image URLs above or import a photo set from the AR7 stock library.</p>
              </div>
            ) : (
              <div className="photo-grid">
                {photos.map((src, idx) => (
                  <div key={src + idx} className={`photo-card ${idx === 0 ? 'is-cover' : ''}`}>
                    <div className="photo-thumb-container" onClick={() => setZoomImg(src)}>
                      <img src={src} alt={`Photo ${idx + 1}`} loading="lazy" onError={imgFallback} />
                      {idx === 0 && <span className="cover-badge"><Star size={11} /> COVER PHOTO</span>}
                      <span className="photo-index">#{idx + 1}</span>
                    </div>

                    <div className="photo-card-actions">
                      {idx !== 0 && (
                        <button type="button" className="btn-make-cover" onClick={() => setCover(idx)} title="Set as primary cover photo">
                          <Star size={12} /> Set Cover
                        </button>
                      )}
                      <div className="reorder-btns">
                        <button type="button" disabled={idx === 0} onClick={() => move(idx, idx - 1)} title="Move left">
                          <MoveLeft size={13} />
                        </button>
                        <button type="button" disabled={idx === photos.length - 1} onClick={() => move(idx, idx + 1)} title="Move right">
                          <MoveRight size={13} />
                        </button>
                      </div>
                      <button type="button" className="btn-del-photo" onClick={() => removePhoto(idx)} title="Remove photo">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="photo-modal-foot">
          <div className="photo-foot-info">
            <span>Primary image will sync to: <code>{photos[0] || 'None'}</code></span>
          </div>
          <div className="photo-foot-actions">
            <button type="button" className="crm-ghost-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="crm-save-btn" onClick={handleSave}>
              <Save size={14} /> Save {photos.length} Photo{photos.length === 1 ? '' : 's'}
            </button>
          </div>
        </footer>

        {zoomImg && (
          <div className="photo-zoom-overlay" onClick={() => setZoomImg(null)}>
            <div className="zoom-content" onClick={e => e.stopPropagation()}>
              <img src={zoomImg} alt="Preview" />
              <button type="button" className="zoom-close" onClick={() => setZoomImg(null)}><X size={18} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
//  Vehicle Gallery Lightbox Modal
// ---------------------------------------------------------------------
export function VehicleGalleryModal({ row, onClose, onManagePhotos }) {
  const photos = useMemo(() => extractPhotos(row), [row]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setActiveIdx(i => (i - 1 + photos.length) % photos.length);
      if (e.key === 'ArrowRight') setActiveIdx(i => (i + 1) % photos.length);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [photos, onClose]);

  const current = photos[activeIdx] || row.image || '/assets/ar7-mark.png';

  return (
    <div className="crm-modal-bg crm-lightbox-bg" onClick={onClose}>
      <div className="crm-lightbox" onClick={e => e.stopPropagation()}>
        <header className="lightbox-head">
          <div>
            <b>{row.year || ''} {row.make || ''} {row.model || row.stock_no || 'Vehicle Gallery'}</b>
            <small>Stock #{row.stock_no || '—'} · Photo {activeIdx + 1} of {photos.length || 1}</small>
          </div>
          <div className="lightbox-head-btns">
            {onManagePhotos && (
              <button type="button" className="btn-lightbox-manage" onClick={onManagePhotos}>
                <Camera size={14} /> Manage Photos
              </button>
            )}
            <button type="button" className="btn-lightbox-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </header>

        <div className="lightbox-main">
          <img src={current} alt={`${row.make} ${row.model}`} onError={imgFallback} />
          {photos.length > 1 && (
            <>
              <button className="lb-arrow prev" onClick={() => setActiveIdx(i => (i - 1 + photos.length) % photos.length)} aria-label="Previous image">
                <ChevronLeft size={24} />
              </button>
              <button className="lb-arrow next" onClick={() => setActiveIdx(i => (i + 1) % photos.length)} aria-label="Next image">
                <ChevronRight size={24} />
              </button>
            </>
          )}
        </div>

        {photos.length > 1 && (
          <div className="lightbox-thumbs">
            {photos.map((src, i) => (
              <button key={src + i} className={`lb-thumb ${i === activeIdx ? 'active' : ''}`} onClick={() => setActiveIdx(i)}>
                <img src={src} alt="" onError={imgFallback} />
                {i === 0 && <span className="lb-cover-star">★</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
//  Entity Editor Form with integrated photo manager
// ---------------------------------------------------------------------
// Renders one field according to its declared type (text, number, date,
// select, textarea, check, year). Keeps every form in the CRM consistent.
function FieldControl({ f, form, setForm }) {
  const [key, label, type = 'text', opts = {}] = f;
  const set = v => setForm(s => ({ ...s, [key]: v }));
  const val = form[key];

  if (type === 'check') {
    return (
      <label className="crm-check" title={opts.hint}>
        <input type="checkbox" checked={!!val} onChange={e => set(e.target.checked)} /> {label}
        {opts.hint && <small className="field-hint">{opts.hint}</small>}
      </label>
    );
  }
  if (type === 'select' || type === 'year') {
    const options = type === 'year' ? YEARS.map(String) : opts.options || [];
    const current = val == null || val === '' ? '' : String(val);
    return (
      <label>
        {label}{opts.required && <i className="req-star">*</i>}
        <select value={current} onChange={e => set(type === 'year' ? (e.target.value ? Number(e.target.value) : null) : e.target.value)}>
          <option value="">Select…</option>
          {current && !options.includes(current) && <option value={current}>{pretty(current)}</option>}
          {options.map(o => <option key={o} value={o}>{type === 'select' && ['status', 'priority', 'source', 'fuel', 'body'].includes(key) ? pretty(o) : o}</option>)}
        </select>
        {opts.hint && <small className="field-hint">{opts.hint}</small>}
      </label>
    );
  }
  if (type === 'textarea') {
    return (
      <label className="span2">
        {label}
        <textarea rows={opts.rows || 3} value={val ?? ''} placeholder={opts.placeholder} onChange={e => set(e.target.value)} />
      </label>
    );
  }
  if (type === 'number') {
    return (
      <label>
        {label}{opts.required && <i className="req-star">*</i>}
        <input type="number" value={val ?? ''} min={opts.min} max={opts.max} step={opts.step ?? 'any'} placeholder={opts.placeholder} required={opts.required}
          onChange={e => set(e.target.value === '' ? null : Number(e.target.value))} />
        {opts.hint && <small className="field-hint">{opts.hint}</small>}
      </label>
    );
  }
  return (
    <label>
      {label}{opts.required && <i className="req-star">*</i>}
      <input type={type} value={val ?? ''} placeholder={opts.placeholder} required={opts.required} onChange={e => set(e.target.value)} />
      {opts.hint && <small className="field-hint">{opts.hint}</small>}
    </label>
  );
}

function Editor({ entity, data, onClose, onSave, onDelete, onDuplicate }) {
  const cfg = configs[entity];
  const [form, setForm] = useState({ ...data });
  const isVehicle = entity === 'vehicles' || entity === 'listings';
  const [photos, setPhotos] = useState(() => extractPhotos(data));
  const quickPhotoRef = useRef(null);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePhotoAdd = url => {
    if (!url.trim() || photos.includes(url.trim())) return;
    const updated = [...photos, url.trim()];
    setPhotos(updated);
    setForm(v => ({ ...v, images: updated, image: updated[0] }));
  };

  const handlePresetSelect = id => {
    const p = PHOTO_PRESETS.find(x => x.id === id);
    if (!p) return;
    const combined = [...photos];
    p.photos.forEach(ph => {
      if (!combined.includes(ph)) combined.push(ph);
    });
    setPhotos(combined);
    setForm(v => ({ ...v, images: combined, image: combined[0] }));
  };

  const handleCoverSet = idx => {
    const item = photos[idx];
    const rest = photos.filter((_, i) => i !== idx);
    const updated = [item, ...rest];
    setPhotos(updated);
    setForm(v => ({ ...v, images: updated, image: updated[0] }));
  };

  const handlePhotoRemove = idx => {
    const updated = photos.filter((_, i) => i !== idx);
    setPhotos(updated);
    setForm(v => ({ ...v, images: updated, image: updated[0] || '' }));
  };

  const handleSubmit = e => {
    e.preventDefault();
    const payload = { ...form };
    // Empty optional fields go to the server as null instead of blank strings,
    // keeping the database tidy and filters honest.
    cfg.fields.forEach(([key, , type = 'text', opts = {}]) => {
      if (!opts.required && type !== 'check' && payload[key] === '') payload[key] = null;
    });
    if (isVehicle) {
      payload.images = photos;
      payload.image = photos[0] || form.image || '';
    }
    onSave(payload);
  };

  // Group fields into their declared sections for a calmer, scannable form.
  const sections = [];
  cfg.fields.forEach(f => {
    const name = f[3]?.section || 'Details';
    let sec = sections.find(s => s.name === name);
    if (!sec) { sec = { name, fields: [] }; sections.push(sec); }
    sec.fields.push(f);
  });

  return (
    <div className="crm-modal-bg" onMouseDown={onClose}>
      <form className={`crm-editor ${isVehicle ? 'wide' : ''}`} onMouseDown={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <header>
          <div>
            <small>{data.id ? 'EDIT RECORD' : 'NEW RECORD'}</small>
            <h2>{data.id ? 'Update' : 'Add'} {entity.slice(0, -1)}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X /></button>
        </header>

        {isVehicle && (
          <div className="editor-photo-strip">
            <div className="editor-photo-head">
              <div>
                <b>Vehicle Gallery Photos ({photos.length})</b>
                <small>Select from catalog presets or add custom image paths</small>
              </div>
              <select defaultValue="" onChange={e => { handlePresetSelect(e.target.value); e.target.value = ''; }}>
                <option value="" disabled>+ Add AR7 Stock Photo Set…</option>
                {PHOTO_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            <div className="editor-photo-thumbs">
              {photos.map((src, i) => (
                <div key={src + i} className={`editor-thumb ${i === 0 ? 'is-cover' : ''}`}>
                  <img src={src} alt="" onError={imgFallback} />
                  {i === 0 ? <span className="badge-cover">Cover</span> : (
                    <button type="button" className="btn-set-cover-mini" onClick={() => handleCoverSet(i)} title="Make cover photo">★</button>
                  )}
                  <button type="button" className="btn-remove-mini" onClick={() => handlePhotoRemove(i)} title="Remove photo">×</button>
                </div>
              ))}
            </div>

            <div className="editor-photo-quick-add">
              <input
                type="text"
                ref={quickPhotoRef}
                placeholder="Add image URL or path (/assets/gallery/...)"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePhotoAdd(e.target.value);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const el = quickPhotoRef.current;
                  if (el && el.value) {
                    handlePhotoAdd(el.value);
                    el.value = '';
                  }
                }}
              >
                + Add
              </button>
            </div>
          </div>
        )}

        {sections.map(sec => (
          <div className="field-section" key={sec.name}>
            <h4>{sec.name}</h4>
            <div className={'crm-editor-fields' + (sections.length === 1 || ['articles'].includes(entity) ? '' : ' two')}>
              {sec.fields.map(f => <FieldControl key={f[0]} f={f} form={form} setForm={setForm} />)}
            </div>
          </div>
        ))}

        <footer>
          {onDelete && (
            <button type="button" className="crm-del-text" onClick={onDelete}>
              <Trash2 /> Delete
            </button>
          )}
          {onDuplicate && (
            <button type="button" className="crm-dup-text" onClick={onDuplicate} title="Create a copy of this record">
              <Copy /> Duplicate
            </button>
          )}
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="save"><Save /> Save record</button>
        </footer>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------
//  Permissions helper
// ---------------------------------------------------------------------
function hasPerm(perms, role, permission) {
  if (role === 'admin') return true;
  const row = (perms || []).find(p => p.role === role && p.permission === permission);
  return !!row?.allowed;
}

// ---------------------------------------------------------------------
//  Team & Profile Modals
// ---------------------------------------------------------------------
function ProfileModal({ who, token, profile, perms, notify, onClose, onChanged }) {
  const self = !!who.self;
  const m = who.member || {};
  const manage = hasPerm(perms, profile?.role, 'team.manage');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const canEditOther = !self && manage;
  if (!self && !canEditOther) return null;

  async function saveDetails(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { full_name: f.get('full_name'), title: f.get('title'), phone: f.get('phone') };
    setBusy(true);
    setErr('');
    try {
      if (self) {
        await call('/api/team?action=me', token, { method: 'PATCH', body: JSON.stringify(body) });
        if (supabase && !DEMO) await supabase.auth.updateUser({ data: { full_name: body.full_name } });
      } else {
        await call('/api/team?action=member', token, {
          method: 'PATCH',
          body: JSON.stringify({ id: m.id, ...body, role: f.get('role'), active: f.get('active') === 'on' })
        });
      }
      setOk('Details saved');
      notify('Profile updated');
      onChanged && onChanged();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    if (pw.length < 8) {
      setErr('Password must be at least 8 characters');
      return;
    }
    if (pw !== pw2) {
      setErr('The two passwords do not match');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      if (self) {
        if (!supabase || DEMO) throw new Error('Password changes are not available in demo mode');
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (error) throw error;
      } else {
        await call('/api/team?action=reset-password', token, {
          method: 'POST',
          body: JSON.stringify({ id: m.id, password: pw })
        });
      }
      setPw('');
      setPw2('');
      setOk(self ? 'Your password has been changed' : 'Password reset — pass it to them directly, never by email');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const initials = (self ? (profile?.full_name || 'AR7') : (m.full_name || 'AR7')).slice(0, 2).toUpperCase();
  const role = self ? (profile?.role || 'sales') : (m.role || 'sales');

  return (
    <div className="crm-modal-bg" onClick={onClose}>
      <div className="crm-editor crm-profile" onClick={e => e.stopPropagation()}>
        <header>
          <div>
            <small>{self ? 'YOUR PROFILE' : 'TEAM MEMBER'}</small>
            <h2>{self ? 'My profile' : (m.full_name || 'Edit member')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X /></button>
        </header>
        <div className="crm-profile-id">
          <span>{initials}</span>
          <div>
            <b>{self ? (profile?.full_name || '—') : (m.full_name || '—')}</b>
            <small>{pretty(role)}{!self && m.email ? ' · ' + m.email : ''}</small>
          </div>
        </div>
        {ok && <div className="crm-ok"><Check /> {ok}</div>}
        {err && <div className="crm-error">{err}</div>}
        <form onSubmit={saveDetails} className="crm-profile-form">
          <div className="crm-editor-fields two">
            <label>Full name<input name="full_name" required minLength={2} defaultValue={self ? (profile?.full_name || '') : (m.full_name || '')} /></label>
            <label>Job title<input name="title" placeholder="e.g. Sales manager" defaultValue={self ? (profile?.title || '') : (m.title || '')} /></label>
            <label>Phone<input name="phone" placeholder="+81 90 0000 0000" defaultValue={self ? (profile?.phone || '') : (m.phone || '')} /></label>
            <label>Email<input value={self ? '' : (m.email || '')} disabled title="Email is the login and can only be changed by adding a new account" /></label>
          </div>
          {canEditOther && (
            <div className="crm-editor-fields two">
              <label>Role
                <select name="role" defaultValue={m.role || 'sales'} disabled={m.id === profile.id}>
                  {ROLE_LIST.map(r => <option key={r} value={r}>{pretty(r)}</option>)}
                </select>
              </label>
              <label className="crm-check">
                <input type="checkbox" name="active" defaultChecked={m.active !== false} disabled={m.id === profile.id} /> Account is active
              </label>
            </div>
          )}
          <footer>
            <button type="button" className="crm-ghost" onClick={onClose}>Cancel</button>
            <button className="save" disabled={busy}>{busy ? 'Saving…' : <><Save /> Save details</>}</button>
          </footer>
        </form>
        <form onSubmit={savePassword} className="crm-profile-form crm-profile-pw">
          <div className="crm-profile-pw-head">
            <KeyRound size={16} />
            <b>{self ? 'Change my password' : 'Reset their password'}</b>
          </div>
          <div className="crm-editor-fields two">
            <label>New password<input type="password" minLength={8} autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" /></label>
            <label>Confirm password<input type="password" minLength={8} autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
          </div>
          <footer><button className="save" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button></footer>
        </form>
      </div>
    </div>
  );
}

function TeamView({ token, profile, perms, setPerms, notify, onEdit }) {
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pw, setPw] = useState(null);
  const manage = hasPerm(perms, profile?.role, 'team.manage');

  async function load() {
    try {
      setMembers(await call('/api/team?action=members', token));
    } catch (e) {
      notify(e.message);
    }
  }

  useEffect(() => {
    if (manage) load();
  }, [manage]);

  async function invite(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true);
    try {
      await call('/api/team?action=invite', token, {
        method: 'POST',
        body: JSON.stringify({
          email: f.get('email'),
          full_name: f.get('full_name'),
          role: f.get('role'),
          password: f.get('password')
        })
      });
      notify('Team member added');
      setAdding(false);
      load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function update(id, patch) {
    try {
      await call('/api/team?action=member', token, { method: 'PATCH', body: JSON.stringify({ id, ...patch }) });
      load();
      notify('Updated');
    } catch (e) {
      notify(e.message);
    }
  }

  async function toggle(role, permission, allowed) {
    try {
      await call('/api/team?action=set-permission', token, { method: 'POST', body: JSON.stringify({ role, permission, allowed }) });
      setPerms(await call('/api/team?action=permissions', token));
    } catch (e) {
      notify(e.message);
    }
  }

  async function resetPw(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true);
    try {
      await call('/api/team?action=reset-password', token, { method: 'POST', body: JSON.stringify({ id: pw.id, password: f.get('password') }) });
      notify('Password updated — give it to them directly, not by email.');
      setPw(null);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!manage) {
    return (
      <div className="crm-empty">
        <ShieldAlert />
        <h3>Not available for your role</h3>
        <p>Only administrators can manage the team.</p>
      </div>
    );
  }

  return (
    <div className="crm-team">
      <div className="crm-page-head">
        <div><p>Add colleagues, configure permission matrix and manage role access.</p></div>
        <div className="crm-tools"><button className="crm-add" onClick={() => setAdding(true)}><Plus /> Add member</button></div>
      </div>

      <div className="crm-table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td>{m.full_name}</td>
                <td>{m.email || '—'}</td>
                <td>
                  <select value={m.role} disabled={m.id === profile.id} onChange={e => update(m.id, { role: e.target.value })}>
                    {ROLE_LIST.map(r => <option key={r} value={r}>{pretty(r)}</option>)}
                  </select>
                </td>
                <td><em className={'crm-status ' + (m.active ? 'active' : 'inactive')}>{m.active ? 'Active' : 'Disabled'}</em></td>
                <td className="crm-row-actions">
                  <button onClick={() => onEdit(m)}><UserCog size={14} /> Edit</button>
                  <button onClick={() => setPw(m)}><KeyRound size={14} /> Password</button>
                  {m.id !== profile.id && (
                    <button className={m.active ? 'crm-del' : ''} onClick={() => update(m.id, { active: !m.active })}>
                      {m.active ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="crm-perm-block">
        <h3>What each role can do</h3>
        <p>Tick a box to allow it. Changes apply immediately — no redeploy needed. Administrators always have full access.</p>
        <div className="crm-table-wrap">
          <table className="perm-table">
            <thead>
              <tr>
                <th>Permission</th>
                {ROLE_LIST.map(r => <th key={r}>{pretty(r)}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERM_LABELS).map(([key, label]) => (
                <tr key={key}>
                  <td>{label}</td>
                  {ROLE_LIST.map(r => (
                    <td key={r} className="perm-cell">
                      <input
                        type="checkbox"
                        disabled={r === 'admin'}
                        checked={r === 'admin' ? true : hasPerm(perms, r, key)}
                        onChange={e => toggle(r, key, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adding && (
        <div className="crm-modal-bg" onMouseDown={() => setAdding(false)}>
          <form className="crm-editor" onMouseDown={e => e.stopPropagation()} onSubmit={invite}>
            <header><div><small>NEW TEAM MEMBER</small><h2>Add colleague</h2></div><button type="button" onClick={() => setAdding(false)}><X /></button></header>
            <div className="crm-editor-fields">
              <label>Full name<input name="full_name" required /></label>
              <label>Email<input name="email" type="email" required /></label>
              <label>Role<select name="role" defaultValue="sales">{ROLE_LIST.map(r => <option key={r} value={r}>{pretty(r)}</option>)}</select></label>
              <label>Starting password<input name="password" minLength={8} required placeholder="At least 8 characters" /></label>
            </div>
            <p className="crm-hint">Give this password to them directly. They can change it after signing in.</p>
            <footer>
              <button type="button" onClick={() => setAdding(false)}>Cancel</button>
              <button className="save" disabled={busy}><Save /> {busy ? 'Adding…' : 'Add member'}</button>
            </footer>
          </form>
        </div>
      )}

      {pw && (
        <div className="crm-modal-bg" onMouseDown={() => setPw(null)}>
          <form className="crm-editor" onMouseDown={e => e.stopPropagation()} onSubmit={resetPw}>
            <header><div><small>RESET PASSWORD</small><h2>{pw.full_name}</h2></div><button type="button" onClick={() => setPw(null)}><X /></button></header>
            <div className="crm-editor-fields"><label>New password<input name="password" minLength={8} required /></label></div>
            <p className="crm-hint">Existing passwords cannot be unscrambled. You can only set a new one.</p>
            <footer>
              <button type="button" onClick={() => setPw(null)}>Cancel</button>
              <button className="save" disabled={busy}><Save /> Set password</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
//  People & payroll
// ---------------------------------------------------------------------
const DEPTS = ['Sales', 'Operations', 'Accounts', 'Logistics', 'Management', 'Support'];
const EMP_TYPES = [['full_time', 'Full time'], ['part_time', 'Part time'], ['contract', 'Contract'], ['intern', 'Intern']];
const EMP_STATUS = [['active', 'Active'], ['on_leave', 'On leave'], ['left', 'Left']];
const monthKey = d => { const x = d ? new Date(d) : new Date(); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1)).toISOString().slice(0, 10); };
const monthName = d => d ? new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';

function PeopleView({ token, profile, perms, notify }) {
  const { fmt } = useCurrency();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(null);
  const [view, setView] = useState('people');
  const [month, setMonth] = useState(monthKey());
  const canView = hasPerm(perms, profile?.role, 'hr.view');
  const manage = hasPerm(perms, profile?.role, 'hr.manage');
  const payMan = hasPerm(perms, profile?.role, 'payroll.manage');
  const payView = hasPerm(perms, profile?.role, 'payroll.view');

  async function load() {
    try {
      setData(await call('/api/hr?action=overview', token));
    } catch (e) {
      notify(e.message);
    }
  }

  useEffect(() => {
    if (canView) load();
  }, [canView]);

  async function saveEmp(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const b = Object.fromEntries(f);
    setBusy(true);
    try {
      await call('/api/hr?action=save-employee', token, { method: 'POST', body: JSON.stringify({ ...b, id: edit?.id }) });
      notify('Saved');
      setEdit(null);
      load();
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function prepare() {
    if (!confirm('Prepare payslips for ' + monthName(month) + '?\n\nSalary and commission are filled in from live figures.')) return;
    setBusy(true);
    try {
      const r = await call('/api/hr?action=prepare-payroll', token, { method: 'POST', body: JSON.stringify({ month }) });
      notify(r.message || `${r.created} payslip(s) prepared`);
      load();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id, status) {
    const ref = status === 'paid' ? prompt('Payment reference (optional) — e.g. TT number') : null;
    if (status === 'paid' && ref === null) return;
    try {
      await call('/api/hr?action=set-payslip-status', token, { method: 'POST', body: JSON.stringify({ id, status, reference: ref }) });
      notify('Payslip ' + status);
      load();
    } catch (e) {
      notify(e.message);
    }
  }

  async function savePayslip(e, row) {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await call('/api/hr?action=save-payslip', token, {
        method: 'POST',
        body: JSON.stringify({
          id: row.id,
          base_salary: f.get('base_salary'),
          commission: f.get('commission'),
          bonus: f.get('bonus'),
          deductions: f.get('deductions'),
          note: f.get('note')
        })
      });
      notify('Payslip updated');
      setOpen(null);
      load();
    } catch (err) {
      notify(err.message);
    }
  }

  if (!canView) {
    return (
      <div className="crm-empty">
        <ShieldAlert />
        <h3>Not available for your role</h3>
        <p>Ask an administrator for the “View staff records” permission.</p>
      </div>
    );
  }

  if (!data) return <div className="crm-empty"><RefreshCw /><h3>Loading…</h3></div>;

  const staff = data.employees || [];
  const slips = (data.payroll || []).filter(p => p.period_month === month);
  const totals = slips.reduce((a, p) => ({ net: a.net + Number(p.net_pay || 0), count: a.count + 1 }), { net: 0, count: 0 });
  const active = staff.filter(s => s.status === 'active');
  const teamRevenue = staff.reduce((a, s) => a + Number(s.performance?.orders_value || 0), 0);
  const teamComm = staff.reduce((a, s) => a + Number(s.performance?.commission_earned || 0), 0);

  return (
    <div className="crm-people">
      <div className="crm-page-head">
        <div><p>Staff records, measured sales performance and monthly payroll.</p></div>
        <div className="crm-tools">
          <div className="crm-seg">
            <button className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}>People</button>
            <button className={view === 'performance' ? 'on' : ''} onClick={() => setView('performance')}>Performance</button>
            {payView && <button className={view === 'payroll' ? 'on' : ''} onClick={() => setView('payroll')}>Payroll</button>}
          </div>
          <button onClick={load} title="Refresh"><RefreshCw /></button>
          {manage && <button className="crm-add" onClick={() => setEdit({})}><Plus /> Add person</button>}
        </div>
      </div>

      <div className="crm-kpis compact">
        {[
          [Users, 'Team members', active.length, staff.length - active.length + ' inactive'],
          [DollarSign, 'Payroll this month', fmt(active.reduce((a, s) => a + Number(s.base_salary || 0), 0)), 'Base salaries'],
          [TrendingUp, 'Sales credited', fmt(teamRevenue), 'All time'],
          [Wallet, 'Commission earned', fmt(teamComm), 'On credited sales']
        ].map(([I, l, v, s]) => (
          <article key={l} className="kpi-card">
            <i><I /></i>
            <span>{l}</span>
            <b>{v}</b>
            <small>{s}</small>
          </article>
        ))}
      </div>

      {view === 'people' && (
        <div className="crm-table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Type</th><th>Salary / mo</th><th>Comm.</th><th>Status</th><th /></tr></thead>
            <tbody>
              {staff.map(e => (
                <tr key={e.id}>
                  <td><b>{e.full_name}</b>{e.email && <><br /><small className="crm-dim">{e.email}</small></>}</td>
                  <td>{e.job_title || '—'}</td>
                  <td>{e.department}</td>
                  <td>{(EMP_TYPES.find(t => t[0] === e.employment_type) || [])[1] || e.employment_type}</td>
                  <td>{fmt(e.base_salary)}</td>
                  <td>{Number(e.commission_pct || 0)}%</td>
                  <td>
                    <em className={'crm-status ' + (e.status === 'active' ? 'active' : e.status === 'left' ? 'inactive' : 'pending')}>
                      {(EMP_STATUS.find(s => s[0] === e.status) || [])[1] || e.status}
                    </em>
                  </td>
                  <td className="crm-row-actions">{manage && <button onClick={() => setEdit(e)}>Edit</button>}</td>
                </tr>
              ))}
              {!staff.length && <tr><td colSpan={8} className="crm-dim">Nobody added yet. Press “Add person” to start.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {view === 'performance' && (
        <div className="crm-perf">
          {!staff.length && <div className="crm-empty"><TrendingUp /><h3>No staff yet</h3><p>Add people first, then credit orders to them.</p></div>}
          {staff.map(e => {
            const p = e.performance || {};
            const val = Number(p.orders_value || 0);
            const share = teamRevenue ? Math.round(val / teamRevenue * 100) : 0;
            return (
              <article key={e.id} className="perf-card">
                <header>
                  <div>
                    <b>{e.full_name}</b>
                    <small>{e.job_title || e.department}</small>
                  </div>
                  <em>{fmt(val)}</em>
                </header>
                <div className="perf-bar"><u style={{ width: Math.max(2, share) + '%' }} /></div>
                <div className="perf-stats">
                  <span><b>{p.orders_count || 0}</b><small>Orders</small></span>
                  <span><b>{p.orders_completed || 0}</b><small>Completed</small></span>
                  <span><b>{fmt(p.revenue_delivered)}</b><small>Delivered</small></span>
                  <span><b>{fmt(p.commission_earned)}</b><small>Commission</small></span>
                  <span><b>{p.leads_active || 0}</b><small>Live leads</small></span>
                  <span><b>{share}%</b><small>Of team sales</small></span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {view === 'payroll' && payView && (
        <div className="crm-payroll">
          <div className="payroll-bar">
            <label>Month<input type="month" value={month.slice(0, 7)} onChange={e => setMonth(monthKey(e.target.value + '-01'))} /></label>
            <div className="payroll-total"><small>Net payable</small><b>{fmt(totals.net)}</b><em>{totals.count} payslip(s)</em></div>
            {payMan && <button className="crm-add" disabled={busy} onClick={prepare}><Plus /> Prepare {monthName(month).split(' ')[0]}</button>}
          </div>
          <div className="crm-table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Base</th><th>Commission</th><th>Bonus</th><th>Deductions</th><th>Net pay</th><th>Status</th><th /></tr></thead>
              <tbody>
                {slips.map(p => (
                  <tr key={p.id}>
                    <td><b>{p.full_name}</b><br /><small className="crm-dim">{p.job_title || p.department}</small></td>
                    <td>{fmt(p.base_salary)}</td>
                    <td>{fmt(p.commission)}</td>
                    <td>{fmt(p.bonus)}</td>
                    <td>{Number(p.deductions) ? '−' + fmt(p.deductions) : '—'}</td>
                    <td><b>{fmt(p.net_pay)}</b></td>
                    <td>
                      <em className={'crm-status ' + (p.status === 'paid' ? 'active' : p.status === 'approved' ? 'pending' : '')}>{pretty(p.status)}</em>
                      {p.paid_on && <><br /><small className="crm-dim">{date(p.paid_on)}{p.reference ? ' · ' + p.reference : ''}</small></>}
                    </td>
                    <td className="crm-row-actions">
                      {payMan && p.status !== 'paid' && <button onClick={() => setOpen(p)}>Adjust</button>}
                      {payMan && p.status === 'draft' && <button onClick={() => setStatus(p.id, 'approved')}><Check size={14} /> Approve</button>}
                      {payMan && p.status === 'approved' && <button onClick={() => setStatus(p.id, 'paid')}><Wallet size={14} /> Mark paid</button>}
                    </td>
                  </tr>
                ))}
                {!slips.length && <tr><td colSpan={8} className="crm-dim">No payslips for {monthName(month)}.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {edit && (
        <div className="crm-modal-bg" onMouseDown={() => setEdit(null)}>
          <form className="crm-editor wide" onMouseDown={e => e.stopPropagation()} onSubmit={saveEmp}>
            <header>
              <div><small>{edit.id ? 'EDIT PERSON' : 'NEW PERSON'}</small><h2>{edit.full_name || 'Add a team member'}</h2></div>
              <button type="button" onClick={() => setEdit(null)}><X /></button>
            </header>
            <div className="crm-editor-fields two">
              <label>Full name<input name="full_name" defaultValue={edit.full_name || ''} required /></label>
              <label>Job title<input name="job_title" defaultValue={edit.job_title || ''} placeholder="Senior Sales Executive" /></label>
              <label>Email<input name="email" type="email" defaultValue={edit.email || ''} /></label>
              <label>Phone<input name="phone" defaultValue={edit.phone || ''} /></label>
              <label>Department<select name="department" defaultValue={edit.department || 'Sales'}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></label>
              <label>Employment type<select name="employment_type" defaultValue={edit.employment_type || 'full_time'}>{EMP_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Monthly salary (USD)<input name="base_salary" type="number" step="0.01" min="0" defaultValue={edit.base_salary || 0} /></label>
              <label>Commission %<input name="commission_pct" type="number" step="0.1" min="0" max="100" defaultValue={edit.commission_pct || 0} /></label>
              <label>Joined on<input name="joined_on" type="date" defaultValue={(edit.joined_on || '').slice(0, 10)} /></label>
              <label>Status<select name="status" defaultValue={edit.status || 'active'}>{EMP_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="span2">Bank details<input name="bank_details" defaultValue={edit.bank_details || ''} placeholder="Account or IBAN for salary transfer" /></label>
              <label className="span2">Notes<textarea name="notes" rows={2} defaultValue={edit.notes || ''} /></label>
            </div>
            <footer>
              <button type="button" onClick={() => setEdit(null)}>Cancel</button>
              <button className="save" disabled={busy}><Save /> {busy ? 'Saving…' : 'Save person'}</button>
            </footer>
          </form>
        </div>
      )}

      {open && (
        <div className="crm-modal-bg" onMouseDown={() => setOpen(null)}>
          <form className="crm-editor" onMouseDown={e => e.stopPropagation()} onSubmit={e => savePayslip(e, open)}>
            <header>
              <div><small>ADJUST PAYSLIP · {monthName(open.period_month)}</small><h2>{open.full_name}</h2></div>
              <button type="button" onClick={() => setOpen(null)}><X /></button>
            </header>
            <div className="crm-editor-fields two">
              <label>Base salary<input name="base_salary" type="number" step="0.01" defaultValue={open.base_salary} /></label>
              <label>Commission<input name="commission" type="number" step="0.01" defaultValue={open.commission} /></label>
              <label>Bonus<input name="bonus" type="number" step="0.01" defaultValue={open.bonus} /></label>
              <label>Deductions<input name="deductions" type="number" step="0.01" min="0" defaultValue={open.deductions} /></label>
              <label className="span2">Note<input name="note" defaultValue={open.note || ''} placeholder="Reason for adjustment" /></label>
            </div>
            <footer>
              <button type="button" onClick={() => setOpen(null)}>Cancel</button>
              <button className="save"><Save /> Save payslip</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
//  Approvals & Settings
// ---------------------------------------------------------------------
function ApprovalsView({ token, profile, perms, notify, onChange }) {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState('');
  const decide = hasPerm(perms, profile?.role, 'approvals.decide');

  async function load() {
    try {
      setList(await call('/api/approvals' + (filter ? '?status=' + filter : ''), token));
    } catch (e) {
      notify(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function act(id, decision) {
    setBusy(id);
    try {
      await call('/api/approvals?decide=1', token, { method: 'POST', body: JSON.stringify({ id, decision }) });
      notify(decision === 'approved' ? 'Approved and applied' : 'Rejected');
      load();
      onChange && onChange();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="crm-approvals">
      <div className="crm-page-head">
        <div><p>Sensitive deletion and modification requests awaiting review.</p></div>
        <div className="crm-tools">
          <label className="crm-filter">
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="applied">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </label>
          <button onClick={load}><RefreshCw /></button>
        </div>
      </div>
      {!list.length ? (
        <div className="crm-empty"><Check /><h3>Nothing waiting</h3><p>No {filter || ''} requests.</p></div>
      ) : (
        <div className="crm-approval-list">
          {list.map(a => (
            <article key={a.id} className={'approval ' + a.status}>
              <div className="approval-main">
                <em className={'crm-status ' + statusClass(a.status)}>{pretty(a.status)}</em>
                <b>{pretty(a.kind)} · {a.entity_label || pretty(a.entity_type)}</b>
                <small>Asked by {a.requested_by_name} · {new Date(a.created_at).toLocaleString()}</small>
                {a.reason && <p className="approval-reason">“{a.reason}”</p>}
                {a.decided_by_name && <small className="approval-decided">{pretty(a.status)} by {a.decided_by_name}</small>}
              </div>
              {a.status === 'pending' && decide && (
                <div className="approval-actions">
                  <button className="save" disabled={busy === a.id} onClick={() => act(a.id, 'approved')}><Check /> Approve</button>
                  <button className="crm-del" disabled={busy === a.id} onClick={() => act(a.id, 'rejected')}><Ban /> Reject</button>
                </div>
              )}
              {a.status === 'pending' && !decide && <span className="approval-wait"><Clock3 /> Waiting for administrator</span>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsView({ token, profile, perms, notify }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const canEdit = hasPerm(perms, profile?.role, 'settings.write');

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setForm).catch(() => setForm({}));
  }, []);

  if (!form) return <div className="crm-boot"><RefreshCw /><span>Loading settings…</span></div>;

  const fields = [
    ['contact_email', 'Contact email', 'The address shown on the website and where enquiries go'],
    ['contact_phone', 'Phone number', 'Shown on the contact page and in the footer'],
    ['contact_address', 'Address', 'Physical office address shown on the website'],
    ['whatsapp_number', 'WhatsApp number', 'The phone number for direct chat (digits and + only)'],
    ['whatsapp_message', 'WhatsApp greeting', 'Pre-filled message when someone taps WhatsApp'],
    ['enquiry_inbox', 'Enquiry inbox', 'Where website lead submissions are delivered'],
    ['default_customer_currency', 'Default customer currency', 'Preselected for new customer accounts, quotes and invoices', 'currency']
  ];

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await call('/api/settings', token, { method: 'PATCH', body: JSON.stringify(form) });
      notify('Website updated. Changes are visible immediately.');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-settings">
      <div className="crm-page-head"><div><p>Contact and operational details shown across the live website.</p></div></div>
      <form className="crm-settings-form" onSubmit={save}>
        <div className="crm-editor-fields">
          {fields.map(([k, label, hint, type]) => (
            <label key={k}>
              {label}
              {type === 'currency' ? (
                <select value={form[k] || 'USD'} disabled={!canEdit} onChange={e => setForm(v => ({ ...v, [k]: e.target.value }))}>
                  {['JPY','USD','EUR','GBP','PKR','AUD','NZD','CAD','AED','SAR','KES'].map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              ) : (
                <input value={form[k] ?? ''} disabled={!canEdit} onChange={e => setForm(v => ({ ...v, [k]: e.target.value }))} />
              )}
              <small>{hint}</small>
            </label>
          ))}
        </div>
        {canEdit ? (
          <footer><button className="save" disabled={busy}><Save /> {busy ? 'Saving…' : 'Save changes'}</button></footer>
        ) : (
          <p className="crm-hint"><ShieldAlert size={13} /> Your role cannot edit these settings.</p>
        )}
      </form>
      <RateManager token={token} canEdit={canEdit} notify={notify} />
    </div>
  );
}

// ---------------------------------------------------------------------
//  Customer Accounts & Ledger
// ---------------------------------------------------------------------
function AccountsList({ customers, onOpen }) {
  const { fmt } = useCurrency();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const searched = customers.filter(c => JSON.stringify(c).toLowerCase().includes(q.toLowerCase()));
  const list = filter === 'all' ? searched : searched.filter(c => statusClass(c.status) === filter);
  const sum = (f, init) => searched.reduce((a, c) => a + (f(c) || 0), init);
  const statuses = [...new Set(customers.map(c => statusClass(c.status)).filter(Boolean))];

  return (
    <div className="crm-accounts">
      <div className="crm-page-head">
        <div><p>Customer ledger balances, portal accounts and order payments.</p></div>
        <div className="crm-tools"><label><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers…" /></label></div>
      </div>

      <div className="acc-kpis">
        <article><span>Customers</span><b>{searched.length}</b><small>{statuses.filter(s => s !== 'vip').length ? ' incl. ' + statuses.filter(s => !['vip', 'active'].includes(s)).map(pretty).join(', ') : 'all active'}</small></article>
        <article className="gold"><span>Lifetime revenue</span><b>{fmt(sum(c => Number(c.total_spend)))}</b><small>Across all accounts</small></article>
        <article><span>Vehicles delivered</span><b>{sum(c => Number(c.vehicles_bought))}</b><small>Bought through AR7</small></article>
        <article><span>Portal access</span><b>{sum(c => (c.portal_enabled ? 1 : 0))}<i>/ {searched.length}</i></b><small>Customer logins enabled</small></article>
      </div>

      <div className="crm-chips">
        <button className={'crm-chip ' + (filter === 'all' ? 'active' : '')} onClick={() => setFilter('all')}>All <em>{searched.length}</em></button>
        {statuses.map(s => (
          <button key={s} className={'crm-chip ' + (filter === s ? 'active' : '')} onClick={() => setFilter(s)}>{pretty(s)} <em>{searched.filter(c => statusClass(c.status) === s).length}</em></button>
        ))}
      </div>

      {!list.length ? (
        <div className="crm-empty"><UserRound /><h3>No customers found</h3><p>Add customers in the Customers tab or clear the filters.</p></div>
      ) : (
        <div className="crm-account-grid">
          {list.map(c => (
            <article key={c.id} className="acc-card" onClick={() => onOpen(c.id)}>
              <div className="acc-top">
                <span className="acc-avatar">{(c.name || '?').slice(0, 2).toUpperCase()}</span>
                <em className={'crm-status ' + statusClass(c.status)}>{pretty(c.status || 'Active')}</em>
              </div>
              <h3>{c.name}</h3>
              <p className="acc-contact">{c.email || 'No email'}{c.phone ? <span> · {c.phone}</span> : null}</p>
              <dl>
                <div><dt>Country</dt><dd>{c.country || '—'}</dd></div>
                <div><dt>Portal</dt><dd className={c.portal_enabled ? 'ok' : ''}>{c.portal_enabled ? 'Active' : 'Not set up'}</dd></div>
                <div><dt>Lifetime spend</dt><dd className="spend">{fmt(c.total_spend)}</dd></div>
                <div><dt>Vehicles</dt><dd>{c.vehicles_bought ?? 0}</dd></div>
              </dl>
              <button>Open account <ChevronRight /></button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerAccount({ token, profile, perms, customerId, onBack, notify, listings }) {
  const { fmt } = useCurrency();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);

  const canOrder = hasPerm(perms, profile?.role, 'orders.write');
  const canPay = hasPerm(perms, profile?.role, 'payments.write');
  const canLoginAs = hasPerm(perms, profile?.role, 'customer.login_as');
  const canCust = hasPerm(perms, profile?.role, 'customers.write');

  async function load() {
    try {
      setD(await call('/api/customer-admin?action=dashboard&id=' + customerId, token));
    } catch (e) {
      notify(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [customerId]);

  async function post(action, body, method = 'POST') {
    setBusy(true);
    try {
      const r = await call('/api/customer-admin?action=' + action, token, { method, body: JSON.stringify(body) });
      await load();
      setModal(null);
      return r;
    } catch (e) {
      notify(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function loginAs() {
    try {
      const r = await post('login-as', { customer_id: customerId });
      if (r.url) {
        window.open(r.url, '_blank', 'noopener');
        notify('Opened their account in a new tab.');
      } else notify('Could not create the link.');
    } catch { }
  }

  if (!d) return <div className="crm-boot"><RefreshCw /><span>Loading account…</span></div>;

  const { customer, orders, payments, allocations, totals, login } = d;
  const unapplied = payments.filter(p => Number(p.unapplied) > 0);

  return (
    <div className="crm-customer">
      <button className="back-btn" onClick={onBack}><ArrowLeft size={15} /> All customers</button>
      <div className="cust-head">
        <div>
          <span className="acc-avatar big">{(customer.name || '?').slice(0, 2).toUpperCase()}</span>
          <div>
            <h2>{customer.name}</h2>
            <p>{customer.email || 'No email'} · {customer.country || '—'}</p>
          </div>
        </div>
        <div className="cust-head-actions">
          {canOrder && <button className="crm-add" onClick={() => setModal({ t: 'order' })}><Plus /> Add order</button>}
          {canOrder && <button onClick={() => setModal({ t: 'import' })}><Globe size={15} /> Import from website</button>}
          {canPay && <button onClick={() => setModal({ t: 'payment' })}><Wallet size={15} /> Record payment</button>}
        </div>
      </div>

      <div className="cust-kpis">
        {[
          ['Ordered', totals.ordered],
          ['Received', totals.received],
          ['Unapplied funds', totals.unapplied],
          ['Balance due', totals.due]
        ].map(([l, v]) => (
          <article key={l} className={l === 'Unapplied funds' && v > 0 ? 'highlight' : ''}>
            <span>{l}</span>
            <b>{fmt(v)}</b>
          </article>
        ))}
      </div>

      <section className="cust-panel">
        <h3>Website customer portal access</h3>
        {login ? (
          <div className="login-box">
            <div><small>LOGIN ID (EMAIL)</small><b>{login.email}</b></div>
            <div><small>LAST SIGNED IN</small><b>{login.last_sign_in_at ? new Date(login.last_sign_in_at).toLocaleString() : 'Never'}</b></div>
            <div className="login-actions">
              {canLoginAs && <button onClick={loginAs}><LogIn size={14} /> Open portal</button>}
              {canCust && <button onClick={() => setModal({ t: 'setpw' })}><KeyRound size={14} /> Set new password</button>}
              {canCust && (
                <button onClick={() => post('send-reset', { customer_id: customerId }).then(() => notify('Reset email sent to ' + login.email)).catch(() => {})}>
                  <Send size={14} /> Email reset link
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="login-box empty">
            <p>No website login created yet.</p>
            {canCust && <button className="crm-add" onClick={() => setModal({ t: 'portal' })}><Plus /> Create portal access</button>}
          </div>
        )}
      </section>

      <section className="cust-panel">
        <h3>Vehicle Orders</h3>
        {!orders.length ? <p className="muted">No orders yet.</p> : (
          <div className="crm-table-wrap">
            <table>
              <thead><tr><th>Order</th><th>Vehicle</th><th>Source</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td>{o.order_no}</td>
                    <td>{o.vehicle}</td>
                    <td><em className="crm-status">{o.source === 'website' ? 'Website' : 'Manual'}</em></td>
                    <td>{fmt(o.amount)}<CurrencyBadge record={o} /></td>
                    <td>{fmt(o.paid)}</td>
                    <td className={Number(o.balance_due) > 0 ? 'due' : 'clear'}>{fmt(o.balance_due)}</td>
                    <td><em className={'crm-status ' + statusClass(o.status)}>{pretty(o.status)}</em></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cust-panel">
        <h3>Payments received & allocation</h3>
        {!payments.length ? <p className="muted">No payments recorded.</p> : (
          <div className="ledger-list">
            {payments.map(p => (
              <article key={p.id}>
                <div className="ledger-main">
                  <b>{fmt(p.amount)} <small>{p.method}{p.tt_number ? ' · ' + p.tt_number : ''}</small><CurrencyBadge record={p} /></b>
                  <small>{date(p.received_at)}{p.bank ? ' · ' + p.bank : ''}</small>
                  <div className="ledger-split">
                    <span>Applied {fmt(p.applied)}</span>
                    <span className={Number(p.unapplied) > 0 ? 'unapplied' : ''}>Unapplied {fmt(p.unapplied)}</span>
                  </div>
                  {allocations.filter(a => a.payment_id === p.id).map(a => {
                    const ord = orders.find(o => o.id === a.order_id);
                    return (
                      <div className="alloc-row" key={a.id}>
                        <span><Link2 size={12} /> {fmt(a.amount)} → {ord ? ord.order_no + ' · ' + ord.vehicle : 'order'}</span>
                        {canPay && <button className="crm-del" title="Return to unapplied funds" onClick={() => post('unallocate&id=' + a.id, {}, 'DELETE')}><X size={12} /></button>}
                      </div>
                    );
                  })}
                </div>
                {canPay && Number(p.unapplied) > 0 && orders.some(o => Number(o.balance_due) > 0) && (
                  <button className="save" onClick={() => setModal({ t: 'apply', payment: p })}>Apply funds</button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <CustomerModal
          modal={modal}
          customer={customer}
          orders={orders}
          listings={listings}
          unapplied={unapplied}
          busy={busy}
          onClose={() => setModal(null)}
          post={post}
          notify={notify}
        />
      )}
    </div>
  );
}

function CustomerModal({ modal, customer, orders, listings, busy, onClose, post, notify }) {
  const { fmt } = useCurrency();
  const t = modal.t;
  const wrap = (title, sub, body, submit) => (
    <div className="crm-modal-bg" onMouseDown={onClose}>
      <form className="crm-editor" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <header><div><small>{sub}</small><h2>{title}</h2></div><button type="button" onClick={onClose}><X /></button></header>
        {body}
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="save" disabled={busy}><Save /> {busy ? 'Saving…' : 'Save'}</button></footer>
      </form>
    </div>
  );

  if (t === 'order') return wrap('Add order', 'NEW ORDER',
    <div className="crm-editor-fields">
      <label>Vehicle<input name="vehicle" required placeholder="e.g. 2022 Toyota Land Cruiser ZX" /></label>
      <CurrencyAmount name="amount" label="Amount" />
      <label>Stock no. (optional)<input name="stock_no" /></label>
      <label>Status<select name="status" defaultValue="pending">{['pending', 'confirmed', 'paid', 'shipped', 'delivered'].map(s => <option key={s} value={s}>{pretty(s)}</option>)}</select></label>
      <label>Notes<input name="notes" /></label>
    </div>,
    e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const amt = readCurrencyAmount(Object.fromEntries(f.entries()));
      post('order', { customer_id: customer.id, vehicle: f.get('vehicle'), amount: amt.amount, currency: amt.currency, amount_original: amt.amount_original, fx_rate: amt.fx_rate, stock_no: f.get('stock_no'), status: f.get('status'), notes: f.get('notes') })
        .then(() => notify('Order added')).catch(() => {});
    });

  if (t === 'import') return wrap('Import from website', 'PICK A SHOWROOM CAR',
    <div className="crm-editor-fields">
      <label>Website car
        <select name="listing_id" required defaultValue="">
          <option value="" disabled>Choose a car…</option>
          {listings.map(l => (
            <option key={l.id} value={l.id}>
              {[l.year, l.make, l.model].filter(Boolean).join(' ')} — {l.price} ({l.stock_no})
            </option>
          ))}
        </select>
      </label>
    </div>,
    e => {
      e.preventDefault();
      const f = new FormData(e.target);
      post('import-listing', { customer_id: customer.id, listing_id: f.get('listing_id') })
        .then(() => notify('Car imported into an order')).catch(() => {});
    });

  if (t === 'payment') return wrap('Record payment', 'FUNDS RECEIVED',
    <div className="crm-editor-fields">
      <CurrencyAmount name="amount" label="Amount received" />
      <label>Method<select name="method" defaultValue="TT">{['TT', 'Cash', 'Card', 'Cheque', 'Other'].map(m => <option key={m}>{m}</option>)}</select></label>
      <label>TT / reference number<input name="tt_number" placeholder="e.g. TT-40219" /></label>
      <label>Bank<input name="bank" /></label>
      <label>Date received<input name="received_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
      <label>Note<input name="note" /></label>
    </div>,
    e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const amt = readCurrencyAmount(Object.fromEntries(f.entries()));
      post('payment', { customer_id: customer.id, amount: amt.amount, currency: amt.currency, amount_original: amt.amount_original, fx_rate: amt.fx_rate, method: f.get('method'), tt_number: f.get('tt_number'), bank: f.get('bank'), received_at: f.get('received_at'), note: f.get('note') })
        .then(() => notify('Payment recorded as unapplied funds')).catch(() => {});
    });

  if (t === 'apply') {
    const p = modal.payment, openOrders = orders.filter(o => Number(o.balance_due) > 0);
    return wrap('Apply funds', 'UNAPPLIED ' + fmt(p.unapplied),
      <div className="crm-editor-fields">
        <label>Apply to order
          <select name="order_id" required defaultValue="">
            <option value="" disabled>Choose an order…</option>
            {openOrders.map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.vehicle} — due {fmt(o.balance_due)}</option>)}
          </select>
        </label>
        <label>Amount (base USD)<input name="amount" type="number" min="1" step="1" max={p.unapplied} defaultValue={Math.min(Number(p.unapplied), Number(openOrders[0]?.balance_due || p.unapplied))} required /></label>
      </div>,
      e => {
        e.preventDefault();
        const f = new FormData(e.target);
        post('allocate', { payment_id: p.id, order_id: f.get('order_id'), amount: f.get('amount') })
          .then(() => notify('Funds applied')).catch(() => {});
      });
  }

  if (t === 'portal') return wrap('Create website login', 'CUSTOMER PORTAL',
    <div className="crm-editor-fields">
      <label>Email (their login ID)<input name="email" type="email" required defaultValue={customer.email || ''} /></label>
      <label>Starting password<input name="password" minLength={8} required placeholder="At least 8 characters" /></label>
    </div>,
    e => {
      e.preventDefault();
      const f = new FormData(e.target);
      post('create-portal', { customer_id: customer.id, email: f.get('email'), password: f.get('password') })
        .then(() => notify('Website login created')).catch(() => {});
    });

  if (t === 'setpw') return wrap('Set new password', 'CUSTOMER LOGIN',
    <div className="crm-editor-fields">
      <label>New password<input name="password" minLength={8} required /></label>
    </div>,
    e => {
      e.preventDefault();
      const f = new FormData(e.target);
      post('set-customer-password', { customer_id: customer.id, password: f.get('password') })
        .then(() => notify('Password changed')).catch(() => {});
    });

  return null;
}
