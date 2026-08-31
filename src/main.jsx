import React, {useEffect, useRef, useState, useReducer} from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Sun, Moon, Menu, X, Search, SlidersHorizontal, Heart, Gauge, CalendarDays, Fuel, Ship, Gavel, BadgeCheck, ClipboardCheck, MapPin, ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Check, Mail, Phone, Camera, MessageCircle, Send, ArrowRight, Globe2, LockKeyhole, Play, Clock3, Monitor, Tablet, Smartphone, Laptop, UserPlus, CarFront, Eye, LogIn, Plane, ArrowLeftRight, Calculator, CreditCard, ShieldCheck, FileCheck, BadgePercent, Newspaper, BookOpen, Wrench, Landmark, UserCog, Share2, Layers } from 'lucide-react';
import './styles.css';
import './pages.css';
import './extra-pages.css';
import './motion-account.css';
import './landing-v2.css';
import './expanded.css';
import { WorldPage, BigNetworkGlobe, Flag } from './network.jsx';
// The CRM is only reached from the /crm route, so load it on demand
// instead of shipping it to every visitor.
const CrmApp = React.lazy(() => import('./crm.jsx'));
import { CustomerAccountPage, WhatsAppButton, useCustomerSession } from './customer-portal.jsx';
import { WhatsAppIcon } from './brand-icons.jsx';
import { useSettings, telHref, waLink } from './site-settings.js';
import { useSeo } from './seo.js';
import { CurrencyProvider, CurrencyDropdown, useCurrency } from './currency.jsx';
import { SiteHeader, logoOnError } from './site-header.jsx';
import { parseRoute, parseNavTarget, hrefFor, hrefFromTarget, hashFor, linkClick, findCar, carRef, writeLocation, inventoryHref } from './routing.js';
import './currency.css';
import './portal.css';

export const cars = [ {id:1, make:'Rolls-Royce', model:'Ghost', year:2023, km:'4,200', fuel:'Petrol', body:'Luxury', price:'$189,000', image:'/assets/lux/rolls-royce-ghost.jpg', grade:'5.0', status:'In Stock', location:'Yokohama', tr:'AT', drv:'AWD', eng:'6,750cc', seats:5, col:'Two-tone', st:'RHD'},
 {id:2, make:'Rolls-Royce', model:'Cullinan', year:2022, km:'9,800', fuel:'Petrol', body:'Luxury', price:'$205,000', image:'/assets/lux/rolls-royce-cullinan.jpg', grade:'5.0', status:'In Stock', location:'Tokyo', tr:'AT', drv:'AWD', eng:'6,750cc', seats:5, col:'Purple', st:'RHD'},
 {id:3, make:'Bentley', model:'Continental GT', year:2022, km:'7,600', fuel:'Petrol', body:'Luxury', price:'$168,000', image:'/assets/lux/bentley-continental-gt.jpg', grade:'5.0', status:'Auction', location:'USS Tokyo', tr:'DCT', drv:'AWD', eng:'6,000cc', seats:4, col:'White', st:'RHD'},
 {id:4, make:'Mercedes-Benz', model:'AMG GT 63', year:2021, km:'12,300', fuel:'Petrol', body:'Luxury', price:'$142,000', image:'/assets/lux/mercedes-amg-gt.jpg', grade:'4.5', status:'In Stock', location:'Osaka', tr:'DCT', drv:'AWD', eng:'4,000cc', seats:4, col:'Silver', st:'LHD'},
 {id:5, make:'BMW', model:'M8 Competition', year:2021, km:'15,200', fuel:'Petrol', body:'Luxury', price:'$118,000', image:'/assets/lux/bmw-m8-competition.jpg', grade:'4.5', status:'New Arrival', location:'Nagoya', tr:'DCT', drv:'AWD', eng:'4,400cc', seats:4, col:'Black', st:'RHD'},
 {id:6, make:'Lamborghini', model:'Huracan EVO', year:2020, km:'8,400', fuel:'Petrol', body:'Supercar', price:'$245,000', image:'/assets/lux/lamborghini-huracan.jpg', grade:'5.0', status:'Auction', location:'CAA Chubu', tr:'DCT', drv:'AWD', eng:'5,200cc', seats:2, col:'Orange', st:'RHD'},
 {id:7, make:'Ferrari', model:'F8 Tributo', year:2020, km:'6,900', fuel:'Petrol', body:'Supercar', price:'$265,000', image:'/assets/lux/ferrari-f8-tributo.jpg', grade:'5.0', status:'In Stock', location:'Yokohama', tr:'DCT', drv:'RWD', eng:'3,900cc', seats:2, col:'Red', st:'RHD'},
 {id:8, make:'Bugatti', model:'Chiron', year:2019, km:'2,100', fuel:'Petrol', body:'Hypercar', price:'$2,850,000', image:'/assets/lux/bugatti-chiron.jpg', grade:'5.0', status:'Auction', location:'USS Tokyo', tr:'DCT', drv:'AWD', eng:'8,000cc', seats:2, col:'Blue', st:'RHD'},
 {id:9, make:'Porsche', model:'911 Turbo S', year:2022, km:'5,300', fuel:'Petrol', body:'Supercar', price:'$205,000', image:'/assets/lux/porsche-911-turbo-s.jpg', grade:'5.0', status:'In Stock', location:'Kobe', tr:'DCT', drv:'AWD', eng:'3,800cc', seats:4, col:'Silver', st:'RHD'},
 {id:10, make:'McLaren', model:'720S', year:2021, km:'7,100', fuel:'Petrol', body:'Supercar', price:'$235,000', image:'/assets/lux/mclaren-720s.jpg', grade:'4.5', status:'Auction', location:'JU Aichi', tr:'DCT', drv:'RWD', eng:'4,000cc', seats:2, col:'Orange', st:'RHD'},
 {id:11, make:'Audi', model:'R8 V10', year:2021, km:'9,300', fuel:'Petrol', body:'Supercar', price:'$155,000', image:'/assets/gallery/audi-r8-v10-01.webp', grade:'4.5', status:'New Arrival', location:'Tokyo', tr:'DCT', drv:'AWD', eng:'5,200cc', seats:2, col:'Ascari Blue Metallic', st:'RHD'},
 {id:12, make:'Lexus', model:'LC 500', year:2021, km:'11,200', fuel:'Petrol', body:'Luxury', price:'$95,000', image:'/assets/gallery/lexus-lc-500-01.jpg', grade:'4.5', status:'In Stock', location:'Yokohama', tr:'AT', drv:'RWD', eng:'5,000cc', seats:4, col:'Champagne Metallic', st:'LHD'},
 {id:43, make:'Toyota', model:'Harrier S', year:2023, km:'24,204', fuel:'Petrol', body:'SUV', price:'$21,000', image:'/assets/inventory/700071023230260801001.jpg', grade:'4.5', status:'In Stock', location:'Hyogo', tr:'AT', drv:'2WD', eng:'2,000cc', seats:5, col:'Black', st:'RHD', stock_no:'0710232A30260801W001',images:['https://picture1.goo-net.com/7000710232/30260801/J/70007102323026080100100.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00101.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00102.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00103.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00104.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00105.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00106.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00107.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00108.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00109.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00110.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00111.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00112.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00113.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00114.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00115.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00116.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00117.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00118.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00119.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00120.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00121.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00122.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00123.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00124.jpg']}, {id:44, make:'Toyota', model:'Harrier Z Leather Package', year:2023, km:'14,000', fuel:'Petrol', body:'SUV', price:'$28,100', image:'/assets/inventory/988026080300208264002.jpg', grade:'4.5', status:'In Stock', location:'Gifu', tr:'AT', drv:'2WD', eng:'2,000cc', seats:5, col:'Silver Metallic', st:'RHD', stock_no:'0208264A20260802D002',images:['https://picture1.goo-net.com/9880260803/00208264/J/98802608030020826400200.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00201.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00202.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00203.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00204.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00205.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00206.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00207.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00208.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00209.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00210.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00211.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00212.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00213.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00214.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00215.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00216.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00217.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00218.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00219.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00220.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00221.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00222.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00223.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00224.jpg']}, {id:45, make:'Toyota', model:'Alphard 2.5S C Package', year:2021, km:'56,661', fuel:'Petrol', body:'MPV', price:'$27,700', image:'/assets/inventory/700054141330260802005.jpg', grade:'4.0', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'2,500cc', seats:7, col:'Black', st:'RHD', stock_no:'0541413A30260802W005',images:['https://picture1.goo-net.com/7000541413/30260802/J/70005414133026080200500.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00501.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00502.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00503.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00504.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00505.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00506.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00507.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00508.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00509.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00510.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00511.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00512.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00513.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00514.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00515.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00516.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00517.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00518.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00519.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00520.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00521.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00522.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00523.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00524.jpg']}, {id:46, make:'Honda', model:'Vezel Hybrid Z Honda Sensing', year:2016, km:'46,353', fuel:'Hybrid', body:'SUV', price:'$21,100', image:'/assets/inventory/700056103730260717002.jpg', grade:'4.5', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'1,500cc', seats:5, col:'Pearl White', st:'RHD', stock_no:'0561037A30260717W002',images:['https://picture1.goo-net.com/7000561037/30260717/J/70005610373026071700200.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00201.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00202.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00203.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00204.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00205.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00206.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00207.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00208.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00209.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00210.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00211.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00212.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00213.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00214.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00215.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00216.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00217.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00218.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00219.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00220.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00221.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00222.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00223.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00224.jpg']}, {id:47, make:'Mazda', model:'CX-30 20S L Package', year:2021, km:'41,000', fuel:'Petrol', body:'SUV', price:'$14,100', image:'/assets/inventory/700100197430260726001.jpg', grade:'4.0', status:'In Stock', location:'Hiroshima', tr:'AT', drv:'2WD', eng:'2,000cc', seats:5, col:'Gray Metallic', st:'RHD', stock_no:'1001974A30260726W001',images:['https://picture1.goo-net.com/7001001974/30260726/J/70010019743026072600100.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00101.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00102.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00103.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00104.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00105.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00106.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00107.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00108.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00109.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00110.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00111.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00112.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00113.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00114.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00115.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00116.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00117.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00118.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00119.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00120.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00121.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00122.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00123.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00124.jpg']}, {id:48, make:'Toyota', model:'Land Cruiser Prado TX', year:1996, km:'134,409', fuel:'Diesel', body:'SUV', price:'$16,600', image:'/assets/inventory/700052000730260404001.jpg', grade:'4.0', status:'In Stock', location:'Gunma', tr:'AT', drv:'4WD', eng:'3,000cc TD', seats:5, col:'Blue', st:'RHD', stock_no:'0520007A30260404W001',images:['https://picture1.goo-net.com/7000520007/30260404/J/70005200073026040400100.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00101.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00102.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00103.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00104.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00105.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00106.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00107.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00108.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00109.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00110.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00111.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00112.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00113.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00114.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00115.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00116.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00117.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00118.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00119.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00120.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00121.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00122.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00123.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00124.jpg']},  {id:49, make:'Toyota', model:'Alphard 2.5S C Package', year:2018, km:'111,252', fuel:'Petrol', body:'MPV', price:'$25,600', image:'https://picture1.goo-net.com/7000541413/30260804/J/70005414133026080400300.jpg', grade:'4.0', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'2,500cc', seats:7, col:'Pearl White', st:'RHD', stock_no:'0541413A30260804W003', images:['https://picture1.goo-net.com/7000541413/30260804/J/70005414133026080400300.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00301.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00302.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00303.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00304.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00305.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00306.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00307.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00308.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00309.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00310.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00311.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00312.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00313.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00314.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00315.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00316.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00317.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00318.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00319.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00320.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00321.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00322.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00323.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00324.jpg']}, {id:50, make:'Honda', model:'Vezel e:HEV Z', year:2026, km:'3', fuel:'Hybrid', body:'SUV', price:'$27,100', image:'https://picture1.goo-net.com/7000560922/30260625/J/70005609223026062500200.jpg', grade:'5.0', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'1,500cc', seats:5, col:'Pearl White', st:'RHD', stock_no:'0560922A30260625W002', images:['https://picture1.goo-net.com/7000560922/30260625/J/70005609223026062500200.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00201.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00202.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00203.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00204.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00205.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00206.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00207.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00208.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00209.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00210.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00211.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00212.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00213.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00214.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00215.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00216.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00217.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00218.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00219.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00220.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00221.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00222.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00223.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00224.jpg']}, {id:51, make:'Mazda', model:'CX-60 XD S Package', year:2023, km:'23,000', fuel:'Diesel', body:'SUV', price:'$21,900', image:'https://picture1.goo-net.com/9880260307/00704244/J/98802603070070424400100.jpg', grade:'4.0', status:'In Stock', location:'Okinawa', tr:'AT', drv:'2WD', eng:'3,300cc D', seats:5, col:'Black M', st:'RHD', stock_no:'0704244A20260306D001', images:['https://picture1.goo-net.com/9880260307/00704244/J/98802603070070424400100.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00101.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00102.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00103.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00104.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00105.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00106.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00107.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00108.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00109.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00110.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00111.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00112.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00113.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00114.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00115.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00116.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00117.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00118.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00119.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00120.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00121.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00122.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00123.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00124.jpg']}, {id:52, make:'Toyota', model:'Sienta Hybrid Z', year:2026, km:'13', fuel:'Hybrid', body:'MPV', price:'$27,800', image:'https://picture1.goo-net.com/7000710232/30260818/J/70007102323026081800700.jpg', grade:'S', status:'In Stock', location:'Hyogo', tr:'AT', drv:'2WD', eng:'1,500cc', seats:7, col:'Gray', st:'RHD', stock_no:'0710232A30260818W007', images:['https://picture1.goo-net.com/7000710232/30260818/J/70007102323026081800700.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00701.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00702.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00703.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00704.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00705.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00706.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00707.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00708.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00709.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00710.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00711.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00712.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00713.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00714.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00715.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00716.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00717.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00718.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00719.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00720.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00721.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00722.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00723.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00724.jpg']}, {id:53, make:'Toyota', model:'Hiace Wagon GL', year:2026, km:'3', fuel:'Petrol', body:'Van', price:'$35,900', image:'https://picture1.goo-net.com/9750260811/01157270/J/97502608110115727000100.jpg', grade:'5.0', status:'In Stock', location:'Ishikawa', tr:'AT', drv:'4WD', eng:'2,700cc', seats:10, col:'White', st:'RHD', stock_no:'1157270A20260810G001', images:['https://picture1.goo-net.com/9750260811/01157270/J/97502608110115727000100.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00101.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00102.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00103.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00104.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00105.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00106.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00107.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00108.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00109.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00110.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00111.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00112.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00113.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00114.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00115.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00116.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00117.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00118.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00119.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00140.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00141.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00142.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00143.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00144.jpg']}, {id:54, make:'Toyota', model:'Hilux Z GR Sport', year:2023, km:'22,000', fuel:'Diesel', body:'Pickup', price:'$36,200', image:'https://picture1.goo-net.com/9750260818/00402076/J/97502608180040207600100.jpg', grade:'4.5', status:'In Stock', location:'Tochigi', tr:'AT', drv:'4WD', eng:'2,400cc D', seats:5, col:'White', st:'RHD', stock_no:'0402076A20260817G001', images:['https://picture1.goo-net.com/9750260818/00402076/J/97502608180040207600100.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00101.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00102.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00103.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00104.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00105.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00106.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00107.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00108.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00109.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00110.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00111.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00112.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00113.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00114.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00115.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00116.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00117.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00118.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00119.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00120.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00121.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00122.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00123.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00124.jpg']}, {id:55, make:'Daihatsu', model:'Taft X', year:2026, km:'13', fuel:'Petrol', body:'Kei', price:'$11,900', image:'https://picture1.goo-net.com/7001301077/30260820/J/70013010773026082000100.jpg', grade:'S', status:'In Stock', location:'Ehime', tr:'AT', drv:'2WD', eng:'660cc', seats:4, col:'Gray', st:'RHD', stock_no:'1301077A30260820W001', images:['https://picture1.goo-net.com/7001301077/30260820/J/70013010773026082000100.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00101.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00102.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00103.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00104.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00105.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00106.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00107.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00108.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00109.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00110.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00111.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00112.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00113.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00114.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00115.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00116.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00117.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00118.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00119.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00120.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00121.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00122.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00123.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00124.jpg']}, {id:56, make:'Toyota', model:'Crown Sports Z', year:2025, km:'7,000', fuel:'Hybrid', body:'SUV', price:'$38,800', image:'https://picture1.goo-net.com/7000206487/30260816/J/70002064873026081600300.jpg', grade:'5.0', status:'In Stock', location:'Aichi', tr:'AT', drv:'4WD', eng:'2,500cc', seats:5, col:'Black', st:'RHD', stock_no:'0206487A30260816W003', images:['https://picture1.goo-net.com/7000206487/30260816/J/70002064873026081600300.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00301.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00302.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00303.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00304.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00305.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00306.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00307.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00308.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00309.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00310.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00311.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00312.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00313.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00314.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00315.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00316.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00317.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00318.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00319.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00320.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00321.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00322.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00323.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00324.jpg']}, {id:57, make:'Toyota', model:'Alphard Z', year:2026, km:'101', fuel:'Hybrid', body:'MPV', price:'$42,100', image:'https://picture1.goo-net.com/7000200421/30260821/Q/70002004213026082100400.jpg', grade:'S', status:'New Arrival', location:'Aichi', tr:'AT', drv:'2WD', eng:'2,500cc', seats:7, col:'Black', st:'RHD', stock_no:'0200421A30260821W004', images:['https://picture1.goo-net.com/7000200421/30260821/Q/70002004213026082100400.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00401.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00402.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00403.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00404.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00405.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00406.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00407.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00408.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00409.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00410.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00411.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00412.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00413.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00414.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00415.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00416.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00417.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00418.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00419.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00420.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00421.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00422.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00423.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00424.jpg']}, {id:58, make:'Toyota', model:'Land Cruiser 250 VX', year:2024, km:'15,000', fuel:'Petrol', body:'SUV', price:'$38,700', image:'https://picture1.goo-net.com/7000207429/30260819/Q/70002074293026081900700.jpg', grade:'5.0', status:'In Stock', location:'Aichi', tr:'AT', drv:'4WD', eng:'2,700cc', seats:7, col:'Black', st:'RHD', stock_no:'0207429A30260819W007', images:['https://picture1.goo-net.com/7000207429/30260819/Q/70002074293026081900700.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00701.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00702.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00703.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00704.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00705.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00706.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00707.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00708.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00709.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00710.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00711.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00712.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00713.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00714.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00715.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00716.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00717.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00718.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00719.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00720.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00721.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00722.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00723.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00724.jpg']}, {id:59, make:'Toyota', model:'Prius S', year:2017, km:'81,000', fuel:'Hybrid', body:'Sedan', price:'$10,600', image:'https://picture1.goo-net.com/7001002180/30260730/Q/70010021803026073000200.jpg', grade:'4.0', status:'In Stock', location:'Okayama', tr:'AT', drv:'2WD', eng:'1,800cc', seats:5, col:'White', st:'RHD', stock_no:'1002180A30260730W002', images:['https://picture1.goo-net.com/7001002180/30260730/Q/70010021803026073000200.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00201.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00202.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00203.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00204.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00205.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00206.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00207.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00208.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00209.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00210.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00211.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00212.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00213.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00214.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00215.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00216.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00217.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00218.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00219.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00220.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00221.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00222.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00223.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00224.jpg']}];


