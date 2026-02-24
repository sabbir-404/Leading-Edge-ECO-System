
import { Product, Category, Catalogue, SiteConfig, ShippingArea, ShippingMethod, CustomPage, User, Order, DashboardStats, Brand, Project } from './types';

export const CURRENCY = '৳';

export const MAIN_MENU_CATEGORIES = ['Furniture', 'Light', 'Kitchenware', 'Hardware', 'Sale'];

export const INITIAL_CATEGORIES: Category[] = [
  // Main Categories
  { id: '1', name: 'Furniture', image: 'https://picsum.photos/seed/furn/400/400', order: 1, isFeatured: true, slug: 'furniture' },
  { id: '2', name: 'Light', image: 'https://picsum.photos/seed/light/400/400', order: 2, isFeatured: true, slug: 'light' },
  { id: '3', name: 'Kitchenware', image: 'https://picsum.photos/seed/kitchen/400/400', order: 3, isFeatured: true, slug: 'kitchenware' },
  { id: '4', name: 'Hardware', image: 'https://picsum.photos/seed/hard/400/400', order: 4, isFeatured: true, slug: 'hardware' },
  { id: '5', name: 'Decor', image: 'https://picsum.photos/seed/decor/400/400', order: 6, isFeatured: true, slug: 'decor' },
  { id: '6', name: 'Outdoor', image: 'https://picsum.photos/seed/out/400/400', order: 7, isFeatured: true, slug: 'outdoor' },
  { id: '7', name: 'Rugs', image: 'https://picsum.photos/seed/rugs/400/400', order: 8, isFeatured: true, slug: 'rugs' },
  { id: '8', name: 'Bath', image: 'https://picsum.photos/seed/bath/400/400', order: 9, isFeatured: true, slug: 'bath' },
  { id: '9', name: 'Sale', image: 'https://picsum.photos/seed/sale/400/400', order: 5, isFeatured: true, slug: 'sale' },

  // Subcategories - Furniture
  { id: '1-1', name: 'Sofa', parentId: '1', slug: 'sofa' },
  { id: '1-2', name: 'Bed', parentId: '1', slug: 'bed' },
  { id: '1-3', name: 'Dining Table', parentId: '1', slug: 'dining-table' },
  { id: '1-4', name: 'Chairs', parentId: '1', slug: 'chairs' },
  { id: '1-5', name: 'Wardrobe', parentId: '1', slug: 'wardrobe' },

  // Subcategories - Light
  { id: '2-1', name: 'Chandelier', parentId: '2', slug: 'chandelier' },
  { id: '2-2', name: 'Ceiling Light', parentId: '2', slug: 'ceiling-light' },
  { id: '2-3', name: 'Track Light', parentId: '2', slug: 'track-light' },
  { id: '2-4', name: 'Wall Lamp', parentId: '2', slug: 'wall-lamp' },
  { id: '2-5', name: 'Table Lamp', parentId: '2', slug: 'table-lamp' },
  
  // Subcategories - Kitchenware
  { id: '3-1', name: 'Cutlery', parentId: '3', slug: 'cutlery' },
  { id: '3-2', name: 'Cookware', parentId: '3', slug: 'cookware' },
  { id: '3-3', name: 'Tableware', parentId: '3', slug: 'tableware' },

  // Subcategories - Hardware
  { id: '4-1', name: 'Door Handles', parentId: '4', slug: 'door-handles' },
  { id: '4-2', name: 'Locks', parentId: '4', slug: 'locks' },
  { id: '4-3', name: 'Hinges', parentId: '4', slug: 'hinges' },
];

export const CATEGORIES = INITIAL_CATEGORIES;

export const INITIAL_CATALOGUES: Catalogue[] = [
  {
    id: 'cat-2024-spring',
    title: 'Spring Collection 2024',
    coverImage: 'https://picsum.photos/seed/cat1/500/700',
    pdfUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    description: 'Explore our latest arrivals.',
    season: 'Spring 2024'
  }
];

export const CATALOGUES = INITIAL_CATALOGUES; 

export const HERO_SLIDES = [
  {
    id: 1,
    image: 'https://picsum.photos/seed/hero1/1920/1080',
    title: 'Modern Comfort',
    subtitle: 'Redefining the living room experience.',
    alignment: 'left-bottom' as const,
    buttonText: 'Shop Now',
    buttonLink: '/gallery/Furniture'
  }
];

