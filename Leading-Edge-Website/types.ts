export interface ProductVariation {
  id: string;
  type: string; // e.g., 'Color', 'Size'
  value: string; // e.g., 'Red', 'XL'
  price?: number;
  salePrice?: number;
  image?: string;
  modelNumber?: string;
  description?: string;
}

export interface ProductSpecification {
  key: string;
  value: string;
}

export interface ProductTab {
  id: string;
  title: string;
  content: string;
}

export interface SpecificShippingCharge {
  areaId: string;
  charge: number;
}

export interface Product {
  id: string;
  name: string;
  categories: string[]; // Changed from single category to array
  price: number;
  salePrice?: number;
  onSale?: boolean;
  shortDescription: string;
  description: string;
  modelNumber: string;
  image: string;
  images: string[];
  rating: number;
  features: string[];
  isVisible: boolean;
  variations: ProductVariation[];
  specifications: ProductSpecification[];
  customTabs: ProductTab[];
  weight?: number;
  specificShippingCharges?: SpecificShippingCharge[];
}

export interface Category {
  id: string;
  name: string;
  image: string;
}

export interface Catalogue {
  id: string;
  title: string;
  coverImage: string;
  pdfUrl: string;
  description: string;
  season: string;
}

export interface CartItem extends Product {
  quantity: number;
  selectedVariation?: ProductVariation;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  role: 'admin' | 'moderator' | 'customer';
  joinDate: string;
}

export interface Order {
  id: string;
  userId?: string; 
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  shippingAddress: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  paymentStatus: 'Paid' | 'Unpaid';
}

export interface HeroSlide {
  id: number;
  image: string;
  title: string;
  subtitle: string;
  alignment: 'center' | 'left-top' | 'left-bottom' | 'right-top' | 'right-bottom';
  buttonText?: string;
  buttonLink?: string;
}

export interface HomeSection {
  id: string;
  title: string;
  type: 'category' | 'ids';
  value: string | string[]; 
  isVisible: boolean;
}

export interface PageSection {
  id: string;
  type: 'text' | 'image-text' | 'columns';
  content: string; 
  image?: string;
  title?: string;
  columns?: string[]; 
}

export interface CustomPage {
  id: string;
  title: string;
  slug: string; 
  hasHero: boolean;
  heroImage?: string;
  sections: PageSection[];
  placement: 'navbar' | 'footer' | 'both' | 'none';
  isSystem?: boolean; 
}

export interface ShippingArea {
  id: string;
  name: string;
}

export interface ShippingRate {
  minWeight: number;
  maxWeight: number;
  cost: number;
}

export interface ShippingMethod {
  id: string;
  name: string;
  areaIds: string[];
  type: 'flat' | 'weight';
  flatRate?: number;
  weightRates?: ShippingRate[];
  isGlobal: boolean; 
  specificProductIds?: string[];
}

export interface NewsletterCampaign {
  id: string;
  subject: string;
  content: string;
  sentDate: string;
  recipientCount: number;
  status: 'Sent' | 'Draft';
}

export interface DashboardStats {
  totalOrdersMonth: number;
  totalVisitsMonth: number;
  revenueMonth: number;
  trendingProducts: { productId: string; name: string; sales: number }[];
  recentActivity: string[];
}

export interface HeaderFooterConfig {
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  youtubeUrl: string;
  copyrightText: string;
}

export interface SiteConfig {
  heroSlides: HeroSlide[];
  homeSections: HomeSection[];
  catalogues: Catalogue[];
  headerFooter: HeaderFooterConfig;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}