const DEST=[['Pakistan','Karachi / Port Qasim','18–24 days','Land Cruiser · Vezel · Mira',950],['UAE','Jebel Ali','18–22 days','Lexus · Patrol · Alphard',900],['Kenya','Mombasa','24–30 days','Harrier · Prado · Note',1250],['United Kingdom','Southampton','35–42 days','Vellfire · Skyline · Jimny',1500],['New Zealand','Auckland','20–26 days','Prius · CX-5 · Forester',1150],['Tanzania','Dar es Salaam','25–32 days','RAV4 · Hiace · Vitz',1300]];
const DUTY={'Pakistan':48,'UAE':5,'Kenya':25,'United Kingdom':10,'New Zealand':10,'Tanzania':25};
const money=n=>'$'+n.toLocaleString('en-US');
const priceOf=c=>typeof c?.price==='number'?c.price:Number(String(c?.price??'').replace(/[^0-9.]/g,''))||0;
const statusSlug=s=>String(s||'in-stock').replace(/\s+/g,'').toLowerCase();
// Vehicle price in the visitor's chosen currency. Base (USD) keeps the exact
// string the CRM published; other currencies convert it with the live rate.
const useCarPrice=()=>{const {fmt,isBase}=useCurrency();return c=>isBase&&typeof c?.price==='string'&&c.price.trim()?c.price:fmt(priceOf(c))};
const stockNo=c=>c.stock_no||('AR7-'+(26000+c.id));
const estimateFor=(c,dest)=>{const d=DEST.find(x=>x[1]===dest)||DEST[0];const p=priceOf(c);const freight=Math.round(d[4]+p*0.016);const docs=350;const ins=Math.round(p*0.016);return{d,freight,docs,ins,cif:p+freight+docs+ins,days:(d[2].match(/\d+/)||[19])[0]}};
const BRANDS=()=>{const m={};cars.forEach(c=>{(m[c.make]=m[c.make]||[]).push(c)});return Object.keys(m).sort((a,b)=>m[b].length-m[a].length).map(k=>({name:k,count:m[k].length,models:[...new Set(m[k].map(c=>c.model.split(' ')[0]))].slice(0,4)}))};
const NEWS=[
 {cat:'MARKET WATCH',date:'Aug 18, 2026',min:4,img:'/assets/japanese-car-auction-inspection-shipping-3.jpg',title:'Why Land Cruiser demand keeps climbing in Pakistan',ex:'Auction prices, popular grades and what a realistic budget looks like this quarter.',body:'KARACHI — Demand for the Land Cruiser family continues to outpace supply at Japanese auction houses. Grade 4.5 and above units are being bid out within the first two minutes of USS Tokyo sessions, and clean 2020–2022 examples are holding value exceptionally well.\n\nFor buyers, our advice: set your maximum bid before the session, avoid pre-bid locking on high-demand lots, and ask our team to pull the auction sheet translation before you commit.\n\nAR7 clients in Pakistan imported over 60 Land Cruisers and Prados in the last 12 months, with 92% arriving within the quoted vessel window.'},
 {cat:'BUYING GUIDE',date:'Aug 11, 2026',min:5,img:'/assets/japanese-car-auction-inspection-shipping-1.jpg',title:'Auction sheet decoded: what R, A and 4.5 really mean',ex:'Every mark on a Japanese auction sheet explained simply — so you bid with confidence.',body:'A Japanese auction sheet is a condition report written in a shorthand of its own. Grades run from S (near-new) down through 4.5, 4.0, 3.5. Subjective marks like A (minor wear), B (scratches) and the dreaded R (repair history) appear next to each panel.\n\nAR7 translates every sheet into plain English and flags anything our inspection team wants verified by photo before you bid.\n\nRule of thumb: for export, aim for grade 4.0+, no R marks on structure, and always ask for underbody photos on diesel 4WD models.'},
 {cat:'LOGISTICS',date:'Aug 04, 2026',min:3,img:'/assets/japanese-car-auction-inspection-shipping-5.webp',title:'RoRo vs container: which shipping method fits your car?',ex:'Costs, protection and loading windows for both methods — with demo numbers.',body:'RoRo (roll-on, roll-off) is the cheapest way to move a drivable car between continents, but your vehicle shares the deck with hundreds of others. Container shipping adds roughly $1,800–$2,500 on Japan–Karachi routes but gives you a sealed, private hold.\n\nWe recommend RoRo for standard stock under $45,000 and containers for premium, low-mileage or modified vehicles.\n\nEvery AR7 shipment includes marine insurance at 1.6% of vehicle value, whether RoRo or container.'},
 {cat:'AUCTION',date:'Jul 28, 2026',min:4,img:'/assets/japanese-car-auction-inspection-shipping-2.jpg',title:'How online bidding works with AR7',ex:'Deposits, bid limits, translations and the exact flow from your screen to the auction floor.',body:'1) Fund a returnable bidding deposit (demo: $500). 2) Browse lots with our team, pick your target and set a hard maximum. 3) We bid live at the auction house on your behalf — you watch status in the portal. 4) Win or lose, you see the result within minutes.\n\nAfter a win, we issue an invoice, arrange payment, inspect and photograph the vehicle, then book your vessel.\n\nBid prices are in Japanese yen excluding freight; our auto-calculator shows your CIF cost to your port before you confirm.'}
];
const HOWBUY=[['Tell us the car','Share make, model, year, budget and destination port. We shortlist stock and auction matches.','01'],['Get translated sheets','Full English summary of every auction sheet, with photos of flags and repair marks.','02'],['Set a bid limit','Agree a hard maximum before bidding — no surprises, no escalation.','03'],['We bid for you','Our licensed agents bid live at USS, TAA, JU, CAA and more; you follow in the portal.','04'],['Inspect & prepare','Independent photos, underbody check, auction sheet-verified condition, minor servicing.','05'],['Pay in stages','Deposit activates bidding; balance splits before and after shipment per your invoice.','06'],['Export paperwork','Invoice, export certificate, bill of lading, insurance — all handled by our desk.','07'],['Track to your port','Live milestones from Japan yard to your port, with customs-ready documents on arrival.','08']];
const PAYMENTS=[['Bank transfer (T/T)','Direct USD or JPY transfer to our corporate account. Most common worldwide.',Landmark],['Card payment','Visa / Mastercard for smaller balances via secure gateway.',CreditCard],['PayPal','Convenient for demo and small-vehicle purchases.',BadgePercent],['AR7 escrow','Funds released to us only when your vehicle is loaded and documents issued.',ShieldCheck]];

const FLAG={'Pakistan':'🇵🇰','UAE':'🇦🇪','Kenya':'🇰🇪','Tanzania':'🇹🇿','United Kingdom':'🇬🇧','New Zealand':'🇳🇿','Australia':'🇦🇺','USA':'🇺🇸','Other':'🌍'};
const LOGO=m=>'/assets/logos/'+m.toLowerCase()+'.png';
const CHASSIS={'Toyota':'6AA-TXUA85','Nissan':'6AA-SNE12','Honda':'6AA-RV5','Lexus':'GYL25','Suzuki':'CBA-ZC33S','Mazda':'3DA-KF2P','Mitsubishi':'DLA-GG2W','Subaru':'5AA-SKE','Daihatsu':'6BA-LA800','BMW':'WBA5F1','Mercedes-Benz':'205042','Audi':'F5DPBF','Rolls-Royce':'SCA6L','Bentley':'SCBGH','Lamborghini':'ZHW','Ferrari':'ZFF','Bugatti':'VF9','Porsche':'WP0','McLaren':'SBM'};
const DOORS={'SUV':5,'MPV':5,'Hatchback':5,'Sedan':4,'Van':4,'Kei':5};
const FEATPOOL=['Power steering','Air conditioner','Airbag','ABS','Navigation','Alloy wheels','Keyless entry','Backup camera','Cruise control','LED headlights','Roof rails','Rear spoiler','Massage seats','Bespoke Nappa leather','Carbon ceramic brakes','Launch control','Burmester sound','Panoramic roof','Rear entertainment','Air suspension','Night vision','Alcantara interior','21-inch alloys','Quad exhaust','Adaptive aerodynamics','Track telemetry'];
cars.forEach((c,i)=>{c.doors=DOORS[c.body]||4;c.chassis=(CHASSIS[c.make]||'6AA-0000')+'-'+(1200+i*7);c.int=c.id===11?'Black Fine Nappa Leather':c.id===12?'Toasted Caramel':['Gray','Black','Beige'][i%3];c.ven=['USS Tokyo','TAA Kinki','JU Aichi','CAA Chubu','HAA Kobe'][i%5];c.arr=new Date(2026,7,1+((i*3)%28)).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});c.feats=FEATPOOL.filter((f,k)=>((i*31+k*13)%11)<6).slice(0,6).concat(['New battery','Service records']);if(!c.stock_no)c.stock_no='AR7-'+(26000+c.id)});
// ---------------------------------------------------------------------------
// Live content hydration.
// The arrays above remain the built-in fallback so the site NEVER renders blank
// if the API is unreachable. When /api/site-content returns published rows the
// CRM has authored, we merge them into `cars` in place (same array identity,
// so every module-scope derivation above stays valid), then notify React.
// ---------------------------------------------------------------------------
const enrichCar=(c,i)=>{c.doors=DOORS[c.body]||4;c.chassis=(CHASSIS[c.make]||'6AA-0000')+'-'+(1200+i*7);c.int=c.int||['Gray','Black','Beige'][i%3];c.ven=c.ven||['USS Tokyo','TAA Kinki','JU Aichi','CAA Chubu','HAA Kobe'][i%5];c.arr=c.arr||new Date(2026,7,1+((i*3)%28)).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});c.feats=c.feats||FEATPOOL.filter((f,k)=>((i*31+k*13)%11)<6).slice(0,6).concat(['New battery','Service records']);return c};
const contentListeners=new Set();
let contentHydrated=false;
export const onContentChange=fn=>{contentListeners.add(fn);return()=>contentListeners.delete(fn)};
export const isContentHydrated=()=>contentHydrated;
const listingId=r=>{
 if(r?.id!=null&&String(r.id).trim()!=='')return r.id;
 const n=Number(r?.sort_order);
 return Number.isFinite(n)&&n>0?n:null;
};
async function hydrateSiteContent(){
 try{
  const res=await fetch('/api/site-content?entity=listings');
  if(res.ok){
   const rows=await res.json();
   if(Array.isArray(rows)&&rows.length){
    const mapped=rows.map((r,i)=>enrichCar({...r,id:listingId(r)??(i+1),image:r.image||'/assets/ar7-mark.png'},i));
    cars.length=0;cars.push(...mapped);
   }
  }
 }catch{/* offline or not provisioned yet — keep built-in content */}
 contentHydrated=true;
 contentListeners.forEach(fn=>{try{fn()}catch{}});
}
if(typeof window!=='undefined')hydrateSiteContent();