const generateProducts = (category: string, count: number, startId: number): Product[] => {
  return Array.from({ length: count }).map((_, i) => {
    const price = Math.floor(Math.random() * 5000) + 1000;
    const onSale = Math.random() > 0.8;
    return {
      id: `${category}-${startId + i}`,
      name: `${category} Model ${i + 1}`,
      categories: [category], // Updated to array
      price: price,
      salePrice: onSale ? Math.floor(price * 0.8) : undefined,
      onSale: onSale,
      shortDescription: `Elegant ${category.toLowerCase()} piece.`,
      description: `A stunning piece of ${category.toLowerCase()}.`,
      modelNumber: `LE-${category.substring(0, 3).toUpperCase()}-${startId + i}`,
      image: `https://picsum.photos/seed/${category}${i}/600/600`, 
      images: [`https://picsum.photos/seed/${category}${i}/600/600`],
      rating: 4 + Math.random(),
      features: ['Premium Materials'],
      isVisible: true,
      variations: [],
      specifications: [{ key: 'Material', value: 'Premium Composite' }],
      customTabs: [],
      weight: 10,
      specificShippingCharges: []
    };
  });
};

export const INITIAL_PRODUCTS = [
  ...generateProducts('Furniture', 12, 100),
  ...generateProducts('Light', 12, 200),
  ...generateProducts('Kitchenware', 12, 300),
  ...generateProducts('Hardware', 12, 400),
];

export const INITIAL_BRANDS: Brand[] = [
  { id: 'b1', name: 'Brand A', logo: 'https://via.placeholder.com/150x80?text=Brand+A' },
  { id: 'b2', name: 'Brand B', logo: 'https://via.placeholder.com/150x80?text=Brand+B' },
  { id: 'b3', name: 'Brand C', logo: 'https://via.placeholder.com/150x80?text=Brand+C' },
  { id: 'b4', name: 'Brand D', logo: 'https://via.placeholder.com/150x80?text=Brand+D' },
  { id: 'b5', name: 'Brand E', logo: 'https://via.placeholder.com/150x80?text=Brand+E' },
  { id: 'b6', name: 'Brand F', logo: 'https://via.placeholder.com/150x80?text=Brand+F' },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    title: 'Luxury Villa Gulshan',
    coverImage: 'https://picsum.photos/seed/proj1/800/600',
    description: 'A complete interior solution for a 5000 sqft luxury villa in Gulshan 2. Focusing on modern minimalist aesthetics with premium Italian furniture.',
    images: ['https://picsum.photos/seed/proj1/800/600', 'https://picsum.photos/seed/proj1a/800/600', 'https://picsum.photos/seed/proj1b/800/600'],
    client: 'Mr. Rahman',
    date: '2023-11-15'
  },
  {
    id: 'proj-2',
    title: 'Corporate Office Banani',
    coverImage: 'https://picsum.photos/seed/proj2/800/600',
    description: 'Open plan office design for a leading tech startup. Ergonomic seating and smart lighting solutions provided.',
    images: ['https://picsum.photos/seed/proj2/800/600', 'https://picsum.photos/seed/proj2a/800/600'],
    client: 'TechEdge Ltd',
    date: '2023-08-20'
  }
];

export const INITIAL_SITE_CONFIG: SiteConfig = {
  heroSlides: HERO_SLIDES,
  homeSections: [
    { id: 'sec-1', title: 'Furniture', type: 'category', value: 'Furniture', isVisible: true },
    { id: 'sec-2', title: 'Light', type: 'category', value: 'Light', isVisible: true },
  ],
  catalogues: INITIAL_CATALOGUES,
  headerFooter: {
    logoUrl: '/Logo/logo black.png',
    phone: '+1 (555) 123-4567',
    email: 'support@leadingedge.com',
    address: '123 Furniture Blvd, Design District, NY 10001',
    facebookUrl: '#',
    instagramUrl: '#',
    twitterUrl: '#',
    youtubeUrl: '#',
    copyrightText: 'Leading Edge Furniture. All Rights Reserved.'
  },
  brands: INITIAL_BRANDS,
  showBrandsSection: true,
  showProjectsSection: true
};

export const INITIAL_SHIPPING_AREAS: ShippingArea[] = [
  { id: 'area-dhaka-inside', name: 'Inside Dhaka' },
  { id: 'area-dhaka-outside', name: 'Outside Dhaka' },
  { id: 'area-chittagong', name: 'Chittagong' },
  { id: 'area-sylhet', name: 'Sylhet' },
  { id: 'area-rajshahi', name: 'Rajshahi' },
  { id: 'area-khulna', name: 'Khulna' },
  { id: 'area-barisal', name: 'Barisal' },
  { id: 'area-rangpur', name: 'Rangpur' },
  { id: 'area-mymensingh', name: 'Mymensingh' },
];

