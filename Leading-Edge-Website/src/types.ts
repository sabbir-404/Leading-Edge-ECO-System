
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
  categories: string[];
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
  relatedProducts?: string[]; // Array of Product IDs
}

export interface Category {
  id: string;
  name: string;
  slug?: string;
  image?: string;
  parentId?: string | null;
  order?: number;
  isFeatured?: boolean;
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

export type UserRole = 'admin' | 'moderator' | 'customer_service' | 'customer';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  address?: string;
  role: UserRole;
  joinDate: string;
  groupId?: string;
}

export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  userCount?: number;
  createdAt?: string;
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
  recentActivity: string[]; // Legacy simple string array
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

export interface Brand {
  id: string;
  name: string;
  logo: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  images: string[];
  client?: string;
  date?: string;
}

export interface SiteConfig {
  heroSlides: HeroSlide[];
  homeSections: HomeSection[];
  catalogues: Catalogue[];
  headerFooter: HeaderFooterConfig;
  brands: Brand[];
  showBrandsSection: boolean;
  showProjectsSection: boolean;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface SearchResult {
  id: string;
  title: string;
  type: 'product' | 'order' | 'user' | 'page';
  subtitle?: string;
}

export interface AuditLogEntry {
  id: number;
  admin_email: string;
  action_type: string;
  target_id: string;
  details: string;
  changes?: Record<string, { from: any; to: any }>;
  timestamp: string;
}

export interface GalleryImage {
  id?: number;
  name: string;
  url: string;
  folder: string;
  size: number;
  date: string;
}

export interface ImageReference {
  type: 'Product' | 'Project' | 'Category';
  id: string;
  name: string;
}