const VEHICLE_GALLERIES={
 11:[1,2,3,4,5].map(n=>`/assets/gallery/audi-r8-v10-${String(n).padStart(2,'0')}.webp`),
 12:[1,2,3,4,5].map(n=>`/assets/gallery/lexus-lc-500-${String(n).padStart(2,'0')}.jpg`)
};
// Never mix photographs from different vehicles. Uses custom vehicle photo gallery
// configured via CRM when present, otherwise verified model galleries or cover image.
const galleryFor=c=>{
 if(Array.isArray(c.images)&&c.images.length)return c.images;
 if(typeof c.images==='string'&&c.images.trim()){
  try{
   const p=JSON.parse(c.images);
   if(Array.isArray(p)&&p.length)return p;
  }catch{
   const s=c.images.split(',').map(x=>x.trim()).filter(Boolean);
   if(s.length)return s;
  }
 }
 return VEHICLE_GALLERIES[c.id]||(c.image?[c.image]:['/assets/ar7-mark.png']);
};

// Real anchor for in-app pages. Renders a true href (so the browser's
// right-click / Ctrl+click "open in new tab" works everywhere) but keeps
// single-page-app navigation for plain left-clicks via linkClick.
function PageLink({to, navigate, opts, className, children, ...rest}) {
  return <a href={hrefFromTarget(to)} className={className} onClick={linkClick(to, navigate, opts)} {...rest}>{children}</a>;
}

function VehicleCard({c,onOpen,comp,onCmp}){const price=useCarPrice();
 const href=hrefFor('inventory',carRef(c));
 return <a className="car-card page-car" href={href} onClick={onOpen?linkClick(`inventory?car=${carRef(c)}`,()=>onOpen(c)):undefined}>
 <div className="car-image"><img loading="lazy" decoding="async" src={c.image} alt={`${c.make} ${c.model}`}/><span className={'status '+statusSlug(c.status)}>{c.status||'In Stock'}</span><span className="grade">Grade <b>{c.grade}</b></span></div>
 <div className="car-info"><div className="make"><img loading="lazy" decoding="async" width="34" height="22" src={LOGO(c.make)} alt="" onError={logoOnError}/>{c.make}</div><h3>{c.model}</h3><div className="specs"><span><CalendarDays/> {c.year}</span><span><Gauge/> {c.km} km</span><span><Fuel/> {c.fuel}</span><span><ArrowLeftRight/> {c.tr}</span></div><div className="car-bottom"><div><small>EXPORT PRICE FROM</small><b>{price(c)}</b></div><span className={"cmp-chip "+(comp?'on':'')} onClick={e=>{e.preventDefault();e.stopPropagation();onCmp&&onCmp(c)}}><ArrowLeftRight/>{comp?'Added':'Compare'}</span><span className="card-open"><ArrowUpRight/></span></div><div className="loc"><MapPin/> {c.location}, Japan</div></div>
 </a>}

const rotatingCarIds=()=>{const picks=[0,2,5,6,7,8,10].map(i=>cars[i]).filter(Boolean);return picks.length?picks:cars.slice(0,7).filter(Boolean)};
const heroAuctions=[
 {name:'USS Tokyo',city:'Tokyo',seconds:2*3600+14*60+38},
 {name:'JU Aichi',city:'Nagoya',seconds:5*3600+48*60+12},
 {name:'TAA Kinki',city:'Osaka',seconds:8*3600+32*60+44},
 {name:'CAA Chubu',city:'Gifu',seconds:12*3600+5*60+27},
 {name:'HAA Kobe',city:'Kobe',seconds:20*3600+18*60+9}
];
const heroRoutes=[
 {from:'Yokohama',to:'Karachi',progress:64,eta:'16 days',status:'Vessel departed'},
 {from:'Kobe',to:'Jebel Ali',progress:47,eta:'18 days',status:'Crossing East China Sea'},
 {from:'Nagoya',to:'Mombasa',progress:31,eta:'24 days',status:'Departed Japan'},
 {from:'Tokyo',to:'Southampton',progress:78,eta:'9 days',status:'Entering Mediterranean'},
 {from:'Osaka',to:'Auckland',progress:55,eta:'13 days',status:'Pacific passage'}
];
const formatCountdown=seconds=>{const s=Math.max(0,Math.floor(seconds));const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60;return (d?d+'d ':'')+[h,m,x].map(n=>String(n).padStart(2,'0')).join(':')};

function HeroVisual({navigate}){
 const wrap=useRef(null);
 const price=useCarPrice();
 const auctionEnds=useRef(heroAuctions.map(a=>Date.now()+a.seconds*1000));
 const [idx,setIdx]=useState(0);
 const [auctionIdx,setAuctionIdx]=useState(0);
 const [routeIdx,setRouteIdx]=useState(0);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{
  const el=wrap.current;let visible=true,carTimer=null,auctionTimer=null,routeTimer=null,tickTimer=null;
  const start=()=>{if(carTimer)return;carTimer=setInterval(()=>setIdx(v=>v+1),3200);auctionTimer=setInterval(()=>setAuctionIdx(v=>(v+1)%heroAuctions.length),5200);routeTimer=setInterval(()=>setRouteIdx(v=>(v+1)%heroRoutes.length),6200);tickTimer=setInterval(()=>setNow(Date.now()),1000)};
  const stop=()=>{[carTimer,auctionTimer,routeTimer,tickTimer].forEach(clearInterval);carTimer=auctionTimer=routeTimer=tickTimer=null};
  const io=new IntersectionObserver(en=>{visible=en[0].isIntersecting;visible?start():stop()},{threshold:.05});
  if(el)io.observe(el);start();
  return()=>{stop();io.disconnect()}
 },[]);
 const onMove=e=>{const el=wrap.current;if(!el)return;const r=el.getBoundingClientRect();const mx=((e.clientX-r.left)/r.width-.5).toFixed(3),my=((e.clientY-r.top)/r.height-.5).toFixed(3);el.style.setProperty('--mx',mx);el.style.setProperty('--my',my)};
 const onLeave=()=>{const el=wrap.current;if(!el)return;el.style.setProperty('--mx','0');el.style.setProperty('--my','0')};
 const rotatingCars=rotatingCarIds();
 const c=rotatingCars[idx%Math.max(rotatingCars.length,1)]||cars[0];
 const auction=heroAuctions[auctionIdx];
 const route=heroRoutes[routeIdx];
 const remaining=(auctionEnds.current[auctionIdx]-now)/1000;
 if(!c)return null;
 return <div className="hero-visual" ref={wrap} onMouseMove={onMove} onMouseLeave={onLeave}>
  <i className="spark s1"/><i className="spark s2"/><i className="spark s3"/><i className="spark s4"/><i className="spark s5"/><i className="spark s6"/>
  <div className="hero-orb" title="AR7 360° world"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div>
  <a className="hero-card car-main" href={hrefFor('inventory',carRef(c))} onClick={linkClick(`inventory?car=${carRef(c)}`,navigate)} title={`View ${c.make} ${c.model}`}>
   <div className="hero-stack">{rotatingCars.map((x,n)=><img key={x.id} className={n===idx%rotatingCars.length?'active':''} src={x.image} alt={`${x.make} ${x.model}`} fetchPriority={n===0?'high':'auto'} decoding="async"/>)}</div>
   <div className="image-shade"/>
   <div className="car-float-title" key={idx}>
    <span>{c.status.toUpperCase()}</span><h3>{c.make} {c.model}</h3><p>{c.year} · Grade {c.grade} · {price(c)}</p>
   </div>
   <div className="car-dots">{rotatingCars.map((x,n)=><i key={x.id} className={n===idx%rotatingCars.length?'active':''}/>)}</div>
   <div className="car-counter"><CarFront/> {(idx%rotatingCars.length)+1}/{rotatingCars.length} · rotating stock</div>
  </a>
  <div className="floating-card auction-card" aria-live="polite"><Gavel/><div className="rotating-card-copy" key={auctionIdx}><span>NEXT AUCTION · {auction.city}</span><b>{auction.name}</b><small><Clock3/> Starts in {formatCountdown(remaining)}</small><div className="card-rotation-dots">{heroAuctions.map((_,n)=><i key={n} className={n===auctionIdx?'active':''}/>)}</div></div></div>
  <div className="floating-card route-card" aria-live="polite"><div className="rotating-card-copy" key={routeIdx}><div className="route-head"><Globe2/><span>LIVE ROUTE · {routeIdx+1}/{heroRoutes.length}</span></div><b>{route.from} - {route.to}</b><div className="progress" style={{'--route-progress':route.progress+'%'}}><span><Ship className="route-ship"/></span></div><small>{route.status} · ETA {route.eta}</small><div className="card-rotation-dots route-dots">{heroRoutes.map((_,n)=><i key={n} className={n===routeIdx?'active':''}/>)}</div></div></div>
  <div className="floating-badge"><BadgeCheck/><span>Verified<br/><b>Auction sheet</b></span></div>
 </div>}

const globeSeg=(s)=><div className="imap" key={s}>
  <span className="land l1"/><span className="land l2"/><span className="land l3"/><span className="land l4"/><span className="land l5"/>
  <svg className="iglobe-routes" viewBox="0 0 360 360" preserveAspectRatio="none" fill="none" aria-hidden="true"><path className="arc a1" d="M-20 128 Q150 14 380 118"/><path className="arc a2" d="M-20 224 Q165 326 380 208"/><path className="arc a3" d="M60 62 Q200 208 340 58"/></svg>
  <span className="imover m1"><CarFront/></span><span className="imover m2"><Ship/></span><span className="imover m3"><CarFront/></span>
 </div>;

function InteractiveGlobe({compact,lite,cls,onTap}){
 const ref=useRef(null);
 useEffect(()=>{
  const el=ref.current; if(!el)return;
  const st={x:0,vel:0,drag:false,lx:0,ly:0,tilt:0};
  let raf=0,prev=performance.now(),visible=true;
  const io=new IntersectionObserver(en=>{visible=en[0].isIntersecting},{threshold:0});
  io.observe(el);
  const loop=t=>{
   const dt=Math.min(t-prev,40);prev=t;
   if(visible&&!document.hidden){
    if(!st.drag){
     st.x+=0.10*dt/16;
     st.x+=st.vel*dt/16;st.vel*=Math.pow(0.93,dt/16);
     st.tilt+=(0-st.tilt)*0.045*dt/16;
    }
    const face=el.querySelector('.iglobe-face');const w=(face?face.offsetWidth:el.offsetWidth)||1;
    while(st.x<=-w)st.x+=w; while(st.x>0)st.x-=w;
    el.style.setProperty('--rot',st.x.toFixed(2)+'px');
    el.style.setProperty('--tilt',st.tilt.toFixed(2)+'deg');
   }
   raf=requestAnimationFrame(loop);
  };
  raf=requestAnimationFrame(loop);
  const dn=e=>{st.drag=true;st.moved=false;st.sx=e.clientX;st.sy=e.clientY;st.lx=e.clientX;st.ly=e.clientY;el.classList.add('dragging');if(el.setPointerCapture)try{el.setPointerCapture(e.pointerId)}catch(_){}}
  const mv=e=>{if(!st.drag)return;const dx=e.clientX-st.lx,dy=e.clientY-st.ly;st.lx=e.clientX;st.ly=e.clientY;st.x+=dx;st.vel=dx*0.82;st.tilt=Math.max(-16,Math.min(16,st.tilt+dy*0.10));if(Math.abs(e.clientX-st.sx)+Math.abs(e.clientY-st.sy)>7)st.moved=true}
  const up=()=>{if(!st.drag)return;st.drag=false;el.classList.remove('dragging');if(!st.moved&&onTap)onTap();}
  el.addEventListener('pointerdown',dn);
  window.addEventListener('pointermove',mv);
  window.addEventListener('pointerup',up);
  window.addEventListener('pointercancel',up);
  return()=>{cancelAnimationFrame(raf);io.disconnect();el.removeEventListener('pointerdown',dn);window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up)}
 },[]);
 return <div className={'iglobe'+(compact?' compact':'')+(lite?' lite':'')+(cls?' '+cls:'')} ref={ref}>
  <div className="iglobe-halo"/><div className="iglobe-sphere">
   <i className="graticule g1"/><i className="graticule g2"/><i className="graticule g3"/><i className="graticule g4"/><i className="graticule g5"/>
   <div className="iglobe-face">
    <div className="iglobe-maps">{[0,1,2].map(globeSeg)}</div>
    <i className="iglobe-shine"/>
    <span className="iglobe-pin p1"/><span className="iglobe-pin p2"/><span className="iglobe-pin p3"/>
   </div>
   <i className="iglobe-sheen"/>
  </div>
  <div className="orbit-ring o1"><span className="orbiter"><i className="orb-badge ship"><Ship/></i></span></div>
  <div className="orbit-ring o2"><span className="orbiter"><i className="orb-badge car"><CarFront/></i></span></div>
  <div className="orbit-ring o3"><span className="orbiter"><i className="orb-badge car alt"><CarFront/></i></span></div>
  {!lite&&<span className="iglobe-plane"><Plane/></span>}
  <span className="drag-hint"><i/> DRAG TO ROTATE · CLICK TO EXPLORE</span>
 </div>}