export const INITIAL_SHIPPING_METHODS: ShippingMethod[] = [
  { 
    id: 'method-std', 
    name: 'Standard Delivery', 
    areaIds: ['area-dhaka-inside'], 
    type: 'flat', 
    flatRate: 100, 
    isGlobal: true 
  },
  { 
    id: 'method-nat', 
    name: 'Nationwide Courier', 
    areaIds: ['area-dhaka-outside', 'area-chittagong', 'area-sylhet'], 
    type: 'weight', 
    weightRates: [
       { minWeight: 0, maxWeight: 5, cost: 150 },
       { minWeight: 5, maxWeight: 20, cost: 300 },
       { minWeight: 20, maxWeight: 100, cost: 800 }
    ], 
    isGlobal: true 
  }
];

export const INITIAL_PAGES: CustomPage[] = [
  {
    id: 'page-about',
    title: 'About Us',
    slug: 'about',
    hasHero: true,
    heroImage: 'https://picsum.photos/seed/showroom/1920/1080',
    sections: [
      { id: 's1', type: 'text', content: 'Founded in 2024, Leading Edge was born from a desire to bridge the gap between high-concept art and functional living.' }
    ],
    placement: 'footer',
    isSystem: true
  },
  {
    id: 'page-shipping',
    title: 'Shipping Policy',
    slug: 'shipping',
    hasHero: false,
    sections: [
      { id: 's1', type: 'text', content: 'We deliver all over Bangladesh.' }
    ],
    placement: 'footer',
    isSystem: true
  },
  {
    id: 'page-returns',
    title: 'Return Policy',
    slug: 'returns',
    hasHero: false,
    sections: [
      { id: 's1', type: 'text', content: 'Returns accepted within 7 days.' }
    ],
    placement: 'footer',
    isSystem: true
  }
];

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Admin User', email: 'admin@leadingedge.com', role: 'admin', joinDate: '2023-01-01', phone: '01700000000', address: '123 Admin Road, Dhaka' },
  { id: 'u2', name: 'Rahim Ahmed', email: 'rahim@example.com', role: 'customer', joinDate: '2023-05-15', phone: '01711223344', address: 'House 5, Road 10, Dhanmondi, Dhaka' },
  { id: 'u3', name: 'Karim Ullah', email: 'karim@example.com', role: 'customer', joinDate: '2023-06-20', phone: '01811223344', address: 'Agrabad, Chittagong' },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'ORD-1001',
    userId: 'u2',
    customerName: 'Rahim Ahmed',
    customerEmail: 'rahim@example.com',
    customerPhone: '01711223344',
    shippingAddress: 'House 5, Road 10, Dhanmondi, Dhaka',
    date: '2023-10-01',
    items: [INITIAL_PRODUCTS[0], INITIAL_PRODUCTS[1]].map(p => ({...p, quantity: 1})),
    subtotal: 5000,
    shippingCost: 100,
    tax: 0,
    total: 5100,
    status: 'Processing',
    paymentStatus: 'Paid'
  },
  {
    id: 'ORD-1002',
    userId: 'u3',
    customerName: 'Karim Ullah',
    customerEmail: 'karim@example.com',
    customerPhone: '01811223344',
    shippingAddress: 'Agrabad, Chittagong',
    date: '2023-10-05',
    items: [INITIAL_PRODUCTS[2]].map(p => ({...p, quantity: 2})),
    subtotal: 3000,
    shippingCost: 150,
    tax: 0,
    total: 3150,
    status: 'Pending',
    paymentStatus: 'Unpaid'
  }
];

export const MOCK_STATS: DashboardStats = {
  totalOrdersMonth: 145,
  totalVisitsMonth: 3240,
  revenueMonth: 450000,
  trendingProducts: [
    { productId: 'Furniture-100', name: 'Furniture Model 1', sales: 45 },
    { productId: 'Light-200', name: 'Light Model 1', sales: 32 },
    { productId: 'Kitchenware-300', name: 'Kitchenware Model 1', sales: 28 },
    { productId: 'Hardware-400', name: 'Hardware Model 1', sales: 15 },
  ],
  recentActivity: [
    'Order #ORD-1005 placed by Jamal',
    'New User Registered: Salma Begum',
    'Product "Sofa" low stock warning',
    'Newsletter "Eid Sale" sent successfully'
  ]
};