function MotionShowcase({navigate}){return <section className="motion-showcase"><div className="shell motion-grid"><div className="motion-copy"><div className="kicker">THE AR7 GLOBAL SUPPLY NETWORK</div><h2>Cars in motion.<br/><em>Trade without borders.</em></h2><p>Watch the demo route from auction floor to destination port. Every vehicle, document and milestone stays visible.</p><div className="motion-metrics"><span><b>14</b> Auction networks</span><span><b>06</b> Japan yards</span><span><b>35+</b> Export markets</span></div><div className="globe-legend"><span><i className="lg car"/> Fleet on route</span><span><i className="lg ship"/> 14 vessels at sea</span><span><i className="lg pin"/> 35+ destination ports</span></div></div><div className="globe-scene"><div className="globe-wrap"><InteractiveGlobe onTap={()=>navigate('world')}/><div className="float-label japan"><small>ORIGIN</small><b>Yokohama, Japan</b></div><div className="float-label shipment"><small>LIVE SHIPMENT</small><b>AR7-260184</b></div></div></div></div><div className="vehicle-track"><div className="track-streaks"/><div className="road-lines"/><div className="moving-plane"><Plane/></div><div className="moving-car convoy"><CarFront/></div><div className="moving-car"><CarFront/><span>AUCTION WON</span></div><div className="moving-ship"><Ship/><span>VESSEL BOOKED</span></div><p>USS TOKYO <i/> INSPECTION YARD <i/> YOKOHAMA PORT <i/> WORLDWIDE</p></div></section>}

function DeviceStudio({navigate}){
 const [device,setDevice]=useState('laptop');
 const sizes={phone:[390,720],tablet:[768,720],laptop:[1100,700],desktop:[1360,720]}; const [w,h]=sizes[device];
 return <section className="device-page"><div className="page-orb-wrap studio-orb"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="device-head"><div><div className="kicker">RESPONSIVE VIEW STUDIO</div><h1>Test every <em>screen.</em></h1><p>Switch devices to preview the AR7 website at realistic viewport sizes.</p></div><div className="device-tabs"><button className={device==='phone'?'active':''} onClick={()=>setDevice('phone')}><Smartphone/>Phone</button><button className={device==='tablet'?'active':''} onClick={()=>setDevice('tablet')}><Tablet/>Tablet</button><button className={device==='laptop'?'active':''} onClick={()=>setDevice('laptop')}><Laptop/>Laptop</button><button className={device==='desktop'?'active':''} onClick={()=>setDevice('desktop')}><Monitor/>PC</button></div></div><div className={'device-frame '+device} style={{'--frame-w':w+'px','--frame-h':h+'px'}}><div className="camera-dot"/><iframe src={'/?embed=1'} title="AR7 responsive preview"/></div><div className="device-size">{w} × {h} px · interactive demo</div></div></section>
}

function ExtraPage({type,navigate,openAuction}){
 const {fmt}=useCurrency();
 const [open,setOpen]=useState(0),[service,setService]=useState(0),[port,setPort]=useState('Karachi'),[portalTab,setPortalTab]=useState('Shipments');
 const headers={
  services:['WHAT WE DO',<>Complete vehicle<br/><em>sourcing solutions.</em></>,'Auction bidding, dealer sourcing, inspection, logistics and export paperwork—managed by one accountable team.'],
  destinations:['WORLDWIDE EXPORT',<>Routes built for<br/><em>your market.</em></>,'Demo destination guides, estimated transit times and popular vehicles for every region we serve.'],
  reviews:['CUSTOMER STORIES',<>Trusted across<br/><em>35+ countries.</em></>,'Realistic demo stories showing how AR7 supports private buyers, dealers and fleet customers.'],
  faq:['HELP CENTER',<>Clear answers.<br/><em>Confident buying.</em></>,'Everything you need to know about Japanese auctions, payment, inspection and international shipping.'],
  portal:['CLIENT PORTAL DEMO',<>Every update.<br/><em>One dashboard.</em></>,'Explore a working demo of the AR7 customer portal for bids, payments, documents and shipments.']};
 const h=headers[type];
 const services=[['Auction sourcing','Live access to USS, TAA, JU, CAA and more.','100,000+ weekly listings'],['Dealer stock','Curated off-auction vehicles from trusted networks.','Fast purchase decisions'],['Inspection','Independent condition checks, photos and road tests.','Clear condition report'],['Export logistics','Booking, customs, insurance and documentation.','35+ destination markets'],['Parts sourcing','Optional OEM parts and accessories before shipment.','Consolidated shipping'],['Dealer programs','Volume sourcing and dedicated account support.','Wholesale pricing']];
 const destinations=[['Pakistan','Karachi / Port Qasim','18–24 days','Land Cruiser · Vezel · Mira'],['UAE','Jebel Ali','18–22 days','Lexus · Patrol · Alphard'],['Kenya','Mombasa','24–30 days','Harrier · Prado · Note'],['United Kingdom','Southampton','35–42 days','Vellfire · Skyline · Jimny'],['New Zealand','Auckland','20–26 days','Prius · CX-5 · Forester'],['Tanzania','Dar es Salaam','25–32 days','RAV4 · Hiace · Vitz']];
 const questions=[['How do Japanese car auctions work?','Members inspect and bid on vehicles at professional auction houses. AR7 provides translated sheets, condition advice and places an agreed bid on your behalf.'],['Can I see the auction sheet before bidding?','Yes. Every shortlisted auction vehicle includes its original sheet plus an English summary from our sourcing team.'],['What is included in the export price?','The displayed demo price is a starting FOB estimate. Your final quotation itemizes vehicle cost, auction fee, inland transport, export documentation, freight and optional insurance.'],['How long does shipping take?','Transit depends on destination and vessel schedule. Typical routes range from 18 to 42 days after loading.'],['Can AR7 source a specific model?','Yes. Share your model, year, mileage, grade, color and budget. We monitor auctions and dealer networks until the right match appears.'],['How do I track my vehicle?','Clients receive portal access with inspection photos, payment milestones, vessel details, documents and arrival estimates.']];
 return <section className="inner-page extra-page"><div className="page-hero mini extra-head"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">{h[0]}</div><h1>{h[1]}</h1><p>{h[2]}</p>{type==='portal'?<PageLink className="gold-btn" to="account" navigate={navigate}>Open my real account <ArrowRight/></PageLink>:<button className="gold-btn" onClick={openAuction}>Talk to our team <ArrowRight/></button>}</div></div><div className="shell page-content">
 {type==='services'&&<><div className="service-layout"><div className="service-tabs">{services.map((x,i)=><button key={x[0]} className={service===i?'active':''} onClick={()=>setService(i)}><span>0{i+1}</span>{x[0]}<ArrowRight/></button>)}</div><div className="service-panel"><Gavel/><div className="kicker">AR7 SERVICE 0{service+1}</div><h2>{services[service][0]}</h2><p>{services[service][1]}</p><strong>{services[service][2]}</strong><ul><li><Check/> Dedicated Japan-based specialist</li><li><Check/> Transparent itemized quotation</li><li><Check/> Photo and status updates</li></ul><button className="primary" onClick={openAuction}>Request this service</button></div></div><div className="demo-strip">{[['14+','Auction partners'],['24h','Average response'],['100%','Cost transparency'],['1 team','End-to-end support']].map(x=><div key={x[1]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div></>}
 {type==='destinations'&&<><div className="destination-picker"><div><div className="kicker">DEMO ROUTE CALCULATOR</div><h2>Where are we shipping?</h2></div><select value={port} onChange={e=>setPort(e.target.value)}>{destinations.map(x=><option key={x[1]}>{FLAG[x[0]]} {x[1].split(' / ')[0]}</option>)}</select><button className="primary" onClick={openAuction}>Get shipping quote</button></div><div className="destination-grid">{destinations.map(x=><article key={x[1]}><Globe2/><div className="kicker">{FLAG[x[0]]} {x[0]}</div><h3>{x[1]}</h3><p><Ship/> Estimated transit: <b>{x[2]}</b></p><small>POPULAR: {x[3]}</small><button onClick={openAuction}>View market guide <ArrowRight/></button></article>)}</div></>}
 {type==='reviews'&&<><div className="review-summary"><div><b>4.9</b><span>★★★★★</span><small>Demo customer rating</small></div><p>“Communication was excellent from the auction sheet to vessel arrival. Every cost was explained before we bid.”</p></div><div className="review-grid">{[['AH','Ahmed H.','Pakistan','Toyota Prado','My agent checked three cars and told me not to bid on two. That honesty earned my trust.'],['MK','Mary K.','Kenya','Toyota Harrier','Photos, documents and shipping updates were all inside the portal. Very straightforward.'],['DO','Daniel O.','United Kingdom','Toyota Vellfire','The translated sheet and live advice made my first Japanese auction purchase easy.'],['SA','Saeed A.','UAE','Lexus RX450h','AR7 found the exact color and grade within nine days and handled the full export.'],['JM','James M.','New Zealand','Clear landed estimate, clean car and delivery within the expected vessel window.'],['FK','Fatima K.','Tanzania','The team answered every question and shared inspection videos before shipment.']].map(x=><article key={x[1]}><div><i>{x[0]}</i><span><b>{x[1]}</b><small>{FLAG[x[2]]||''} {x[2]} · {x[3]}</small></span></div><strong>★★★★★</strong><p>“{x[4]}”</p><BadgeCheck/></article>)}</div></>}
 {type==='faq'&&<div className="faq-layout"><div><div className="kicker">POPULAR QUESTIONS</div><h2>Buying from Japan, explained.</h2><p>Click each question to explore the demo support content.</p><PageLink className="primary" to="contact" navigate={navigate}>Ask another question</PageLink></div><div className="accordions">{questions.map((x,i)=><article key={x[0]} className={open===i?'open':''}><button onClick={()=>setOpen(open===i?-1:i)}><span>{x[0]}</span><b>{open===i?'−':'+'}</b></button>{open===i&&<p>{x[1]}</p>}</article>)}</div></div>}
 {type==='portal'&&<div className="portal-live-note"><ShieldCheck/><div><b>This is a preview of the dashboard.</b><span>Your own vehicles, every payment received and the balance remaining are waiting in your account.</span></div><PageLink className="primary" to="account" navigate={navigate}>Sign in <ArrowRight/></PageLink></div>}
 {type==='portal'&&<div className="portal-demo"><aside><img src="/assets/ar7-mark.png" alt="AR7 Traders"/>{['Shipments','Auctions','Documents','Payments'].map(x=><button key={x} className={portalTab===x?'active':''} onClick={()=>setPortalTab(x)}>{x}</button>)}<small>DEMO ACCOUNT<br/><b>Imran Khan</b></small></aside><main><header><div><small>CLIENT PORTAL / {portalTab.toUpperCase()}</small><h2>{portalTab}</h2></div><button onClick={openAuction}>Contact agent</button></header>{portalTab==='Shipments'?<div className="portal-shipment"><div className="portal-car"><img loading="lazy" decoding="async" src={cars[0].image} alt={`${cars[0].make} ${cars[0].model} for export from Japan`}/><span><small>AR7-260184</small><b>Toyota Land Cruiser ZX</b><em>Yokohama → Karachi</em></span><strong>IN TRANSIT</strong></div><div className="track-line">{['Purchased','Inspected','Loaded','At sea','Arrived'].map((x,i)=><span key={x} className={i<4?'done':''}><i/>{x}<small>{i<4?'Complete':'Sep 08'}</small></span>)}</div></div>:portalTab==='Auctions'?<div className="portal-list">{cars.slice(1,5).map(c=><VehicleCard key={c.id} c={c}/>)}</div>:portalTab==='Documents'?<div className="doc-list">{['Commercial invoice.pdf','Export certificate.pdf','Bill of lading.pdf','Inspection report.pdf'].map((x,i)=><button key={x} onClick={openAuction}><ClipboardCheck/><span><b>{x}</b><small>Updated Aug {12+i}, 2026 · PDF</small></span><ArrowUpRight/></button>)}</div>:<div className="payment-card"><BadgeCheck/><h3>Account up to date</h3><p>All demo invoices have been paid.</p><div><span>Vehicle payment<b>{fmt(58900)}</b></span><span>Freight & insurance<b>{fmt(2480)}</b></span><span>Balance due<b>{fmt(0)}</b></span></div></div>}</main></div>}
 </div></section>
}


function ExtraPages2({type,navigate,openAuction}){
 const price=useCarPrice();
 const {fmt,toUsd,display}=useCurrency();
 const headers={
  brands:['BROWSE BY BRAND',<>Every brand.<br/><em>One doorway.</em></>,'Jump straight to the make you want — inventory, popular models and market notes for each brand.'],
  howbuy:['HOW IT WORKS',<>From Tokyo auction<br/><em>to your garage.</em></>,'The complete AR7 purchase flow — bidding, inspection, payment, paperwork and shipping, step by step.'],
  tools:['CALCULATORS',<>Know your numbers<br/><em>before you buy.</em></>,'Estimate freight, CIF cost and import duty to your port with our demo calculators.'],
  news:['AR7 NEWS & GUIDES',<>Market insight.<br/><em>Buying confidence.</em></>,'Auction analysis, buying guides and logistics explainers from our Japan team.']};
 const h=headers[type];
 const [shipDest,setShipDest]=useState('Karachi / Port Qasim'),[shipPrice,setShipPrice]=useState(25000),[shipMethod,setShipMethod]=useState('RoRo');
 const [dutyCountry,setDutyCountry]=useState('Pakistan'),[dutyPrice,setDutyPrice]=useState(25000);
 const [article,setArticle]=useState(null);
 return <section className="inner-page extra-page"><div className="page-hero mini extra-head"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">{h[0]}</div><h1>{h[1]}</h1><p>{h[2]}</p>{type!=='news'&&<button className="gold-btn" onClick={openAuction}>Talk to our team <ArrowRight/></button>}</div></div><div className="shell page-content">
 {type==='brands'&&<><div className="brand-grid">{BRANDS().map(b=><article className="brand-card" key={b.name}><span className="brand-tile"><img loading="lazy" decoding="async" width="56" height="34" src={LOGO(b.name)} alt={b.name+" logo"} onError={logoOnError}/><small>{b.name}</small></span><div className="brand-body"><div><b>{b.count} vehicles</b><span>now in stock</span></div><div className="brand-models">{b.models.map(m=><a href={inventoryHref(b.name)} onClick={linkClick(inventoryHref(b.name),navigate)} key={m}>{m}</a>)}</div><PageLink className="outline-btn" to={inventoryHref(b.name)} navigate={navigate}>View {b.name} stock <ArrowRight/></PageLink></div></article>)}</div><div className="demo-strip">{BRANDS().length===0?null:[['12','Brands catalogued'],['30','Vehicles in stock'],['100%','Auction-sourced'],['24h','New stock update']].map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div></>}
 {type==='howbuy'&&<><div className="howbuy-flow">{HOWBUY.map((x,i)=><div className="hb-step" key={x[2]}><span>{x[2]}</span><div><b>{x[0]}</b><p>{x[1]}</p></div>{i<HOWBUY.length-1&&<ArrowRight className="hb-arrow"/>}</div>)}</div><div className="hb-timeline"><div className="kicker">DEMO TIMELINE</div><h2>Typical days from bid to delivery.</h2><div className="hb-days">{[['Day 1','Deposit & bid'],['Day 2','Auction result'],['Day 3–6','Inspection & payment'],['Day 7','Vessel booking'],['Day 18–42','Transit to your port'],['Arrival','Customs & collection']].map(x=><span key={x[0]}><b>{x[0]}</b><small>{x[1]}</small></span>)}</div></div><div className="hb-pay"><div className="kicker">PAYMENT OPTIONS</div><h2>Pay the way your market prefers.</h2><div className="pay-grid">{PAYMENTS.map(x=>{const PI=x[2];return <article key={x[0]}><PI/><b>{x[0]}</b><p>{x[1]}</p></article>})}</div></div><div className="hb-docs"><div className="kicker">WITH EVERY SHIPMENT</div><h2>Documents we prepare for you.</h2><div className="doc-pills">{['Commercial invoice','Export certificate','Certificate of origin','Bill of lading','Insurance certificate','Sales contract'].map(x=><span key={x}><FileCheck/> {x}</span>)}</div></div></>}
 {type==='tools'&&<div className="tools-grid"><article className="tool-card"><BookOpen/><div className="kicker">DEMO CIF CALCULATOR</div><h3>Shipping cost to your port</h3><label>DESTINATION PORT<select value={shipDest} onChange={e=>setShipDest(e.target.value)}>{DEST.map(x=><option key={x[1]}>{x[1]}</option>)}</select></label><label>VEHICLE VALUE (FOB {display})<input type="number" value={shipPrice} onChange={e=>setShipPrice(Math.max(500,+e.target.value||0))}/></label><label>SHIPPING METHOD<select value={shipMethod} onChange={e=>setShipMethod(e.target.value)}><option>RoRo</option><option>Container (+$2,000)</option></select></label><div className="calc-out">{(()=>{const v=toUsd(shipPrice);const freight=Math.round(v*0.016+(DEST.find(x=>x[1]===shipDest)||DEST[0])[4]+(shipMethod==='Container (+$2,000)'?2000:0));const docs=350+Math.round(v*0.016);return <><span><small>FREIGHT</small><b>{fmt(freight)}</b></span><span><small>DOCS &amp; INSURANCE</small><b>{fmt(docs)}</b></span><span className="total"><small>EST. CIF TOTAL</small><b>{fmt(v+freight+docs)}</b></span></>})()}</div><small className="demo-note"><LockKeyhole/> Demo estimate in {display} — final quote issued by our export desk.</small></article><article className="tool-card"><Calculator/><div className="kicker">DEMO DUTY CALCULATOR</div><h3>Import duty &amp; taxes</h3><label>DESTINATION COUNTRY<select value={dutyCountry} onChange={e=>setDutyCountry(e.target.value)}>{Object.keys(DUTY).map(x=><option key={x}>{FLAG[x]} {x}</option>)}</select></label><label>VEHICLE VALUE ({display})<input type="number" value={dutyPrice} onChange={e=>setDutyPrice(Math.max(500,+e.target.value||0))}/></label><div className="calc-out"><span><small>EST. DUTY + TAX</small><b>{fmt(toUsd(dutyPrice)*DUTY[dutyCountry]/100)}</b></span><span className="total"><small>LANDED ESTIMATE (CIF + DUTY)</small><b>{fmt(toUsd(dutyPrice)*(1+DUTY[dutyCountry]/100))}</b></span></div><p className="tool-note">Percentages are demo approximations of common applied rates. Local registration fees and port charges vary — our team prepares the exact landed costing for your port.</p></article></div>}
 {type==='news'&&<>{article&&<article className="news-article"><button className="back-btn" onClick={()=>setArticle(null)}>← All articles</button><div className="kicker">{article.cat} · {article.date}</div><h2>{article.title}</h2><img loading="lazy" decoding="async" src={article.img} alt={article.title}/>{article.body.split('\n\n').map((x,i)=><p key={i}>{x}</p>)}<button className="primary" onClick={openAuction}>Ask our team about this <ArrowRight/></button></article>}
 {!article&&<div className="news-grid">{NEWS.map(x=><article key={x.title} onClick={()=>setArticle(x)}><img loading="lazy" decoding="async" src={x.img} alt={x.title||"AR7 Traders vehicle export"}/><div className="news-meta"><span>{x.cat}</span><small>{x.date} · {x.min} min</small></div><h3>{x.title}</h3><p>{x.excerpt||x.ex}</p><b>Read article <ArrowRight/></b></article>)}</div>}</>}
 </div></section>}

function readRoute(loc=typeof location==='undefined'?{}:location){
 return parseRoute(loc);
}

const INVENTORY_SCROLL_KEY='ar7-inventory-scroll';

function VehicleLightbox({selected,detailImage,detailGallery,zoomLevel,setZoomLevel,setZoomOpen,stepGallery}){
 const isZoomed=zoomLevel>1;
 const idx=detailGallery.indexOf(detailImage)+1;
 // Every control lives OUTSIDE the picture area: close in the top bar,
 // prev/next + zoom in the bottom bar — the image itself stays clean.
 return createPortal(<div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={`${selected.make} ${selected.model} image viewer`} onClick={()=>setZoomOpen(false)}>
  <div className="lightbox-stage" onClick={e=>e.stopPropagation()}>
   <div className="lightbox-topbar">
    <span className="lightbox-title"><b>{selected.make} {selected.model}</b><small>{detailGallery.length>1?`${idx} / ${detailGallery.length}`:''}</small></span>
    <button className="lightbox-close" onClick={()=>setZoomOpen(false)} aria-label="Close enlarged image" title="Close (Esc)"><X/></button>
   </div>
   <div className="lightbox-img-wrap">
    <img className={'lightbox-image '+(isZoomed?'is-zoomed':'')} src={detailImage} alt={`${selected.make} ${selected.model} enlarged`} style={{transform:`scale(${zoomLevel})`}} onClick={e=>{e.stopPropagation();setZoomLevel(v=>v>1?1:1.5)}}/>
   </div>
   <div className="lightbox-bottom">
    <div className="lightbox-nav" role="group" aria-label="Image navigation">
     <button className="lightbox-arrow prev" onClick={()=>stepGallery(-1)} disabled={detailGallery.length<=1} aria-label="Previous image" title="Previous"><ChevronLeft/><span>Prev</span></button>
     <span className="lightbox-count">{detailGallery.length>1?`${idx} / ${detailGallery.length}`:''}</span>
     <button className="lightbox-arrow next" onClick={()=>stepGallery(1)} disabled={detailGallery.length<=1} aria-label="Next image" title="Next"><span>Next</span><ChevronRight/></button>
    </div>
    <div className="zoom-controls" role="group" aria-label="Image zoom controls">
     <button className="zoom-btn" onClick={()=>setZoomLevel(v=>Math.max(1,v-.25))} disabled={zoomLevel<=1} aria-label="Zoom out" title="Zoom out"><ZoomOut/><span>Out</span></button>
     <button className="zoom-level" onClick={()=>setZoomLevel(1)} disabled={zoomLevel===1} aria-label="Reset zoom" title="Reset zoom"><strong>{Math.round(zoomLevel*100)}%</strong><small>Reset</small></button>
     <button className="zoom-btn" onClick={()=>setZoomLevel(v=>Math.min(3.5,v+.25))} disabled={zoomLevel>=3.5} aria-label="Zoom in" title="Zoom in"><ZoomIn/><span>In</span></button>
    </div>
   </div>
  </div>
 </div>,document.body);
}

// ---------------------------------------------------------------------------
// Japan dealer stock — the page fed by the Goo-net importer (/api/goonet-stock).
// Shows only quality-gated, currently-available dealer cars; cars delisted on
// Goo-net disappear automatically. Photo galleries open in a clean modal whose
// controls sit outside the picture area.
// ---------------------------------------------------------------------------
function JapanStockPage({navigate, openAuction}){
 const [rows,setRows]=useState([]);
 const [loading,setLoading]=useState(true);
 const [query,setQuery]=useState('');
 const [make,setMake]=useState('All');
 const [body,setBody]=useState('All');
 const [openCar,setOpenCar]=useState(null);
 const [galleryIdx,setGalleryIdx]=useState(0);
 useEffect(()=>{
  let live=true;
  fetch('/api/goonet-stock').then(r=>r.ok?r.json():[]).then(d=>{if(live)setRows(Array.isArray(d)?d:[])}).catch(()=>{}).finally(()=>{if(live)setLoading(false)});
  return ()=>{live=false};
 },[]);
 const makes=[...new Set(rows.map(r=>r.make).filter(Boolean))].sort();
 const bodies=[...new Set(rows.map(r=>r.body).filter(Boolean))].sort();
 const list=rows.filter(r=>{
  const hay=(r.make+' '+r.model+' '+(r.stock_no||'')+' '+r.year).toLowerCase();
  const q=query.trim().toLowerCase();
  return (!q||hay.includes(q))&&(make==='All'||r.make===make)&&(body==='All'||r.body===body);
 });
 const gallery=openCar?((Array.isArray(openCar.images)&&openCar.images.length)?openCar.images:[openCar.image].filter(Boolean)):[];
 const cur=gallery[Math.min(galleryIdx,gallery.length-1)]||openCar?.image;
 const stepG=d=>{setGalleryIdx(i=>Math.max(0,Math.min(gallery.length-1,i+d)))};
 const closeG=()=>{setOpenCar(null);setGalleryIdx(0)};
 return <>
  <section className="inner-page japan-stock-page">
   <div className="page-hero mini"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">LIVE GOO-NET DEALER STOCK</div><h1>Japan <em>dealer stock.</em></h1><p>{loading?'Checking the latest dealer listings…':`${rows.length} quality-gated dealer cars · imported straight from Goo-net, refreshed continuously.`}</p></div></div>
   <div className="shell page-content">
    <div className="inv-toolbar">
     <label className="inv-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search make, model or stock no."/></label>
     <select value={make} onChange={e=>setMake(e.target.value)} aria-label="Filter by brand"><option>All</option>{makes.map(m=><option key={m}>{m}</option>)}</select>
     <select value={body} onChange={e=>setBody(e.target.value)}><option>All</option>{bodies.map(b=><option key={b}>{b}</option>)}</select>
    </div>
    <div className="results-line"><b>{list.length} vehicles</b><span>verified photos · auction-sheet quality · updated by the AR7 importer</span></div>
    {loading?<div className="empty-state"><CarFront/><h3>Loading dealer stock…</h3><p>Fetching the latest imports from Goo-net.</p></div>:
     list.length===0?<div className="empty-state"><Search/><h3>No dealer cars match</h3><p>New Goo-net stock is imported all the time — try another filter or ask our team.</p><button className="primary" onClick={openAuction}>Request a search <ArrowRight/></button></div>:
     <div className="car-grid full-grid jstock-grid">{list.map(r=>{
      const photos=Array.isArray(r.images)?r.images.filter(Boolean):(r.image?[r.image]:[]);
      const price=r.price||(r.price_usd?'$'+Math.round(r.price_usd).toLocaleString('en-US'):'—');
      return <article className="car-card page-car jstock-card" key={r.id||r.stock_no}>
       <div className="car-image" onClick={()=>{setGalleryIdx(0);setOpenCar(r)}}>
        <img loading="lazy" decoding="async" src={r.image||photos[0]||'/assets/ar7-mark.png'} alt={`${r.make} ${r.model}`}/>
        <span className="status New Arrival">{r.status||'New Arrival'}</span>
        {r.grade&&<span className="grade">Grade <b>{r.grade}</b></span>}
        {photos.length>0&&<span className="photo-count"><Camera/> {photos.length}</span>}
       </div>
       <div className="car-info">
        <div className="make">{r.make}</div><h3>{r.model}</h3>
        <div className="specs"><span><CalendarDays/> {r.year||'—'}</span><span><Gauge/> {r.km?r.km+' km':'—'}</span>{r.fuel&&<span><Fuel/> {r.fuel}</span>}{r.tr&&<span><ArrowLeftRight/> {r.tr}</span>}</div>
        <div className="car-bottom"><div><small>DEALER PRICE</small><b>{price}</b></div><span className="card-open" onClick={()=>{setGalleryIdx(0);setOpenCar(r)}}>Photos <ArrowUpRight/></span></div>
        <div className="loc"><MapPin/> {r.location?r.location+', Japan':'Japan'}</div>
        <div className="jstock-actions">
         <button className="primary" onClick={openAuction}>Enquire <ArrowRight/></button>
         {r.goonet_url&&<a className="ghost-btn" href={r.goonet_url} target="_blank" rel="noopener noreferrer" title="View the original Goo-net listing">Goo-net <ArrowUpRight/></a>}
        </div>
       </div>
      </article>;
     })}</div>}
   </div>
  </section>
  {openCar&&createPortal(<div className="gallery-lightbox jstock-lightbox" role="dialog" aria-modal="true" onClick={closeG}>
   <div className="lightbox-stage" onClick={e=>e.stopPropagation()}>
    <div className="lightbox-topbar">
     <span className="lightbox-title"><b>{openCar.make} {openCar.model}</b><small>{openCar.stock_no||''}</small></span>
     <button className="lightbox-close" onClick={closeG} aria-label="Close"><X/></button>
    </div>
    <div className="lightbox-img-wrap"><img className="lightbox-image" src={cur} alt={`${openCar.make} ${openCar.model}`} onError={e=>{if(e.currentTarget.src!==(openCar.image||''))e.currentTarget.src=openCar.image||'/assets/ar7-mark.png'}}/></div>
    <div className="lightbox-bottom">
     <div className="lightbox-nav">
      <button className="lightbox-arrow prev" onClick={()=>stepG(-1)} disabled={gallery.length<=1} aria-label="Previous photo"><ChevronLeft/><span>Prev</span></button>
      <span className="lightbox-count">{gallery.length>1?`${galleryIdx+1} / ${gallery.length}`:''}</span>
      <button className="lightbox-arrow next" onClick={()=>stepG(1)} disabled={gallery.length<=1} aria-label="Next photo"><span>Next</span><ChevronRight/></button>
     </div>
     <div className="jstock-actions lightbox-cta">
      <button className="primary" onClick={()=>{closeG();openAuction()}}>Enquire now <ArrowRight/></button>
      {openCar.goonet_url&&<a className="ghost-btn" href={openCar.goonet_url} target="_blank" rel="noopener noreferrer">View on Goo-net <ArrowUpRight/></a>}
     </div>
    </div>
   </div>
  </div>,document.body)}
 </>;
}

// NOTE: no early returns above the hooks below. InnerPage is reused for many
// pages, so returning before the hook list runs changes the hook count between
// renders and React flags it ("Expected static flag was missing"). Page
// selection happens in App's ternary, which swaps component types instead.
function InnerPage({page,navigate,openAuction,favs,setFavs,vehicleId,initialMake}){
 const settings=useSettings();
 const price=useCarPrice();
 const {fmt}=useCurrency();
 const cust=useCustomerSession();
 const signedIn=!!cust.session;
 const [,contentTick]=useReducer(x=>x+1,0);
 useEffect(()=>onContentChange(()=>contentTick()),[]);
 const [query,setQuery]=useState(''),[body,setBody]=useState('All'),[make,setMake]=useState(initialMake||'All'),[fuel,setFuel]=useState('All'),[priceF,setPriceF]=useState('Any'),[sortF,setSortF]=useState('Featured'),[galleryImage,setGalleryImage]=useState(null),[zoomOpen,setZoomOpen]=useState(false),[zoomLevel,setZoomLevel]=useState(1),[destSel,setDestSel]=useState(DEST[0][1]),[comp,setComp]=useState([]),[showCmp,setShowCmp]=useState(false),[copied,setCopied]=useState(false);
 // The header's Brands dropdown drives this filter through the URL, so the
 // select must follow the route (and stay put when changed by hand).
 useEffect(()=>{ setMake(initialMake||'All'); },[initialMake]);
 const selected=page==='inventory'&&vehicleId?findCar(cars,vehicleId):null;
 const detailGallery=selected?galleryFor(selected):[];
 const detailImage=galleryImage||detailGallery[0];
 useEffect(()=>{ setGalleryImage(null); setZoomOpen(false); setZoomLevel(1); },[vehicleId]);
 const openVehicle=car=>{
  sessionStorage.setItem(INVENTORY_SCROLL_KEY,String(window.scrollY||window.pageYOffset||0));
  navigate(`inventory?car=${carRef(car)}`,{scroll:false});
 };
 const backToInventory=()=>{
  const saved=Number(sessionStorage.getItem(INVENTORY_SCROLL_KEY)||0);
  sessionStorage.removeItem(INVENTORY_SCROLL_KEY);
  navigate('inventory',{scroll:false});
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,saved)));
 };
 const copyVehicleLink=async()=>{
  const url=location.origin+hrefFor('inventory',carRef(selected))+hashFor('inventory',carRef(selected));
  try{await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1800)}
  catch{setCopied(false)}
 };
 // Card clicks can originate deep down the inventory page. Move the newly
 // rendered detail view to the top rather than leaving the user at the old
 // card's (often footer-side) scroll position.
 useEffect(()=>{
  if(!selected)return;
  // CSS scroll-behavior can make even an "auto" scroll animate. Set both
  // scrolling roots explicitly so the detail page always starts at the top.
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
  window.scrollTo(0,0);
 },[selected]);
 const stepGalleryRef=useRef(null);
 useEffect(()=>{
  if(!zoomOpen)return;
  const clampZoom=v=>Math.round(v*100)/100;
  const onKey=e=>{
   if(e.key==='Escape')setZoomOpen(false);
   else if(e.key==='ArrowLeft'){e.preventDefault();if(stepGalleryRef.current)stepGalleryRef.current(-1)}
   else if(e.key==='ArrowRight'){e.preventDefault();if(stepGalleryRef.current)stepGalleryRef.current(1)}
   else if(e.key==='+'||e.key==='='){e.preventDefault();setZoomLevel(v=>Math.min(2.5,clampZoom(v+.25)))}
   else if(e.key==='-'||e.key==='_'){e.preventDefault();setZoomLevel(v=>Math.max(1,clampZoom(v-.25)))}
   else if(e.key==='0'){e.preventDefault();setZoomLevel(1)}
  };
  const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';
  window.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)};
 },[zoomOpen]);
 const stepGallery=dir=>{if(detailGallery.length<2)return;const at=Math.max(0,detailGallery.indexOf(detailImage));setGalleryImage(detailGallery[(at+dir+detailGallery.length)%detailGallery.length])};
 stepGalleryRef.current=stepGallery;
 if(page==='inventory'&&vehicleId&&!selected)return <section className="inner-page detail-page"><div className="shell"><a className="back-btn" href="/inventory" onClick={linkClick('inventory',backToInventory)}>← Back to inventory</a><div className="empty-state vehicle-missing">{isContentHydrated()?<><Search/><h3>This vehicle is no longer listed</h3><p>It may have sold or the link is out of date. Browse current Japan stock instead.</p><PageLink className="primary" to="inventory" navigate={backToInventory}>View inventory <ArrowRight/></PageLink></>:<><CarFront/><h3>Loading vehicle…</h3><p>Fetching the latest stock so we can open this car.</p></>}</div></div></section>;
 if(selected)return <section className="inner-page detail-page"><div className="shell"><a className="back-btn" href="/inventory" onClick={linkClick('inventory',backToInventory)}>← Back to inventory</a><div className="detail-grid"><div className="detail-gallery"><div className="detail-main-image"><img decoding="async" src={detailImage} onError={()=>{if(detailImage!==selected.image)setGalleryImage(selected.image)}} alt={`${selected.make} ${selected.model} showroom view`} onClick={()=>{setZoomLevel(1);setZoomOpen(true)}}/></div><div className="detail-gallery-toolbar">{detailGallery.length>1&&<><button className="gallery-arrow prev" onClick={()=>stepGallery(-1)} aria-label="Previous vehicle image"><ChevronLeft/></button><span className="gallery-count">{detailGallery.indexOf(detailImage)+1} / {detailGallery.length}</span><button className="gallery-arrow next" onClick={()=>stepGallery(1)} aria-label="Next vehicle image"><ChevronRight/></button></>}<button className="gallery-expand" onClick={()=>{setZoomLevel(1);setZoomOpen(true)}} aria-label="Enlarge vehicle image"><Maximize2/> Enlarge</button></div><div className="hero-orb in-page detail-orb"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="detail-thumbs">{detailGallery.map((img,i)=><button className={detailImage===img?'active':''} onClick={()=>setGalleryImage(img)} key={img+i}><img loading="lazy" decoding="async" src={img} onError={e=>{if(!e.currentTarget.dataset.f){e.currentTarget.dataset.f=1;e.currentTarget.src=selected.image}}} alt={`${selected.make} ${selected.model} photo ${i+1}`}/><small>{i===0?'Main':'View '+(i+1)}</small></button>)}</div><span className="sheet-tag"><ClipboardCheck/> Auction sheet included</span>{zoomOpen&&<VehicleLightbox selected={selected} detailImage={detailImage} detailGallery={detailGallery} zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} setZoomOpen={setZoomOpen} stepGallery={stepGallery}/>}</div><div className="detail-info"><div className="kicker">VERIFIED JAPAN STOCK · <b style={{color:'var(--gold)'}}>{stockNo(selected)}</b></div><h1>{selected.make}<br/><em>{selected.model}</em></h1><div className="detail-price"><small>EXPORT PRICE (FOB)</small><b>{price(selected)}</b></div><div className="detail-specs"><span><CalendarDays/><b>{selected.year}</b><small>Year</small></span><span><Gauge/><b>{selected.km} km</b><small>Mileage</small></span><span><Fuel/><b>{selected.fuel}</b><small>Fuel</small></span><span><ArrowLeftRight/><b>{selected.tr}</b><small>Transmission</small></span><span><BadgeCheck/><b>{selected.grade}</b><small>Grade</small></span><span><Ship/><b>{selected.st}</b><small>Steering</small></span></div><div className="spec-table"><h4>Full specifications</h4>{[['Body type',selected.body],['Engine',selected.eng],['Transmission',selected.tr],['Drive',selected.drv],['Doors',selected.doors],['Seats',selected.seats],['Chassis no.',selected.chassis],['Colour',selected.col],['Interior',selected.int],['Fuel',selected.fuel],['Steering',selected.st],['Auction venue',selected.ven],['Location',selected.location+', Japan'],['Available',selected.arr],['Stock no.',stockNo(selected)],['Status',selected.status]].map(x=><span key={x[0]}><small>{x[0]}</small><b>{x[1]}</b></span>)}</div><div className="feat-box"><h4>Equipment & features</h4><div className="feat-chips">{(selected.feats||[]).map(f=><span key={f}><Check/> {f}</span>)}</div></div><div className="cif-box"><div className="kicker">DEMO CIF ESTIMATE</div><select value={destSel} onChange={e=>setDestSel(e.target.value)}>{DEST.map(x=><option key={x[1]}>{x[1]}</option>)}</select>{(()=>{const e=estimateFor(selected,destSel);return <div className="cif-rows"><span><small>FREIGHT (RoRo)</small><b>{fmt(e.freight)}</b></span><span><small>DOCS</small><b>{fmt(e.docs)}</b></span><span><small>INSURANCE 1.6%</small><b>{fmt(e.ins)}</b></span><span className="total"><small>CIF · ETA ±{e.days} DAYS</small><b>{fmt(e.cif)}</b></span></div>})()}</div><div className="brand-brandlogo"><img loading="lazy" decoding="async" src={LOGO(selected.make)} alt={selected.make+" logo"} onError={logoOnError}/><span>{selected.make} · official AR7 partner network</span></div><div className="detail-actions"><button className="primary" onClick={openAuction}>Enquire now <ArrowRight/></button><button className={favs.includes(selected.id)?'ghost-btn fav-on':'ghost-btn'} onClick={()=>setFavs(v=>v.includes(selected.id)?v.filter(x=>x!==selected.id):[...v,selected.id])}><Heart fill={favs.includes(selected.id)?'currentColor':'none'}/> {favs.includes(selected.id)?'Saved':'Save'}</button><button className="ghost-btn" type="button" onClick={copyVehicleLink}><Share2/> {copied?'Link copied':'Copy link'}</button></div><div className="sheet-box"><ClipboardCheck/><div><b>Auction sheet verified</b><p>Original inspection report translated by our Japan team — grades, marks and repair history in plain English.</p></div></div></div></div>{(()=>{const related=cars.filter(c=>c!==selected&&(c.make===selected.make||c.body===selected.body)).slice(0,3);return related.length?<div className="related-stock"><div className="kicker">SIMILAR STOCK</div><h2>You might also like</h2><div className="car-grid">{related.map(c=><VehicleCard key={c.id} c={c} onOpen={openVehicle}/>)}</div></div>:null})()}</div></section>;
if(['services','destinations','reviews','faq','portal'].includes(page))return <ExtraPage type={page} navigate={navigate} openAuction={openAuction}/>;
 if(['brands','howbuy','tools','news'].includes(page))return <ExtraPages2 type={page} navigate={navigate} openAuction={openAuction}/>;
 const makes=[...new Set(cars.map(c=>c.make))].sort();
 const isShowroom=c=>['Luxury','Supercar','Hypercar'].includes(c.body)||Number(c.id)<=12;
 const list=cars.filter(c=>(c.make+' '+c.model+' '+c.location+' '+(c.stock_no||'')+' '+c.year).toLowerCase().includes(query.toLowerCase())&&(body==='All'||(body==='Showroom'&&isShowroom(c))||(body==='Japan Stock'&&!isShowroom(c))||c.body===body)&&(make==='All'||c.make===make)&&(fuel==='All'||c.fuel===fuel)&&(priceF==='Any'||(priceF==='Under $15k'&&priceOf(c)<15000)||(priceF==='$15k–$30k'&&priceOf(c)>=15000&&priceOf(c)<30000)||(priceF==='$30k+'&&priceOf(c)>=30000))).sort((a,b)=>{const p=x=>priceOf(x);switch(sortF){case 'Price: low to high':return p(a)-p(b);case 'Price: high to low':return p(b)-p(a);case 'Mileage: low to high':return Number(String(a.km||'').replace(/,/g,''))-Number(String(b.km||'').replace(/,/g,''));case 'Newest first':return b.year-a.year;default:{const as=isShowroom(a),bs=isShowroom(b);if(as!==bs)return as?-1:1;return as?a.id-b.id:b.id-a.id}}});
 const showroomList=list.filter(isShowroom),japanList=list.filter(c=>!isShowroom(c));
 const cardsFor=items=>items.map(c=><VehicleCard key={c.id} c={c} onOpen={openVehicle} comp={comp.includes(c.id)} onCmp={x=>{setComp(v=>v.includes(x.id)?v.filter(y=>y!==x.id):(v.length>=3?v:v.concat(x.id)))}}/>);
if(page==='inventory')return <section className="inner-page"><div className="page-hero mini"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">LIVE JAPAN STOCK</div><h1>Find your next <em>vehicle.</em></h1><p>{list.length} verified vehicles · real dealer stock in Japan, updated daily.</p></div></div><div className="shell page-content"><div className="inv-toolbar"><label className="inv-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search make, model or stock no."/></label><select value={make} onChange={e=>{const v=e.target.value;setMake(v);writeLocation('inventory',null,{make:v,replace:true})}} aria-label="Filter by brand"><option>All</option>{makes.map(m=><option key={m}>{m}</option>)}</select><select value={fuel} onChange={e=>setFuel(e.target.value)}><option>All</option><option>Petrol</option><option>Hybrid</option><option>Diesel</option></select><select value={priceF} onChange={e=>setPriceF(e.target.value)}><option>Any</option><option>Under $15k</option><option>$15k–$30k</option><option>$30k+</option></select><select value={sortF} onChange={e=>setSortF(e.target.value)}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option><option>Mileage: low to high</option><option>Newest first</option></select></div><div className="logo-strip">{BRANDS().map(b=><a key={b.name} className={make===b.name?' current':''} href={inventoryHref(b.name)} onClick={linkClick(inventoryHref(b.name),navigate)} title={'Show '+b.name+' stock'}><img loading="lazy" decoding="async" width="44" height="26" src={LOGO(b.name)} alt={b.name+" logo"} onError={logoOnError}/><span>{b.name}</span><b>{b.count}</b></a>)}</div><div className="inv-chips"><div>{['All','Showroom','Japan Stock','Luxury','Supercar','Hypercar','SUV','MPV','Sedan','Hatchback','Kei','Van'].map(x=><button key={x} onClick={()=>setBody(x)} className={body===x?'active':''}>{x}</button>)}</div>{comp.length>0&&<button className="cmp-open" onClick={()=>setShowCmp(true)}><ArrowLeftRight/> Compare {comp.length}<small onClick={e=>{e.stopPropagation();setComp([]);setShowCmp(false)}}>clear</small></button>}</div><div className="results-line"><b>{list.length} vehicles</b><span>{showroomList.length} showroom · {japanList.length} Japan stock · updated daily</span></div>{body==='All'&&sortF==='Featured'?<div className="inventory-groups">{showroomList.length>0&&<section className="inventory-group showroom-group"><div className="inventory-group-head"><div><span>AR7 CURATED COLLECTION</span><h2>Showroom cars</h2></div><b>{showroomList.length} vehicles</b></div><div className="car-grid full-grid">{cardsFor(showroomList)}</div></section>}{japanList.length>0&&<section className="inventory-group japan-group"><div className="inventory-group-head"><div><span>VERIFIED AUCTION & STOCK</span><h2>Japan inventory</h2></div><b>{japanList.length} vehicles</b></div><div className="car-grid full-grid">{cardsFor(japanList)}</div></section>}</div>:<div className="car-grid full-grid">{cardsFor(list)}</div>}{list.length===0&&<div className="empty-state"><Search/><h3>No matches</h3><p>Try clearing the filters or ask our team to source it.</p><button className="primary" onClick={openAuction}>Request a search <ArrowRight/></button></div>}</div>{showCmp&&<div className="cmp-backdrop" onClick={()=>setShowCmp(false)}><div className="cmp-modal" onClick={e=>e.stopPropagation()}><div className="cmp-head"><div><div className="kicker">COMPARE</div><h2>{comp.length} vehicles side by side</h2></div><button onClick={()=>setShowCmp(false)}><X/></button></div><table><thead><tr><th></th>{comp.map(id=>{const c=cars.find(x=>x.id===id);return <th key={id}><img loading="lazy" decoding="async" src={c.image} alt={`${c.make} ${c.model} — Japanese import`}/><b>{c.make} {c.model}</b><button onClick={()=>setComp(v=>v.filter(y=>y!==id))}>Remove</button></th>})}</tr></thead><tbody>{[['Price',price],['Year',c=>c.year],['Mileage',c=>c.km+' km'],['Fuel',c=>c.fuel],['Body',c=>c.body],['Transmission',c=>c.tr],['Drive',c=>c.drv],['Engine',c=>c.eng],['Seats',c=>c.seats],['Grade',c=>c.grade],['Steering',c=>c.st],['Status',c=>c.status]].map(r=><tr key={r[0]}><th>{r[0]}</th>{comp.map(id=>{const c=cars.find(x=>x.id===id);return <td key={id}>{c?r[1](c):'—'}</td>})}</tr>)}</tbody></table><div className="cmp-cta"><button className="primary" onClick={openAuction}>Request quote for best match <ArrowRight/></button></div></div></div>}</section>;
 const pages={
 auction:{tag:'LIVE AUCTION ACCESS',title:<>Bid in Japan.<br/><em>From anywhere.</em></>,desc:'Your direct window into 100,000+ vehicles every week, with translated sheets and an expert beside you.',image:'/assets/japanese-car-auction-inspection-shipping-3.jpg'},
 shipping:{tag:'GLOBAL LOGISTICS',title:<>From Japan<br/>to your <em>port.</em></>,desc:'Reliable RoRo and container shipping with documentation, insurance and live milestone updates.',image:'/assets/japanese-car-auction-inspection-shipping-1.jpg'},
 about:{tag:'ABOUT AR7 TRADERS',title:<>Your team<br/>on the ground <em>in Japan.</em></>,desc:'We are vehicle sourcing specialists built around transparency, quality and long-term customer relationships.',image:'/assets/japanese-car-auction-inspection-shipping-5.webp'},
 contact:{tag:'TALK TO OUR TEAM',title:<>Start your<br/><em>car journey.</em></>,desc:'Tell us your market, budget and preferred vehicle. We will respond with options within 24 hours.',image:'/assets/japanese-car-auction-inspection-shipping-2.jpg'}
 };
 const p=pages[page]||pages.about;
 return <section className="inner-page"><div className="page-hero split"><div className="shell"><div className="page-hero-copy"><div className="kicker">{p.tag}</div><h1>{p.title}</h1><p>{p.desc}</p><button className="gold-btn" onClick={openAuction}>{page==='contact'?'Send an enquiry':'Get started'} <ArrowRight/></button></div><div className="page-hero-image"><img loading="lazy" decoding="async" src={p.image} alt={p.name||"AR7 Traders vehicle"}/><div className="hero-orb in-page"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="corner-mark"><img src="/assets/ar7-mark.png" alt="AR7 Traders"/></div></div></div></div>
 <div className="shell page-content">{page==='auction'?<><div className="feature-intro"><h2>Auction access without the guesswork.</h2><p>Every listing comes with translation support, market guidance and complete cost visibility before you bid.</p></div><div className="feature-cards">{[['01','Browse live listings','Filter by make, year, mileage, grade and auction venue.'],['02','Review with an expert','We translate the auction sheet and flag every detail.'],['03','Set your bid limit','Know your landed estimate before bidding begins.'],['04','Win & track','See results instantly and follow your car to port.']].map(x=><article key={x[1]}><span>{x[0]}</span><Gavel/><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div><div className="auction-demo"><div><span className="live-dot"/> AUCTIONS LIVE NOW</div>{cars.slice(0,4).map(c=><section key={c.id}><img loading="lazy" decoding="async" src={c.image} alt={`${c.make} ${c.model} — Japanese import`}/><b>{c.make} {c.model}</b><small>LOT {38210+c.id} · Grade {c.grade}</small><strong>{price(c)}</strong><PageLink className="lot-link" to={`inventory?car=${carRef(c)}`} navigate={navigate}>View lot</PageLink></section>)}</div></>:
 page==='shipping'?<><div className="feature-intro"><h2>One clear route. Complete support.</h2><p>From export certificate to customs-ready documents, our logistics desk handles the complexity.</p></div><div className="shipping-flow">{[['Japan yard','Inspection & preparation'],['Export port','Customs & loading'],['At sea','Live milestone tracking'],['Your port','Documents & collection']].map((x,i)=><div key={x[0]}><span>0{i+1}</span><Ship/><b>{x[0]}</b><small>{x[1]}</small></div>)}</div></>:
 page==='about'?<><div className="feature-intro"><h2>Built to be your trusted partner.</h2><p>AR7 Traders connects buyers worldwide to the depth and quality of the Japanese vehicle market.</p></div><div className="story-grid"><img loading="lazy" decoding="async" src="/assets/ar7-logo-circle.png" alt="AR7 Traders emblem"/><div><div className="stats"><div><b>1,200+</b><span>Vehicles exported</span></div><div><b>35+</b><span>Countries served</span></div><div><b>98%</b><span>On-time delivery</span></div></div><p>Our team sources through major Japanese auction houses and trusted dealer networks. Every vehicle is selected with careful inspection, clear communication and full cost transparency.</p></div></div></>:
 <div className="contact-grid"><div><h2>Let’s source your car.</h2><p>Use the access form or contact our Japan export desk directly.</p><a href={'mailto:'+settings.contact_email}><Mail/> {settings.contact_email}</a><a href={telHref(settings.contact_phone)}><Phone/> {settings.contact_phone}</a><a className="wa-link" href={waLink(settings.whatsapp_number,settings.whatsapp_message)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={17}/> WhatsApp us</a><a href="/contact" onClick={linkClick('contact',navigate)}><MapPin/> {settings.contact_address}</a></div><form onSubmit={e=>{e.preventDefault();openAuction()}}><input placeholder="Your name" required/><input placeholder="Email address" type="email" required/><input placeholder="Destination country"/><textarea placeholder="Which vehicle are you looking for?"/><button className="primary">Send request <ArrowRight/></button></form></div>}</div></section>
}

const WORLD_CLOCKS=[
 {code:'JP',country:'Japan',city:'Tokyo',zone:'Asia/Tokyo'},
 {code:'PK',country:'Pakistan',city:'Karachi',zone:'Asia/Karachi'},
 {code:'AE',country:'UAE',city:'Dubai',zone:'Asia/Dubai'},
 {code:'GB',country:'United Kingdom',city:'London',zone:'Europe/London'},
 {code:'KE',country:'Kenya',city:'Nairobi',zone:'Africa/Nairobi'},
 {code:'US',country:'USA',city:'New York',zone:'America/New_York'},
 {code:'US',country:'USA',city:'Los Angeles',zone:'America/Los_Angeles'},
 {code:'AU',country:'Australia',city:'Sydney',zone:'Australia/Sydney'},
 {code:'NZ',country:'New Zealand',city:'Auckland',zone:'Pacific/Auckland'}
].map(x=>({...x,formatter:new Intl.DateTimeFormat('en-GB',{timeZone:x.zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZoneName:'short'})}));

function WorldTimeRibbon(){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const tick=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(tick)},[]);
 const group=(copy,hidden=false)=><div className="world-time-group" aria-hidden={hidden||undefined} key={copy}>{WORLD_CLOCKS.map(c=>{const parts=c.formatter.formatToParts(now),time=parts.filter(p=>['hour','minute','second','literal'].includes(p.type)).map(p=>p.value).join(''),zone=parts.find(p=>p.type==='timeZoneName')?.value||'';return <span className="world-time-item" key={copy+c.city}><span className="world-time-flag"><Flag c={c.country} w={18} h={12}/></span><i>{c.code}</i><b>{c.city}</b><strong>{time}</strong><small>{zone}</small></span>})}</div>;
 return <div className="world-time-ribbon" aria-label="Live international times"><div className="world-time-label"><Globe2/><span>WORLD TIME</span><i/></div><div className="world-time-viewport"><div className="world-time-track">{group('a')}{group('b',true)}</div></div></div>
}

export function App(){
 const [,forceContent]=useReducer(x=>x+1,0);
 const settings=useSettings();
 const price=useCarPrice();
 const {session:customerSession}=useCustomerSession();
 const signedIn=!!customerSession;
 const initialRoute=readRoute();
 const [dark,setDark]=useState(()=>{try{return localStorage.getItem('ar7-theme')==='dark'}catch{return false}}), [menu,setMenu]=useState(false), [filter,setFilter]=useState('All'), [modal,setModal]=useState(false), [favs,setFavs]=useState(()=>{try{return JSON.parse(localStorage.getItem('ar7-favs')||'[]')}catch{return []}}), [sent,setSent]=useState(false), [leadSending,setLeadSending]=useState(false), [leadError,setLeadError]=useState(''), [page,setPage]=useState(initialRoute.page), [vehicleId,setVehicleId]=useState(initialRoute.carId), [makeFilter,setMakeFilter]=useState(initialRoute.make);
 useEffect(()=>{ document.documentElement.dataset.theme=dark?'dark':'light'; try{localStorage.setItem('ar7-theme',dark?'dark':'light')}catch{} },[dark]);
 useEffect(()=>{ try{localStorage.setItem('ar7-favs',JSON.stringify(favs))}catch{} },[favs]);
 useSeo(page, vehicleId);
 useEffect(()=>onContentChange(forceContent),[]);
 useEffect(()=>{let t=0;const fn=()=>{cancelAnimationFrame(t);t=requestAnimationFrame(()=>document.documentElement.style.setProperty('--scroll',window.scrollY+'px'))};window.addEventListener('scroll',fn,{passive:true});return()=>{window.removeEventListener('scroll',fn);cancelAnimationFrame(t)}},[]);
 useEffect(()=>{
  const apply=()=>{const route=readRoute();setPage(route.page);setVehicleId(route.carId);setMakeFilter(route.make)};
  const route=readRoute();
  writeLocation(route.page,route.carId,{replace:true,make:route.make});
  apply();
  const onPop=()=>apply();
  const onHash=()=>{const next=readRoute();writeLocation(next.page,next.carId,{replace:true,make:next.make});apply()};
  addEventListener('popstate',onPop);
  addEventListener('hashchange',onHash);
  return()=>{removeEventListener('popstate',onPop);removeEventListener('hashchange',onHash)};
 },[]);
 const shown=(filter==='All'?cars:cars.filter(c=>c.status===filter)).slice(0,6);
 const navigate=(p,{scroll=true,replace=false}={})=>{
  const route=parseNavTarget(p);
  writeLocation(route.page,route.carId,{replace,make:route.make});
  setPage(route.page);setVehicleId(route.carId);setMakeFilter(route.make);setMenu(false);
  if(scroll) scrollTo({top:0,behavior:'smooth'});
 };
 const go=(id)=>{if(page!=='home'){navigate('home');setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth'}),100)}else document.getElementById(id)?.scrollIntoView({behavior:'smooth'});setMenu(false)};
 const submitLead=async e=>{e.preventDefault();setLeadSending(true);setLeadError('');const f=new FormData(e.currentTarget),payload=Object.fromEntries(f.entries());try{const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Unable to send request');setSent(true);e.currentTarget.reset()}catch(err){setLeadError(err.message)}finally{setLeadSending(false)}};
 if(page==='crm')return <React.Suspense fallback={<div className="empty-state"><Monitor/><h3>Loading the CRM…</h3><p>Fetching your workspace.</p></div>}><CrmApp/></React.Suspense>;
 return <div className="site">
  <div className="grain"/><SiteHeader page={page} vehicleId={vehicleId} makeFilter={makeFilter} brands={BRANDS()} vehicleCount={cars.length}
    menu={menu} setMenu={setMenu} dark={dark} setDark={setDark} signedIn={signedIn} navigate={navigate} logoFor={LOGO}
    ribbon={<WorldTimeRibbon/>} orb={<InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/>}/>

  <main>
   {page==='home'?<>
   <section className="hero shell" id="home">
    <div className="hero-copy reveal">
      <div className="eyebrow"><span className="live-dot"/> Direct from Japanese auctions</div>
      <h1>Your next car.<br/><em>Anywhere</em> in the world.</h1>
      <p>We source verified vehicles from Japan's leading auctions, handle every detail, and deliver to your nearest port.</p>
      <div className="hero-cta"><button className="primary" onClick={()=>go('inventory')}>Explore vehicles <ArrowRight/></button><button className="text-btn" onClick={()=>setModal(true)}><span><Play fill="currentColor"/></span> See how bidding works</button></div>
      <div className="trust-row"><div className="avatars"><i>KT</i><i>AH</i><i>MJ</i><i>+</i></div><div><b>4.9/5</b><span>Trusted by 1,200+ buyers</span></div></div>
    </div>
    <HeroVisual navigate={navigate}/>
    <div className="scroll-cue"><span>SCROLL TO DISCOVER</span><ChevronDown/></div>
   </section>

   <section className="ticker"><div>{['USS TOKYO','JU AICHI','TAA KINKI','CAA CHUBU','HAA KOBE','ARAI AUTO'].concat(['USS TOKYO','JU AICHI','TAA KINKI']).map((x,i)=><span key={i}><i/> {x}</span>)}</div></section>

   <MotionShowcase navigate={navigate}/>

   <section className="inventory shell section" id="inventory">
    <div className="section-head"><div><div className="kicker">LUXURY & SUPER SPORT</div><h2>Treasures in the<br/><em>showroom.</em></h2></div><p>Rolls-Royce to Bugatti — plus verified Japan stock for every market, all inspected and auction-sheet certified.</p></div>
    <div className="inventory-tools"><div className="filters">{['All','In Stock','Auction','New Arrival'].map(f=><button className={filter===f?'active':''} onClick={()=>setFilter(f)} key={f}>{f}</button>)}</div><PageLink className="search-btn" to="inventory" navigate={navigate}><Search/> Search vehicles <SlidersHorizontal/></PageLink></div>
    <div className="car-grid">{shown.map((c,i)=><a className="car-card" key={c.id} style={{'--delay':i*80+'ms'}} href={hrefFor('inventory',carRef(c))} onClick={linkClick(`inventory?car=${carRef(c)}`,navigate)}>
      <div className="car-image"><img loading="lazy" decoding="async" src={c.image} alt={`${c.make} ${c.model}`}/><span className={'status '+statusSlug(c.status)}>{c.status||'In Stock'}</span><span role="button" tabIndex={0} className={favs.includes(c.id)?'fav active':'fav'} onClick={e=>{e.preventDefault();e.stopPropagation();setFavs(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setFavs(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}}}><Heart fill={favs.includes(c.id)?'currentColor':'none'}/></span><span className="grade">Grade <b>{c.grade}</b></span></div>
      <div className="car-info"><div className="make"><img loading="lazy" decoding="async" width="34" height="22" src={LOGO(c.make)} alt="" onError={logoOnError}/>{c.make}</div><h3>{c.model}</h3><div className="specs"><span><CalendarDays/> {c.year}</span><span><Gauge/> {c.km} km</span><span><Fuel/> {c.fuel}</span><span><ArrowLeftRight/> {c.tr}</span></div><div className="car-bottom"><div><small>EXPORT PRICE FROM</small><b>{price(c)}</b></div><span className="card-open" aria-hidden="true"><ArrowUpRight/></span></div><div className="loc"><MapPin/> {c.location}, Japan</div></div>
    </a>)}</div>
    <PageLink className="outline-btn" to="inventory" navigate={navigate}>View complete inventory <ArrowRight/></PageLink>
   </section>

   <section className="process section" id="process"><div className="shell">
    <div className="section-head light"><div><div className="kicker">YOUR JOURNEY, SIMPLIFIED</div><h2>From auction floor<br/>to your <em>door.</em></h2></div><p>A transparent, four-step flow. You stay informed from the first bid to final delivery.</p></div>
    <div className="flow-line"><span/></div>
    <div className="steps">
     {[{n:'01',icon:<Search/>,t:'Tell us what you want',p:'Share your make, model, budget and destination. We shortlist the best matches.'},{n:'02',icon:<Gavel/>,t:'Bid with confidence',p:'Get live auction access, translated sheets, expert advice and a clear bidding limit.'},{n:'03',icon:<ClipboardCheck/>,t:'Inspect & prepare',p:'We verify, photograph, service and prepare your vehicle for international shipment.'},{n:'04',icon:<Ship/>,t:'Track to your port',p:'Follow your car with live shipment updates until it safely reaches your destination.'}].map((s,i)=><div className="step" key={s.n}><div className="step-top"><span>{s.n}</span><i>{s.icon}</i></div><h3>{s.t}</h3><p>{s.p}</p>{i<3&&<ArrowRight className="step-arrow"/>}</div>)}
    </div>
    <div className="process-cta"><span><LockKeyhole/> Secure client portal included</span><button className="gold-btn" onClick={()=>setModal(true)}>Start sourcing <ArrowUpRight/></button></div>
   </div></section>

   <section className="auction-preview section shell" id="about">
    <div className="dash-wrap">
      <div className="dash-copy"><div className="kicker">AUCTION ACCESS</div><h2>The auction room,<br/>in your <em>pocket.</em></h2><p>Browse 100,000+ weekly listings from Japan's top auction houses. View translated inspection sheets, place bids, and track results—all in one place.</p><ul><li><Check/> Real-time vehicle listings</li><li><Check/> Translated auction sheets</li><li><Check/> Expert bid recommendations</li></ul><button className="primary" onClick={()=>setModal(true)}>Request free access <ArrowRight/></button></div>
      <a className="dashboard" href="/portal" onClick={linkClick('portal',navigate)} title="Open client portal demo"><div className="dash-nav"><img src="/assets/ar7-mark.png" alt="AR7 Traders"/><span/><span/><span/></div><div className="dash-title"><div><small>GOOD MORNING, IMRAN</small><b>Live auctions</b></div><div className="dash-search"><Search/> Search lot or chassis</div></div><div className="dash-stats"><div><i className="green"/><span>Live now<b>12 auctions</b></span></div><div><Gavel/><span>Your bids<b>04 active</b></span></div><div><BadgeCheck/><span>Won this month<b>07 vehicles</b></span></div></div><div className="dash-cars">{cars.slice(0,3).map(c=><div key={c.id}><img loading="lazy" decoding="async" src={c.image} alt={`${c.make} ${c.model} — Japanese import`}/><span><small>{c.id===2?'LOT 28149':'LOT 51'+c.id+'08'}</small><b>{c.make} {c.model.split(' ')[0]}</b><em>Grade {c.grade}</em></span><strong>{price(c)}</strong></div>)}</div></a>
    </div>
   </section>

   <section className="world section"><div className="world-map"><BigNetworkGlobe navigate={navigate} compact/></div><div className="world-content shell"><div className="kicker">GLOBAL REACH, LOCAL CARE</div><h2>Japan to <em>everywhere.</em></h2><p>We ship through trusted carriers to 35+ countries. Spin the globe — tap Japan to browse stock, or any country for its market guide.</p><div className="stats"><div><b>1,200<sup>+</sup></b><span>Vehicles exported</span></div><div><b>35<sup>+</sup></b><span>Countries served</span></div><div><b>98<sup>%</sup></b><span>On-time delivery</span></div></div><PageLink className="primary" to="destinations" navigate={navigate}>Explore destinations <ArrowRight/></PageLink></div></section>

   <section className="cta shell section"><div className="cta-bg"/><div><div className="kicker">READY WHEN YOU ARE</div><h2>Let’s find your<br/>next <em>vehicle.</em></h2><p>Tell us what you’re looking for. Our Japan team will send curated options within 24 hours.</p></div><button className="gold-btn large" onClick={()=>setModal(true)}>Start your search <ArrowUpRight/></button></section>
   </>:page==='world'?<WorldPage navigate={navigate}/>:page==='account'?<CustomerAccountPage navigate={navigate}/>:page==='studio'?<DeviceStudio navigate={navigate}/>:page==='japan-stock'?<JapanStockPage navigate={navigate} openAuction={()=>setModal(true)}/>:<InnerPage page={page} navigate={navigate} vehicleId={vehicleId} initialMake={makeFilter} openAuction={()=>setModal(true)} favs={favs} setFavs={setFavs}/>}
  </main>

  <footer className="site-footer">
   <div className="shell footer-news">
    <div className="footer-news-copy"><div className="kicker">STOCK ALERTS · NO SPAM</div><h3>Fresh Japan stock,<br/><em>before it hits the market.</em></h3><p>Get new arrivals, price drops and auction highlights in your inbox — matched to what you're looking for.</p></div>
    <form className="footer-news-form" onSubmit={e=>{e.preventDefault();const v=e.currentTarget.email.value.trim();if(v)location.href='mailto:'+settings.contact_email+'?subject='+encodeURIComponent('Stock alerts signup')+'&body='+encodeURIComponent('Please add '+v+' to your stock alerts list.');}}>
     <label className="footer-news-field"><Mail/><input name="email" type="email" required placeholder="you@email.com"/></label>
     <button className="footer-news-btn" type="submit"><Send/> Subscribe</button>
    </form>
   </div>
   <div className="shell footer-grid">
    <div className="footer-brand">
     <div className="footer-logo"><img src="/assets/ar7-logo.png" alt="AR7 Traders"/></div>
     <p>Reliable vehicles. Transparent process.<br/>Worldwide delivery from Japan.</p>
     <div className="footer-trust"><span><ShieldCheck/> Escrow protected</span><span><FileCheck/> Auction sheets verified</span><span><Ship/> 35+ markets served</span></div>
     <div className="socials"><a href="/inventory" onClick={linkClick('inventory',navigate)} title="Vehicle gallery"><Camera/></a><a href="/reviews" onClick={linkClick('reviews',navigate)} title="Customer stories"><MessageCircle/></a><a href="/contact" onClick={linkClick('contact',navigate)} title="Contact AR7"><Send/></a><a className="wa-link" href={waLink(settings.whatsapp_number,settings.whatsapp_message)} target="_blank" rel="noopener noreferrer" title="WhatsApp AR7"><WhatsAppIcon size={15}/></a></div>
    </div>
    <div><b>EXPLORE</b><a href="/inventory" onClick={linkClick('inventory',navigate)}>Inventory<ArrowUpRight/></a><a href="/japan-stock" onClick={linkClick('japan-stock',navigate)}>Japan dealer stock<ArrowUpRight/></a><a href="/auction" onClick={linkClick('auction',navigate)}>Auction access<ArrowUpRight/></a><a href="/services" onClick={linkClick('services',navigate)}>Services<ArrowUpRight/></a><a href="/brands" onClick={linkClick('brands',navigate)}>Brands<ArrowUpRight/></a><a href="/destinations" onClick={linkClick('destinations',navigate)}>Destinations<ArrowUpRight/></a><a href="/tools" onClick={linkClick('tools',navigate)}>Calculators<ArrowUpRight/></a><a href="/world" onClick={linkClick('world',navigate)}>World network<ArrowUpRight/></a></div>
    <div><b>COMPANY</b><a href="/howbuy" onClick={linkClick('howbuy',navigate)}>How to buy<ArrowUpRight/></a><a href="/news" onClick={linkClick('news',navigate)}>News & guides<ArrowUpRight/></a><a href="/about" onClick={linkClick('about',navigate)}>About us<ArrowUpRight/></a><a href="/reviews" onClick={linkClick('reviews',navigate)}>Customer stories<ArrowUpRight/></a><a href="/faq" onClick={linkClick('faq',navigate)}>Help & FAQ<ArrowUpRight/></a>{signedIn&&<a href="/account" onClick={linkClick('account',navigate)}>My account<ArrowUpRight/></a>}<a href="/portal" onClick={linkClick('portal',navigate)}>Portal tour<ArrowUpRight/></a><a href="/crm" onClick={linkClick('crm',navigate)}>Staff CRM<ArrowUpRight/></a>{!signedIn&&<a href="/account" onClick={linkClick('account',navigate)}>Customer sign up<ArrowUpRight/></a>}</div>
    <div><b>GET IN TOUCH</b><a href={'mailto:'+settings.contact_email}><Mail/> {settings.contact_email}</a><a href={telHref(settings.contact_phone)}><Phone/> {settings.contact_phone}</a><a className="wa-link" href={waLink(settings.whatsapp_number,settings.whatsapp_message)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={15}/> WhatsApp</a><a href="/contact" onClick={linkClick('contact',navigate)}><MapPin/> {settings.contact_address}</a>
     <div className="footer-hours"><Clock3/><span><b>Mon–Sat</b><small>09:00–19:00 JST · live chat on WhatsApp</small></span></div>
     <button className="footer-top-btn" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}>Back to top <ArrowUpRight/></button>
    </div>
   </div>
   <div className="shell footer-bottom"><span>© 2026 AR7 Traders. All rights reserved.</span><span><a href="/faq" onClick={linkClick('faq',navigate)}>Privacy</a> · <a href="/faq" onClick={linkClick('faq',navigate)}>Terms</a> · <a href="/faq" onClick={linkClick('faq',navigate)}>Export policy</a></span><div className="footer-badges"><span><BadgeCheck/> Certified stock</span><span><LockKeyhole/> Secure payments</span></div><b>AR7TRADERS.COM</b></div>
  </footer>

  <WhatsAppButton/>

  {modal&&<div className="modal-backdrop" onMouseDown={()=>setModal(false)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-x" onClick={()=>setModal(false)}><X/></button>{sent?<div className="success"><span><Check/></span><h2>Request received.</h2><p>Our auction specialist will contact you within 24 hours with your access details.</p><button className="primary" onClick={()=>{setSent(false);setModal(false)}}>Back to site</button></div>:<><div className="kicker">JOIN THE AUCTION</div><h2>Get free auction access.</h2><p>Tell us where you are and what you're looking for.</p><form onSubmit={submitLead}>{leadError&&<div className="form-api-error">{leadError}</div>}<input name="website" tabIndex="-1" autoComplete="off" style={{display:'none'}}/><label>YOUR NAME<input name="name" required placeholder="Full name"/></label><div className="form-row"><label>EMAIL<input name="email" required type="email" placeholder="you@email.com"/></label><label>DESTINATION<select name="country"><option>Pakistan</option><option>UAE</option><option>United Kingdom</option><option>Kenya</option><option>Other</option></select></label></div><label>VEHICLE YOU'RE LOOKING FOR<input name="vehicle_interest" placeholder="e.g. Toyota Land Cruiser, 2022+"/></label><button className="primary" type="submit" disabled={leadSending}>{leadSending?'Sending…':'Request access'} <ArrowRight/></button><small><LockKeyhole/> Your details stay private. No spam, ever.</small></form></>}</div></div>}
 </div>
}
class BootErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error('AR7 failed to render',error,info)}
 render(){
  if(!this.state.error) return this.props.children;
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'32px 20px',background:'#f5f6f2',color:'#102018',fontFamily:'Manrope,system-ui,sans-serif',textAlign:'center'}}>
   <div style={{maxWidth:460}}>
    <img src="/assets/ar7-mark.png" alt="AR7 Traders" width="56" height="56" style={{borderRadius:12}}/>
    <h1 style={{fontSize:28,letterSpacing:'-0.04em',margin:'18px 0 10px'}}>AR7 Traders</h1>
    <p style={{color:'#66736c',lineHeight:1.6,margin:'0 0 22px'}}>The page failed to load. Refresh, or email <a href="mailto:info@ar7traders.com" style={{color:'#043f28'}}>info@ar7traders.com</a>.</p>
    <button type="button" onClick={()=>location.reload()} style={{border:0,background:'#043f28',color:'#fff',borderRadius:12,height:48,padding:'0 20px',fontWeight:700,cursor:'pointer'}}>Refresh the page</button>
   </div>
  </div>;
 }
}

const rootEl=document.getElementById('root');
if(rootEl) createRoot(rootEl).render(<BootErrorBoundary><CurrencyProvider><App/></CurrencyProvider></BootErrorBoundary>);
