import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, AlertCircle, CheckCircle, Paperclip, X, FileText, 
  Trash2, MapPin, User, ShoppingBag, 
  Palette, Maximize2, Tag, Shield, DollarSign, Lock, Box, Search, Save, FolderOpen, ChevronDown, Copy, RefreshCw
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { 
  getUserPricingPermissions,
  canCreateProductFromPlaceOrder,
  isFactoryManager,
  getUser,
  isAdmin,
  isSuperadmin
} from '../../utils/permissions';
import { ProductCreateModal } from './components/ProductCreateModal';
import { 
  loadPlaceOrderDraft, 
  savePlaceOrderDraft, 
  clearPlaceOrderDraft, 
  hasMeaningfulPlaceOrderDraft,
  loadSavedPlaceOrderDrafts,
  saveNamedPlaceOrderDraft,
  deleteSavedPlaceOrderDraft,
  type PlaceOrderDraftData,
  type SavedPlaceOrderDraft
} from '../../utils/placeOrderDraft';
import { useToast } from '../../context/ToastContext';
import { formatSizeDisplay } from '../../utils/formatSize';
import {
  calculateDeliveryDateFromWorkingDays,
  calculateWorkingDaysBetween,
  getTodayYmd
} from '../../utils/workingDays';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

export const getColorSwatchColor = (value?: unknown): string => {
  const color = typeof value === 'string' ? value.trim() : '';
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) return color;
  if (/^(?:rgb|rgba|hsl|hsla)\(/i.test(color)) return color;
  if (/^[a-z]{3,24}$/i.test(color)) return color;
  return '#d1d5db';
};

const getOrderSizeLabel = (size: any, fallback?: any): string => {
  const candidate = size || fallback;
  if (!candidate) return 'Not available';
  if (typeof candidate === 'string') {
    const value = candidate.trim();
    return value && !['standard size', 'standard dimensions'].includes(value.toLowerCase()) ? value : 'Not available';
  }
  const formatted = formatSizeDisplay(candidate);
  const normalized = formatted.trim().toLowerCase();
  if (normalized && !['standard size', 'standard dimensions'].includes(normalized)) return formatted;
  const explicit = String(candidate.size_label || candidate.label || candidate.name || '').trim();
  if (explicit && !['standard size', 'standard dimensions'].includes(explicit.toLowerCase())) return explicit;
  const rawDimensions = String(candidate.dimensions_text || candidate.dimensions || '').trim();
  return rawDimensions || 'Not available';
};

interface CartItem {
  _id: string;
  product_id?: number;
  requestion_item_id?: number;
  product_code?: string;
  product_name: string;
  spec_id?: number;
  spec_name?: string;
  spec_details?: string;
  size_id?: number;
  dimensions_text?: string;
  is_customized?: boolean;
  custom_dimensions?: string;
  color_id?: number;
  color_name?: string;
  color_code?: string;
  quantity: number;
  item_cost_price?: number | string;
  item_sale_price?: number | string | null;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | string | null;
  discount_amount?: number | null;
  final_item_price?: number | null;
  max_discount_type?: 'percent' | 'amount' | null;
  max_discount_value?: number | null;
  notes?: string;
  attachedFile?: {
    name: string;
    path?: string;
    base64?: string;
    url?: string;
    uploadId?: string;
    type: string;
    previewUrl?: string;
  } | null;
}

const PlaceOrder: React.FC = () => {
  const location = useLocation();
  const { showToast } = useToast();
  const pricingPerms = getUserPricingPermissions();
  const canCreateProduct = canCreateProductFromPlaceOrder();
  const isFactoryMgr = isFactoryManager();
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string | null>(null);
  const [showProductCreateModal, setShowProductCreateModal] = useState(false);
  const [autoOrderNumber, setAutoOrderNumber] = useState<string>('');
  const [headerDateTime, setHeaderDateTime] = useState(() => new Date().toLocaleString());
  const [savedDrafts, setSavedDrafts] = useState<SavedPlaceOrderDraft[]>(() => loadSavedPlaceOrderDrafts());
  const [activeSavedDraftId, setActiveSavedDraftId] = useState<string | null>(null);
  const [savedDraftSearch, setSavedDraftSearch] = useState('');
  const isDraftsView = location.pathname.endsWith('/drafts');
  useEffect(() => {
    const timer = window.setInterval(() => setHeaderDateTime(new Date().toLocaleString()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const visibleSavedDrafts = savedDrafts.filter(draft => {
    const q = savedDraftSearch.trim().toLowerCase();
    if (!q) return true;
    return [draft.title, draft.data.customerName, draft.data.selectedCustomerInfo?.name, draft.data.cartItems?.map(item => item.product_name).join(' ')].some(value => String(value || '').toLowerCase().includes(q));
  });

  // Initial draft loaded synchronously to prevent any asynchronous typing wipes
  const initialDraft = React.useMemo(() => {
    try {
      return loadPlaceOrderDraft() || {};
    } catch {
      return {};
    }
  }, []);

  // Order Discount state
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>(() => initialDraft.discountType || 'percent');
  const [discountValue, setDiscountValue] = useState<string>(() => initialDraft.discountValue !== undefined && initialDraft.discountValue !== null ? String(initialDraft.discountValue) : '');

  // Order Header state
  const [priority, setPriority] = useState(() => initialDraft.priority || 'Normal');
  const [orderPlacementDate, setOrderPlacementDate] = useState<string>(() => initialDraft.orderPlacementDate || getTodayYmd());
  const [targetDeliveryDays, setTargetDeliveryDays] = useState<string>(() => {
    if (initialDraft.targetDeliveryDays !== undefined && initialDraft.targetDeliveryDays !== null && initialDraft.targetDeliveryDays !== '') {
      return String(initialDraft.targetDeliveryDays);
    }
    if (initialDraft.targetDeliveryDate) {
      const days = calculateWorkingDaysBetween(initialDraft.orderPlacementDate || getTodayYmd(), initialDraft.targetDeliveryDate);
      return days > 0 ? String(days) : '';
    }
    return '';
  });
  const [requestedDeliveryDays, setRequestedDeliveryDays] = useState<string>(() => {
    if (initialDraft.requestedDeliveryDays !== undefined && initialDraft.requestedDeliveryDays !== null && initialDraft.requestedDeliveryDays !== '') {
      return String(initialDraft.requestedDeliveryDays);
    }
    if (initialDraft.requestedDeliveryDate) {
      const days = calculateWorkingDaysBetween(initialDraft.orderPlacementDate || getTodayYmd(), initialDraft.requestedDeliveryDate);
      return days > 0 ? String(days) : '';
    }
    return '';
  });

  const targetDeliveryCalc = React.useMemo(() => {
    return calculateDeliveryDateFromWorkingDays(orderPlacementDate, targetDeliveryDays);
  }, [orderPlacementDate, targetDeliveryDays]);

  const requestedDeliveryCalc = React.useMemo(() => {
    return calculateDeliveryDateFromWorkingDays(orderPlacementDate, requestedDeliveryDays);
  }, [orderPlacementDate, requestedDeliveryDays]);

  const targetDeliveryDate = targetDeliveryCalc.dateStr || '';
  const requestedDeliveryDate = requestedDeliveryCalc.dateStr || '';

  const currentUser = getUser();
  const isAdminOrManager = isSuperadmin() || isAdmin();

  const [salesmen, setSalesmen] = useState<any[]>([]);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState(() => {
    if (isAdminOrManager) {
      return initialDraft.selectedSalesmanId || '';
    }
    return currentUser.id ? String(currentUser.id) : (initialDraft.selectedSalesmanId || '');
  });

  // Customer selection & Autocomplete
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(() => initialDraft.selectedCustomerId ?? null);
  const [selectedCustomerInfo, setSelectedCustomerInfo] = useState<any | null>(() => initialDraft.selectedCustomerInfo ?? null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(-1);
  const customerSearchSeqRef = React.useRef(0);
  const customerSearchInputRef = React.useRef<HTMLInputElement | null>(null);
  const customerDropdownContainerRef = React.useRef<HTMLDivElement | null>(null);
  const colorDropdownContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Customer & Delivery info
  const [customerName, setCustomerName] = useState(() => initialDraft.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(() => initialDraft.customerPhone || '');
  const [customerEmail, setCustomerEmail] = useState(() => initialDraft.customerEmail || '');
  const [shippingAddress, setShippingAddress] = useState(() => initialDraft.shippingAddress || '');
  const [locationLandmark, setLocationLandmark] = useState(() => initialDraft.locationLandmark || '');
  const [receiverName, setReceiverName] = useState(() => initialDraft.receiverName || '');
  const [receiverPhone, setReceiverPhone] = useState(() => initialDraft.receiverPhone || '');
  const [specialInstructions, setSpecialInstructions] = useState(() => initialDraft.specialInstructions || '');

  // Catalog data for item picker
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(() => initialDraft.selectedProduct || null);
  const [selectedSpec, setSelectedSpec] = useState<any | null>(() => {
    if (initialDraft.selectedSpecId && initialDraft.selectedProduct?.specifications) {
      return initialDraft.selectedProduct.specifications.find((s: any) => s.id === initialDraft.selectedSpecId) || null;
    }
    return null;
  });
  const [selectedSize, setSelectedSize] = useState<any | null>(() => {
    if (initialDraft.selectedSizeId && initialDraft.selectedProduct?.sizes) {
      return initialDraft.selectedProduct.sizes.find((s: any) => s.id === initialDraft.selectedSizeId) || null;
    }
    return null;
  });
  const [selectedColor, setSelectedColor] = useState<any | null>(() => {
    if (initialDraft.selectedColorId && initialDraft.selectedProduct?.colors) {
      return initialDraft.selectedProduct.colors.find((c: any) => c.id === initialDraft.selectedColorId) || null;
    }
    return null;
  });
  const [showColorOptions, setShowColorOptions] = useState(false);
  const [itemQuantity, setItemQuantity] = useState<number>(() => initialDraft.itemQuantity ?? 1);
  const [itemCostPrice, setItemCostPrice] = useState<number | string>(() => initialDraft.itemCostPrice ?? '');
  const [itemSalePrice, setItemSalePrice] = useState<number | string>(() => initialDraft.itemSalePrice ?? '');
  const [itemDiscountType, setItemDiscountType] = useState<'percent' | 'amount'>('percent');
  const [itemDiscountValue, setItemDiscountValue] = useState<string>('');
  const [moneyReceived, setMoneyReceived] = useState<string>(() => initialDraft.moneyReceived !== undefined && initialDraft.moneyReceived !== null ? String(initialDraft.moneyReceived) : '0');
  const [itemRemarks, setItemRemarks] = useState<string>(() => initialDraft.itemRemarks || '');

  // Per-item Invoice Attachment / CAD Drawing
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    base64?: string;
    url?: string;
    uploadId?: string;
    type: string;
    previewUrl?: string;
  } | null>(null);
  const [itemFileProgress, setItemFileProgress] = useState<number | null>(null);
  const pendingItemUploadsRef = React.useRef<Promise<void>[]>([]);

  const handleItemFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds the 15 MB limit.');
      return;
    }
    const isCad = /\.(dwg|dxf|step|stp|iges|igs|skp|stl|obj)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    
    let previewUrl = '';
    if (isImage) {
      previewUrl = URL.createObjectURL(file);
    }

    setItemFileProgress(0);
    const reader = new FileReader();
    let finishUploadWait!: () => void;
    const uploadWait = new Promise<void>(resolve => { finishUploadWait = resolve; });
    pendingItemUploadsRef.current.push(uploadWait);
    const clearUploadWait = () => {
      finishUploadWait();
      pendingItemUploadsRef.current = pendingItemUploadsRef.current.filter(task => task !== uploadWait);
    };
    reader.onprogress = event => {
      if (event.lengthComputable) setItemFileProgress(Math.min(40, Math.round(event.loaded / event.total * 40)));
    };
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] || (reader.result as string);
      const initialFile = {
        name: file.name,
        base64: base64,
        type: isCad ? 'cad' : (isPdf ? 'pdf' : (isImage ? 'image' : 'document')),
        previewUrl
      };
      setAttachedFile(initialFile);
      void (async () => {
        try {
          setItemFileProgress(45);
          const result = await window.electron?.makeUploadInvoiceAttachmentBuffer?.({ fileName: file.name, fileBase64: reader.result as string, attachmentType: isCad ? 'cad' : 'invoice_attachment' });
          const ref = result?.durableKey || (result?.publicUrl && !result.publicUrl.includes('token=') ? result.publicUrl : undefined);
          if (!result?.success && !result?.isPendingUpload) throw new Error(result?.error || 'File could not be saved to protected storage.');
          if (ref) {
            const persistentFile = { name: file.name, type: initialFile.type, url: ref, uploadId: result.uploadId, previewUrl };
            setAttachedFile(current => current?.name === file.name ? persistentFile : current);
            setCartItems(current => current.map(item => item.attachedFile?.name === file.name && item.attachedFile?.base64 === initialFile.base64 ? { ...item, attachedFile: persistentFile } : item));
          }
          setItemFileProgress(100);
        } catch (error: any) {
          setAttachedFile(current => current?.name === file.name ? { ...initialFile } : current);
          setItemFileProgress(null);
          showToast(`Attachment upload failed: ${error?.message || 'Retry the file attachment before saving a draft.'}`, 'error');
        } finally {
          clearUploadWait();
        }
      })();
    };
    reader.onerror = () => { setItemFileProgress(null); showToast('Could not read the selected attachment.', 'error'); clearUploadWait(); };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachedFile = () => {
    if (attachedFile?.previewUrl) {
      URL.revokeObjectURL(attachedFile.previewUrl);
    }
    setAttachedFile(null);
    setItemFileProgress(null);
  };

  // Custom Size toggle & state for catalog products
  const [isCustomSize, setIsCustomSize] = useState(() => initialDraft.isCustomSize ?? false);
  const [customShape, setCustomShape] = useState<'rect' | 'round'>(() => initialDraft.customShape || 'rect');
  const [customLength, setCustomLength] = useState(() => initialDraft.customLength || '');
  const [customWidth, setCustomWidth] = useState(() => initialDraft.customWidth || '');
  const [customHeight, setCustomHeight] = useState(() => initialDraft.customHeight || '');
  const [customDiameter, setCustomDiameter] = useState(() => initialDraft.customDiameter || '');
  const [customUnit, setCustomUnit] = useState(() => initialDraft.customUnit || 'mm');

  // Custom Specification toggle & state for catalog products
  const [isCustomSpec, setIsCustomSpec] = useState(() => initialDraft.isCustomSpec ?? false);
  const [customSpecName, setCustomSpecName] = useState(() => initialDraft.customSpecName || '');

  // Custom Color toggle & state for catalog products
  const [isCustomColor, setIsCustomColor] = useState(() => initialDraft.isCustomColor ?? false);
  const [customColorName, setCustomColorName] = useState(() => initialDraft.customColorName || '');

  // Manual/Custom non-catalog item fallback mode
  const [isCustomItemMode, setIsCustomItemMode] = useState(() => initialDraft.isCustomItemMode ?? false);
  const [customItemName, setCustomItemName] = useState(() => initialDraft.customItemName || '');
  const [customItemSize, setCustomItemSize] = useState(() => initialDraft.customItemSize || '');
  const [customItemSpec, setCustomItemSpec] = useState(() => initialDraft.customItemSpec || '');

  // Handle duplicating existing order passed from Track Orders
  useEffect(() => {
    const dup = (location.state as any)?.duplicateFromOrder;
    if (dup && !isFactoryMgr) {
      if (dup.priority) setPriority(dup.priority);
      const basePlacement = dup.created_at ? dup.created_at.split('T')[0] : getTodayYmd();
      setOrderPlacementDate(basePlacement);

      const targetDate = dup.target_delivery_date || dup.delivery_date || '';
      if (dup.target_delivery_days !== undefined && dup.target_delivery_days !== null && dup.target_delivery_days !== '') {
        setTargetDeliveryDays(String(dup.target_delivery_days));
      } else if (targetDate) {
        const days = calculateWorkingDaysBetween(basePlacement, targetDate);
        setTargetDeliveryDays(days > 0 ? String(days) : '');
      } else {
        setTargetDeliveryDays('');
      }

      if (dup.requested_delivery_days !== undefined && dup.requested_delivery_days !== null && dup.requested_delivery_days !== '') {
        setRequestedDeliveryDays(String(dup.requested_delivery_days));
      } else if (dup.requested_delivery_date) {
        const reqDays = calculateWorkingDaysBetween(basePlacement, dup.requested_delivery_date);
        setRequestedDeliveryDays(reqDays > 0 ? String(reqDays) : '');
      } else {
        setRequestedDeliveryDays('');
      }
      if (dup.salesman_id) setSelectedSalesmanId(String(dup.salesman_id));
      if (dup.customer_id) setSelectedCustomerId(dup.customer_id);
      if (dup.customer_name) setCustomerName(dup.customer_name);
      if (dup.customer_phone) setCustomerPhone(dup.customer_phone);
      if (dup.customer_email) setCustomerEmail(dup.customer_email);
      if (dup.shipping_address) setShippingAddress(dup.shipping_address);
      if (dup.location_landmark) setLocationLandmark(dup.location_landmark);
      if (dup.receiver_name) setReceiverName(dup.receiver_name);
      if (dup.receiver_phone) setReceiverPhone(dup.receiver_phone);
      if (dup.special_instructions) setSpecialInstructions(dup.special_instructions);

      if (dup.discount_type) setDiscountType(dup.discount_type);
      if (dup.discount_value !== undefined && dup.discount_value !== null) setDiscountValue(String(dup.discount_value));
      setMoneyReceived('0');

      if (Array.isArray(dup.items) && dup.items.length > 0) {
        const mapped = dup.items.map((it: any) => ({
          _id: String(Date.now() + Math.random()),
          product_id: it.product_id || undefined,
          product_code: it.product_code || undefined,
          product_name: it.product_name || 'Custom Item',
          spec_id: it.spec_id || undefined,
          spec_name: it.spec_name || undefined,
          spec_details: it.spec_details || it.spec_name || undefined,
          size_id: it.size_id || undefined,
          dimensions_text: it.dimensions_text || it.custom_dimensions || it.size_label || undefined,
          is_customized: !!it.is_customized,
          custom_dimensions: it.custom_dimensions || it.dimensions_text || undefined,
          color_id: it.color_id || undefined,
          color_name: it.color_name || undefined,
          color_code: it.color_code || undefined,
          quantity: it.quantity > 0 ? it.quantity : 1,
          item_cost_price: pricingPerms.canViewCostPrice ? (it.item_cost_price || it.unit_cost_price || 0) : 0,
          item_sale_price: pricingPerms.canViewSalePrice ? (it.item_sale_price || it.unit_sale_price || null) : null,
          max_discount_type: it.max_discount_type || undefined,
          max_discount_value: it.max_discount_value !== undefined && it.max_discount_value !== null ? Number(it.max_discount_value) : undefined,
          notes: it.designer_notes || it.notes || '',
          attachedFile: (it.technical_drawing_url || it.drawing_url) ? {
            name: 'Drawing Blueprint',
            url: it.technical_drawing_url || it.drawing_url,
            type: 'cad'
          } : null
        }));
        setCartItems(mapped);
      } else if (dup.furniture_name) {
        setCartItems([{
          _id: String(Date.now()),
          product_name: dup.furniture_name,
          spec_details: dup.description || '',
          dimensions_text: undefined,
          quantity: dup.quantity || 1,
          item_cost_price: pricingPerms.canViewCostPrice ? (dup.cost_price || 0) : 0,
          item_sale_price: pricingPerms.canViewSalePrice ? (dup.sale_price || null) : null,
          notes: dup.description || ''
        }]);
      }

      setDuplicateNotice(`Duplicated from Order #${dup.order_number || dup.id} as a new unsaved draft.`);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, isFactoryMgr, pricingPerms.canViewCostPrice, pricingPerms.canViewSalePrice]);

  // Multi-item Cart
  const [cartItems, setCartItems] = useState<CartItem[]>(() => (Array.isArray(initialDraft.cartItems) ? initialDraft.cartItems : []) as any);
  const loadedRequestionItemRef = React.useRef<number | null>(null);

  useEffect(() => {
    const requestion = (location.state as any)?.requestion;
    const requestItem = requestion?.item;
    if (!requestItem?.id || loadedRequestionItemRef.current === Number(requestItem.id)) return;
    loadedRequestionItemRef.current = Number(requestItem.id);
    setCustomerName((current: string) => current || requestion.request?.customer_name || '');
    setCustomerPhone((current: string) => current || requestion.request?.customer_phone || '');
    setCartItems((current: CartItem[]) => {
      if (current.some(item => item.requestion_item_id === Number(requestItem.id))) return current;
      return [...current, {
        _id: `requestion-${requestItem.id}-${Date.now()}`,
        product_id: requestItem.product_id || undefined,
        product_name: requestItem.product_name,
        quantity: Number(requestItem.quantity) || 1,
        item_sale_price: requestItem.sale_price ?? null,
        requestion_item_id: Number(requestItem.id),
        attachedFile: null
      } as any];
    });
  }, [location.state]);

  // Authoritative real-time totals & discount recalculation
  const pricingSummary = React.useMemo(() => {
    const totalQty = cartItems.reduce((acc, i) => acc + i.quantity, 0);
    const totalCostPrice = pricingPerms.canViewCostPrice
      ? Math.round((cartItems.reduce((acc, i) => acc + (Number(i.item_cost_price) || 0) * i.quantity, 0) + Number.EPSILON) * 100) / 100
      : 0;
    const hasAnySalePrice = cartItems.some(i => i.item_sale_price !== null && i.item_sale_price !== undefined && i.item_sale_price !== '');
    const subtotal = hasAnySalePrice
      ? Math.round((cartItems.reduce((acc, i) => acc + (Number(i.item_sale_price) || 0) * i.quantity, 0) + Number.EPSILON) * 100) / 100
      : null;

    // Calculate maximum permitted discount across cart items
    let totalAllowedDiscountAmount = 0;
    let hasAnyConfiguredLimit = false;

    if (subtotal !== null && subtotal > 0) {
      for (const item of cartItems) {
        const itemSale = item.item_sale_price !== null && item.item_sale_price !== undefined && item.item_sale_price !== ''
          ? Number(item.item_sale_price)
          : null;
        if (itemSale !== null) {
          const itemSub = itemSale * item.quantity;
          if (item.max_discount_value !== undefined && item.max_discount_value !== null && !isNaN(Number(item.max_discount_value))) {
            hasAnyConfiguredLimit = true;
            const maxVal = Number(item.max_discount_value);
            if (item.max_discount_type === 'amount') {
              totalAllowedDiscountAmount += Math.min(itemSub, maxVal * item.quantity);
            } else {
              const pct = Math.min(100, Math.max(0, maxVal));
              totalAllowedDiscountAmount += itemSub * (pct / 100);
            }
          } else {
            // Backward-compatible default: no limit configured imposes no restriction
            totalAllowedDiscountAmount += itemSub;
          }
        }
      }
    }

    totalAllowedDiscountAmount = Math.round((totalAllowedDiscountAmount + Number.EPSILON) * 100) / 100;
    const totalAllowedDiscountPercent = subtotal && subtotal > 0
      ? Math.round(((totalAllowedDiscountAmount / subtotal) * 100 + Number.EPSILON) * 100) / 100
      : 0;

    let discountAmount = 0;
    let discountValNum = 0;
    let discountValidationError: string | null = null;

    if (discountValue !== '' && discountValue !== undefined && discountValue !== null) {
      const parsed = Number(discountValue);
      if (isNaN(parsed) || parsed < 0) {
        discountValidationError = 'Discount cannot be negative.';
      } else {
        discountValNum = Math.round((parsed + Number.EPSILON) * 100) / 100;
        if (subtotal === null && discountValNum > 0) {
          discountValidationError = 'Cannot apply discount when items do not have sale prices.';
        } else if (discountType === 'percent') {
          if (discountValNum > 100) {
            discountValidationError = 'Discount percentage cannot exceed 100%.';
          } else if (hasAnyConfiguredLimit && discountValNum > totalAllowedDiscountPercent + 0.001) {
            discountValidationError = `Discount (${discountValNum}%) exceeds the maximum permitted discount limit (${totalAllowedDiscountPercent}%).`;
          } else if (subtotal !== null) {
            discountAmount = Math.round((subtotal * (discountValNum / 100) + Number.EPSILON) * 100) / 100;
          }
        } else {
          // fixed amount mode
          if (subtotal !== null && discountValNum > subtotal) {
            discountValidationError = `Fixed discount (৳${discountValNum.toLocaleString()}) cannot exceed the subtotal (৳${subtotal.toLocaleString()}).`;
          } else if (hasAnyConfiguredLimit && discountValNum > totalAllowedDiscountAmount + 0.001) {
            discountValidationError = `Fixed discount (৳${discountValNum.toLocaleString()}) exceeds the maximum permitted limit (৳${totalAllowedDiscountAmount.toLocaleString()}).`;
          } else {
            discountAmount = discountValNum;
          }
        }
      }
    }

    const finalSalePrice = subtotal !== null
      ? Math.max(0, Math.round((subtotal - discountAmount + Number.EPSILON) * 100) / 100)
      : null;

    const marginAmount = finalSalePrice !== null && pricingPerms.canViewCostPrice
      ? Math.round((finalSalePrice - totalCostPrice + Number.EPSILON) * 100) / 100
      : null;

    // Money received & Amount Due calculation
    let moneyReceivedNum = 0;
    let paymentValidationError: string | null = null;
    const targetOrderTotal = finalSalePrice ?? subtotal;
    if (moneyReceived !== '' && moneyReceived !== undefined && moneyReceived !== null) {
      const trimmed = String(moneyReceived).trim();
      if (trimmed.startsWith('-')) {
        paymentValidationError = 'Money received cannot be negative.';
      } else if (isNaN(Number(trimmed)) || !/^\d+(\.\d+)?$/.test(trimmed)) {
        paymentValidationError = 'Money received must be a valid non-negative number.';
      } else if (trimmed.includes('.') && trimmed.split('.')[1].length > 2) {
        paymentValidationError = 'Money received cannot have more than 2 decimal places.';
      } else {
        moneyReceivedNum = Math.round((Number(trimmed) + Number.EPSILON) * 100) / 100;
        if (targetOrderTotal !== null && moneyReceivedNum > targetOrderTotal + 0.001) {
          paymentValidationError = `Money received (৳${moneyReceivedNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) cannot exceed total order price (৳${targetOrderTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`;
        }
      }
    }

    const amountDue = targetOrderTotal !== null
      ? Math.max(0, Math.round((targetOrderTotal - moneyReceivedNum + Number.EPSILON) * 100) / 100)
      : 0;

    const paymentStatus: 'paid' | 'partial' | 'unpaid' = (amountDue <= 0 && targetOrderTotal !== null && (targetOrderTotal > 0 || moneyReceivedNum > 0))
      ? 'paid'
      : (moneyReceivedNum > 0 ? 'partial' : 'unpaid');

    const productionHold = amountDue > 0;

    return {
      totalQty,
      totalCostPrice,
      subtotal,
      hasAnySalePrice,
      hasAnyConfiguredLimit,
      totalAllowedDiscountAmount,
      totalAllowedDiscountPercent,
      discountType,
      discountValNum,
      discountAmount,
      discountValidationError,
      finalSalePrice,
      marginAmount,
      moneyReceivedNum,
      amountDue,
      paymentStatus,
      productionHold,
      paymentValidationError
    };
  }, [cartItems, discountType, discountValue, moneyReceived, pricingPerms.canViewCostPrice]);

  // Search state
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const productSearchSeqRef = React.useRef(0);

  // Invoice Attachments
  const [invoiceAttachments, setInvoiceAttachments] = useState<{ name: string; url: string; isPending?: boolean }[]>(() => Array.isArray(initialDraft.invoiceAttachments) ? initialDraft.invoiceAttachments : []);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [invoiceUploadProgress, setInvoiceUploadProgress] = useState<Record<string, number>>({});
  const invoiceUploadsActiveRef = React.useRef(0);

  // Submission & Feedback
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const designerName = localStorage.getItem('user_name') || 'Unknown';
  const isDraftRestoredRef = React.useRef(true);


  const buildCurrentDraftData = (): PlaceOrderDraftData => ({
    priority,
    targetDeliveryDate,
    requestedDeliveryDate,
    targetDeliveryDays,
    requestedDeliveryDays,
    orderPlacementDate,
    selectedSalesmanId,
    selectedCustomerId,
    selectedCustomerInfo,
    customerName,
    customerPhone,
    customerEmail,
    shippingAddress,
    locationLandmark,
    receiverName,
    receiverPhone,
    specialInstructions,
    selectedProduct,
    selectedProductId: selectedProduct?.id ?? null,
    selectedSpecId: selectedSpec?.id,
    selectedSizeId: selectedSize?.id,
    selectedColorId: selectedColor?.id,
    itemQuantity,
    itemCostPrice,
    itemSalePrice,
    itemRemarks,
    selectedItemAttachedFile: attachedFile
      ? { name: attachedFile.name, url: attachedFile.url, uploadId: attachedFile.uploadId, type: attachedFile.type }
      : null,
    isCustomSize,
    customShape,
    customLength,
    customWidth,
    customHeight,
    customDiameter,
    customUnit,
    isCustomSpec,
    customSpecName,
    isCustomColor,
    customColorName,
    isCustomItemMode,
    customItemName,
    customItemSize,
    customItemSpec,
    cartItems: cartItems as any,
    invoiceAttachments,
    discountType,
    discountValue,
    moneyReceived
  });

  const handleLoadSavedDraft = (savedDraft: SavedPlaceOrderDraft) => {
    if (activeSavedDraftId !== savedDraft.id && hasMeaningfulPlaceOrderDraft(buildCurrentDraftData())) {
      const confirmed = window.confirm(
        'Loading this saved draft will replace the order details currently in the form. Continue?'
      );
      if (!confirmed) return;
    }

    const d = savedDraft.data || {};
    const product = d.selectedProduct || null;
    const placement = d.orderPlacementDate || getTodayYmd();
    setOrderPlacementDate(placement);

    if (d.targetDeliveryDays !== undefined && d.targetDeliveryDays !== null && d.targetDeliveryDays !== '') {
      setTargetDeliveryDays(String(d.targetDeliveryDays));
    } else if (d.targetDeliveryDate) {
      const days = calculateWorkingDaysBetween(placement, d.targetDeliveryDate);
      setTargetDeliveryDays(days > 0 ? String(days) : '');
    } else {
      setTargetDeliveryDays('');
    }

    if (d.requestedDeliveryDays !== undefined && d.requestedDeliveryDays !== null && d.requestedDeliveryDays !== '') {
      setRequestedDeliveryDays(String(d.requestedDeliveryDays));
    } else if (d.requestedDeliveryDate) {
      const reqDays = calculateWorkingDaysBetween(placement, d.requestedDeliveryDate);
      setRequestedDeliveryDays(reqDays > 0 ? String(reqDays) : '');
    } else {
      setRequestedDeliveryDays('');
    }

    setPriority(d.priority || 'Normal');
    setSelectedSalesmanId(d.selectedSalesmanId || '');
    setSelectedCustomerId(d.selectedCustomerId ?? d.selectedCustomerInfo?.id ?? null);
    setSelectedCustomerInfo(d.selectedCustomerInfo || null);
    setCustomerName(d.customerName || '');
    setCustomerPhone(d.customerPhone || '');
    setCustomerEmail(d.customerEmail || '');
    setShippingAddress(d.shippingAddress || '');
    setLocationLandmark(d.locationLandmark || '');
    setReceiverName(d.receiverName || '');
    setReceiverPhone(d.receiverPhone || '');
    setSpecialInstructions(d.specialInstructions || '');
    setSelectedProduct(product);
    setSelectedSpec(product?.specifications?.find((item: any) => String(item.id) === String(d.selectedSpecId)) || null);
    setSelectedSize(product?.sizes?.find((item: any) => String(item.id) === String(d.selectedSizeId)) || null);
    setSelectedColor(product?.colors?.find((item: any) => String(item.id) === String(d.selectedColorId))
      || product?.specifications?.flatMap((spec: any) => spec.colors || []).find((item: any) => String(item.id) === String(d.selectedColorId))
      || null);
    setItemQuantity(d.itemQuantity ?? 1);
    setItemCostPrice(d.itemCostPrice ?? '');
    setItemSalePrice(d.itemSalePrice ?? '');
    setItemRemarks(d.itemRemarks || '');
    setAttachedFile(d.selectedItemAttachedFile?.url
      ? { name: d.selectedItemAttachedFile.name, url: d.selectedItemAttachedFile.url, uploadId: d.selectedItemAttachedFile.uploadId, type: d.selectedItemAttachedFile.type }
      : null);
    setIsCustomSize(d.isCustomSize ?? false);
    setCustomShape(d.customShape || 'rect');
    setCustomLength(d.customLength || '');
    setCustomWidth(d.customWidth || '');
    setCustomHeight(d.customHeight || '');
    setCustomDiameter(d.customDiameter || '');
    setCustomUnit(d.customUnit || 'mm');
    setIsCustomSpec(d.isCustomSpec ?? false);
    setCustomSpecName(d.customSpecName || '');
    setIsCustomColor(d.isCustomColor ?? false);
    setCustomColorName(d.customColorName || '');
    setIsCustomItemMode(d.isCustomItemMode ?? false);
    setCustomItemName(d.customItemName || '');
    setCustomItemSize(d.customItemSize || '');
    setCustomItemSpec(d.customItemSpec || '');
    setCartItems(Array.isArray(d.cartItems) ? d.cartItems as any : []);
    setInvoiceAttachments(Array.isArray(d.invoiceAttachments) ? d.invoiceAttachments : []);
    setDiscountType(d.discountType || 'percent');
    setDiscountValue(d.discountValue !== undefined && d.discountValue !== null ? String(d.discountValue) : '');
    setMoneyReceived(d.moneyReceived !== undefined && d.moneyReceived !== null ? String(d.moneyReceived) : '0');
    setShowColorOptions(false);
    setCustomerSearchQuery('');
    setCustomerSuggestions([]);
    setShowCustomerDropdown(false);
    setError('');
    setSuccess(false);
    setActiveSavedDraftId(savedDraft.id);
    showToast('Loaded saved draft: ' + savedDraft.title, 'success');
  };

  const handleSaveAsDraft = async () => {
    if (pendingItemUploadsRef.current.length) await Promise.all(pendingItemUploadsRef.current);
    const snapshot = buildCurrentDraftData();
    if (!hasMeaningfulPlaceOrderDraft(snapshot)) {
      showToast('Enter customer details or add an item before saving a draft.', 'warning');
      return;
    }

    const draftTitle = (
      customerName.trim()
      || selectedCustomerInfo?.name
      || cartItems[0]?.product_name
      || selectedProduct?.product_name
      || customItemName.trim()
      || 'Untitled order'
    ).toString();

    try {
      const saved = saveNamedPlaceOrderDraft(snapshot, draftTitle, activeSavedDraftId || undefined);
      setSavedDrafts(loadSavedPlaceOrderDrafts());
      setActiveSavedDraftId(saved.draft.id);
      if (saved.omittedAttachmentCount > 0) {
        showToast(
          'Draft saved. ' + saved.omittedAttachmentCount + ' temporary or offline attachment(s) were not saved; upload them to server storage before relying on this draft.',
          'warning'
        );
      } else {
        showToast('Draft saved: ' + saved.draft.title, 'success');
      }
    } catch (err: any) {
      showToast('Could not save draft locally: ' + (err?.message || 'storage is unavailable or full'), 'error');
    }
  };

  const handleDeleteSavedDraft = (savedDraft: SavedPlaceOrderDraft) => {
    if (!window.confirm('Delete saved draft "' + savedDraft.title + '"? This cannot be undone.')) return;
    deleteSavedPlaceOrderDraft(savedDraft.id);
    setSavedDrafts(loadSavedPlaceOrderDrafts());
    if (activeSavedDraftId === savedDraft.id) setActiveSavedDraftId(null);
    showToast('Saved draft deleted.', 'success');
  };

  const handleDuplicateSavedDraft = (savedDraft: SavedPlaceOrderDraft) => {
    try {
      const duplicatedData = JSON.parse(JSON.stringify(savedDraft.data));
      const duplicatedTitle = `${savedDraft.title} (Copy)`;
      const saved = saveNamedPlaceOrderDraft(duplicatedData, duplicatedTitle);
      setSavedDrafts(loadSavedPlaceOrderDrafts());
      showToast('Draft duplicated: ' + saved.draft.title, 'success');
    } catch (err: any) {
      showToast('Could not duplicate draft: ' + (err?.message || 'Storage error'), 'error');
    }
  };


  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerDropdownContainerRef.current && !customerDropdownContainerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
      if (colorDropdownContainerRef.current && !colorDropdownContainerRef.current.contains(e.target as Node)) {
        setShowColorOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced customer search
  const performCustomerSearch = React.useCallback(async (query: string) => {
    const trimmed = (query || '').trim();
    if (!trimmed || trimmed.length < 2) {
      setCustomerSuggestions([]);
      setIsSearchingCustomer(false);
      setShowCustomerDropdown(false);
      return;
    }

    const currentSeq = ++customerSearchSeqRef.current;
    setIsSearchingCustomer(true);

    try {
      // @ts-ignore
      if (window.electron?.makeSearchCustomers) {
        // @ts-ignore
        const res = await window.electron.makeSearchCustomers(trimmed);
        if (currentSeq === customerSearchSeqRef.current) {
          if (res?.success && Array.isArray(res.customers)) {
            setCustomerSuggestions(res.customers);
            setShowCustomerDropdown(res.customers.length > 0);
          } else {
            setCustomerSuggestions([]);
            setShowCustomerDropdown(false);
          }
        }
      }
    } catch (err) {
      console.error('[PlaceOrder] Customer search error:', err);
    } finally {
      if (currentSeq === customerSearchSeqRef.current) {
        setIsSearchingCustomer(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!customerSearchQuery || customerSearchQuery.trim().length < 2) {
      setCustomerSuggestions([]);
      setIsSearchingCustomer(false);
      setShowCustomerDropdown(false);
      return;
    }
    const timer = setTimeout(() => {
      performCustomerSearch(customerSearchQuery);
    }, 280);
    return () => clearTimeout(timer);
  }, [customerSearchQuery, performCustomerSearch]);

  const handleSelectCustomer = async (cust: any) => {
    setShowCustomerDropdown(false);
    setHighlightedCustomerIndex(-1);
    setCustomerSearchQuery('');

    try {
      let authoritative = cust;
      // @ts-ignore
      if (window.electron?.makeGetCustomerDetails) {
        // @ts-ignore
        const res = await window.electron.makeGetCustomerDetails(cust.id);
        if (res?.success && res.customer) {
          authoritative = res.customer;
        }
      }

      setSelectedCustomerId(authoritative.id);
      setSelectedCustomerInfo({
        id: authoritative.id,
        name: authoritative.name,
        phone: authoritative.phone,
        email: authoritative.email,
        company: authoritative.company,
        address: authoritative.address
      });

      if (authoritative.name) setCustomerName(authoritative.name);
      if (authoritative.phone) setCustomerPhone(authoritative.phone);
      if (authoritative.email) setCustomerEmail(authoritative.email);
      if (authoritative.delivery_address || authoritative.address) {
        setShippingAddress(authoritative.delivery_address || authoritative.address);
      }
      if (authoritative.location_landmark) setLocationLandmark(authoritative.location_landmark);
      if (authoritative.receiver_name) setReceiverName(authoritative.receiver_name);
      else if (authoritative.name) setReceiverName(authoritative.name);
      if (authoritative.receiver_phone) setReceiverPhone(authoritative.receiver_phone);
      else if (authoritative.phone) setReceiverPhone(authoritative.phone);
    } catch (e) {
      console.error('[PlaceOrder] Failed to load authoritative customer details:', e);
      setSelectedCustomerId(cust.id);
      setSelectedCustomerInfo(cust);
      if (cust.name) setCustomerName(cust.name);
      if (cust.phone) setCustomerPhone(cust.phone);
      if (cust.email) setCustomerEmail(cust.email);
      if (cust.address) setShippingAddress(cust.address);
    }
  };

  const handleUnlinkCustomer = () => {
    setSelectedCustomerId(null);
    setSelectedCustomerInfo(null);
  };

  // Auto-persist draft changes across page navigation
  useEffect(() => {
    if (!isDraftRestoredRef.current) return;
    const timer = setTimeout(() => {
      savePlaceOrderDraft({
        priority,
        targetDeliveryDate,
        requestedDeliveryDate,
        targetDeliveryDays,
        requestedDeliveryDays,
        orderPlacementDate,
        selectedSalesmanId,
        selectedCustomerId,
        selectedCustomerInfo,
        customerName,
        customerPhone,
        customerEmail,
        shippingAddress,
        locationLandmark,
        receiverName,
        receiverPhone,
        specialInstructions,
        selectedProduct,
        selectedSpecId: selectedSpec?.id,
        selectedSizeId: selectedSize?.id,
        selectedColorId: selectedColor?.id,
        itemQuantity,
        itemCostPrice,
        itemSalePrice,
        itemRemarks,
        selectedItemAttachedFile: attachedFile ? { name: attachedFile.name, type: attachedFile.type, url: attachedFile.url, uploadId: attachedFile.uploadId } : null,
        isCustomSize,
        customShape,
        customLength,
        customWidth,
        customHeight,
        customDiameter,
        customUnit,
        isCustomSpec,
        customSpecName,
        isCustomColor,
        customColorName,
        isCustomItemMode,
        customItemName,
        customItemSize,
        customItemSpec,
        cartItems: cartItems as any,
        invoiceAttachments,
        discountType,
        discountValue
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [
    priority, targetDeliveryDate, requestedDeliveryDate, targetDeliveryDays, requestedDeliveryDays, orderPlacementDate, selectedSalesmanId,
    selectedCustomerId, selectedCustomerInfo,
    customerName, customerPhone, customerEmail, shippingAddress, locationLandmark,
    receiverName, receiverPhone, specialInstructions, selectedProduct, selectedSpec, attachedFile,
    selectedSize, selectedColor, itemQuantity, itemCostPrice, itemSalePrice, itemRemarks,
    isCustomSize, customShape, customLength, customWidth, customHeight, customDiameter,
    customUnit, isCustomSpec, customSpecName, isCustomColor, customColorName,
    isCustomItemMode, customItemName, customItemSize, customItemSpec, cartItems, invoiceAttachments,
    discountType, discountValue
  ]);

  const handleClearDraft = () => {
    const hasContent = hasMeaningfulPlaceOrderDraft({
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,
      specialInstructions,
      cartItems: cartItems as any,
      invoiceAttachments,
      selectedProduct,
      customItemName,
      targetDeliveryDate
    });

    if (hasContent) {
      const confirmed = window.confirm(
        'Are you sure you want to clear your unsaved order draft? All entered fields will be reset.'
      );
      if (!confirmed) return;
    }

    clearPlaceOrderDraft();
    setActiveSavedDraftId(null);
    setDiscountType('percent');
    setDiscountValue('');
    setShowColorOptions(false);
    setSelectedCustomerId(null);
    setSelectedCustomerInfo(null);
    setCustomerSearchQuery('');
    setCustomerSuggestions([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setShippingAddress('');
    setLocationLandmark('');
    setReceiverName('');
    setReceiverPhone('');
    setSpecialInstructions('');
    setPriority('Normal');
    setTargetDeliveryDays('');
    setRequestedDeliveryDays('');
    setOrderPlacementDate(getTodayYmd());
    setSelectedSalesmanId('');
    setSelectedProduct(null);
    setSelectedSpec(null);
    setSelectedSize(null);
    setSelectedColor(null);
    setItemQuantity(1);
    setItemCostPrice('');
    setItemSalePrice('');
    setItemRemarks('');
    setIsCustomSize(false);
    setIsCustomSpec(false);
    setIsCustomColor(false);
    setIsCustomItemMode(false);
    setCustomItemName('');
    setCustomItemSize('');
    setCustomItemSpec('');
    setCartItems([]);
    setInvoiceAttachments([]);
    setAttachedFile(null);
  };

  useEffect(() => {
    // Load Salesmen
    // @ts-ignore
    window.electron.getSalesmen().then((list: any[]) => {
      setSalesmen(Array.isArray(list) ? list : []);
    }).catch(() => setSalesmen([]));

    // Load Catalog Products
    // @ts-ignore
    if (window.electron.makeGetCatalogProducts) {
      // @ts-ignore
      window.electron.makeGetCatalogProducts({ activeOnly: true }).then((products: any[]) => {
        setCatalogProducts(Array.isArray(products) ? products : []);
      }).catch((e) => {
        console.error(e);
        setCatalogProducts([]);
      });
    }

    // Fetch next auto-generated order number for display
    if (window.electron?.makeGetNextOrderNumber) {
      window.electron.makeGetNextOrderNumber().then((num: any) => {
        if (num) {
          const str = typeof num === 'string' ? num : (num.orderNumber || num.order_number || String(num));
          setAutoOrderNumber(str);
        }
      }).catch(() => {});
    }
  }, []);

  const handleProductCreated = (newProd: any) => {
    // Immediately select and add to catalog state without waiting for full catalog reload
    setCatalogProducts(prev => [newProd, ...prev.filter(p => p.id !== newProd.id)]);
    handleProductSelect(newProd.id, newProd);

    // Refresh catalog asynchronously in background
    if (window.electron?.makeGetCatalogProducts) {
      window.electron.makeGetCatalogProducts({ activeOnly: true }).then((products: any[]) => {
        if (Array.isArray(products) && products.length > 0) {
          setCatalogProducts(products);
        }
      }).catch(() => {});
    }
  };

  // Debounced product search
  useEffect(() => {
    if (!productSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const currentSeq = ++productSearchSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        let results: any[] = [];
        if (window.electron?.makeSearchProducts) {
          const res = await window.electron.makeSearchProducts({ query: productSearch, activeOnly: true });
          results = Array.isArray(res) ? res : [];
        } else {
          const lower = productSearch.toLowerCase();
          results = (catalogProducts || []).filter(p =>
            p.product_name?.toLowerCase().includes(lower) ||
            p.product_code?.toLowerCase().includes(lower) ||
            p.description?.toLowerCase().includes(lower) ||
            p.category?.toLowerCase().includes(lower)
          );
        }
        if (currentSeq === productSearchSeqRef.current) {
          setSearchResults(results);
        }
      } catch (err) {
        console.error('Search products failed:', err);
        if (currentSeq === productSearchSeqRef.current) {
          setSearchResults([]);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch, catalogProducts]);

  const handlePickDesktopInvoice = async () => {
    setUploadingInvoice(true);
    try {
      if (window.electron?.makePickAndUploadInvoiceAttachment) {
        const res = await window.electron.makePickAndUploadInvoiceAttachment();
        const persistentUrl = res.durableKey || (res.publicUrl && !res.publicUrl.includes('token=') ? res.publicUrl : undefined) || res.durableKey;
        if (res && (res.success || res.isPendingUpload) && persistentUrl) {
          setInvoiceAttachments(prev => [...prev, {
            name: res.fileName || 'Invoice Image',
            url: persistentUrl,
            isPending: Boolean(res.isPendingUpload)
          }]);
        } else if (res && res.error) {
          alert('Upload failed: ' + res.error);
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Error selecting invoice image: ' + (err.message || 'Unknown error'));
    } finally {
      setUploadingInvoice(false);
    }
  };

  const handleProductSelect = (productId: number, directProd?: any) => {
    const prod = directProd || searchResults.find(p => p.id === productId) || catalogProducts.find(p => p.id === productId) || null;
    setSelectedProduct(prod);
    setSelectedSpec(null);
    const activeSize = prod ? (prod.size || (prod.sizes && prod.sizes.length > 0 ? prod.sizes[0] : null)) : null;
    setSelectedSize(activeSize);
    setSelectedColor(null);
    setIsCustomSpec(false);
    setCustomSpecName('');
    setIsCustomColor(false);
    setCustomColorName('');
    setIsCustomSize(false);
    setCustomLength('');
    setCustomWidth('');
    setCustomHeight('');
    setCustomDiameter('');
    if (prod) {
      setItemCostPrice(pricingPerms.canViewCostPrice ? (prod.cost_price ?? prod.purchase_price ?? '') : '');
      setItemSalePrice(prod.sale_price ?? prod.selling_price ?? prod.mrp ?? '');
    } else {
      setItemCostPrice('');
      setItemSalePrice('');
    }
  };

  const handleSpecSelect = (specId: number) => {
    if (!selectedProduct) return;
    const spec = (selectedProduct.specifications || []).find((s: any) => s.id === specId) || null;
    setSelectedSpec(spec);
    setSelectedSize(null);
    setSelectedColor(null);
  };

  const handleAddItemToOrder = () => {
    const costP = pricingPerms.canViewCostPrice && itemCostPrice !== '' ? Math.max(0, Number(itemCostPrice) || 0) : 0;
    const saleP = itemSalePrice !== '' ? Math.max(0, Number(itemSalePrice) || 0) : null;
    const qty = itemQuantity > 0 ? itemQuantity : 1;

    // Line discount calculation
    let lineDiscAmount = 0;
    let lineDiscVal: number | null = null;
    let lineDiscType: 'percent' | 'amount' | null = null;

    if (itemDiscountValue !== '' && itemDiscountValue !== undefined && itemDiscountValue !== null && saleP !== null) {
      const parsedD = Number(itemDiscountValue);
      if (!isNaN(parsedD) && parsedD > 0) {
        lineDiscType = itemDiscountType;
        lineDiscVal = parsedD;
        const lineBase = saleP * qty;
        if (itemDiscountType === 'percent') {
          const pct = Math.min(100, Math.max(0, parsedD));
          lineDiscAmount = Math.round((lineBase * (pct / 100) + Number.EPSILON) * 100) / 100;
        } else {
          lineDiscAmount = Math.min(lineBase, Math.round((parsedD + Number.EPSILON) * 100) / 100);
        }
      }
    }

    const finalItemPrice = saleP !== null ? Math.max(0, Math.round(((saleP * qty) - lineDiscAmount + Number.EPSILON) * 100) / 100) : null;

    if (isCustomItemMode) {
      if (!customItemName.trim()) {
        alert('Custom item name is required.');
        return;
      }
      const newItem: CartItem = {
        _id: String(Date.now()),
        product_name: customItemName.trim(),
        spec_details: customItemSpec.trim() || undefined,
        spec_name: customItemSpec.trim() || undefined,
        dimensions_text: customItemSize.trim() || undefined,
        custom_dimensions: customItemSize.trim() || undefined,
        is_customized: true,
        quantity: qty,
        item_cost_price: costP,
        item_sale_price: saleP,
        discount_type: null,
        discount_value: null,
        discount_amount: 0,
        final_item_price: saleP !== null ? (saleP * qty) : null,
        notes: itemRemarks,
        attachedFile: attachedFile ? { ...attachedFile } : null
      };
      setCartItems(prev => [...prev, newItem]);
      setCustomItemName('');
      setCustomItemSize('');
      setCustomItemSpec('');
      setItemRemarks('');
      setItemQuantity(1);
      setItemCostPrice('');
      setItemSalePrice('');
      setItemDiscountType('percent');
      setItemDiscountValue('');
      setAttachedFile(null);
    } else {
      if (!selectedProduct) {
        alert('Please select a product from the catalog.');
        return;
      }
      
      const isCustomized = isCustomSize || isCustomSpec || isCustomColor;

      let dimText = '';
      if (isCustomSize) {
        if (customShape === 'round') {
          dimText = `Ø ${customDiameter || '—'} x ${customHeight || '—'} ${customUnit} (Custom)`;
        } else {
          dimText = `${customLength || '—'} x ${customWidth || '—'} x ${customHeight || '—'} ${customUnit} (Custom)`;
        }
      } else if (selectedSize) {
        if (selectedSize.diameter) {
          dimText = `Ø ${selectedSize.diameter} x ${selectedSize.height || '—'} ${selectedSize.unit || 'mm'}`;
        } else {
          dimText = `${selectedSize.length || '—'} x ${selectedSize.width || '—'} x ${selectedSize.height || '—'} ${selectedSize.unit || 'mm'}`;
        }
      }

      const finalSpecName = isCustomSpec 
        ? (customSpecName.trim() || 'Custom Specification') 
        : (selectedSpec?.spec_name || undefined);

      const finalColorName = isCustomColor 
        ? (customColorName.trim() || 'Custom Color') 
        : (selectedColor?.color_name || undefined);

      const newItem: CartItem = {
        _id: String(Date.now()),
        product_id: selectedProduct.id,
        product_code: selectedProduct.product_code,
        product_name: selectedProduct.product_name,
        spec_id: isCustomSpec ? undefined : selectedSpec?.id,
        spec_name: finalSpecName,
        spec_details: isCustomSpec ? customSpecName.trim() : selectedSpec?.spec_details,
        size_id: isCustomSize ? undefined : selectedSize?.id,
        dimensions_text: dimText,
        is_customized: isCustomized,
        custom_dimensions: isCustomSize ? dimText : undefined,
        color_id: isCustomColor ? undefined : selectedColor?.id,
        color_name: finalColorName,
        color_code: isCustomColor ? undefined : selectedColor?.color_code,
        quantity: qty,
        item_cost_price: costP,
        item_sale_price: saleP,
        discount_type: lineDiscType,
        discount_value: lineDiscVal,
        discount_amount: lineDiscAmount,
        final_item_price: finalItemPrice,
        max_discount_type: selectedProduct.max_discount_type || null,
        max_discount_value: selectedProduct.max_discount_value !== undefined && selectedProduct.max_discount_value !== null ? Number(selectedProduct.max_discount_value) : null,
        notes: itemRemarks,
        attachedFile: attachedFile ? { ...attachedFile } : null
      };

      setCartItems(prev => [...prev, newItem]);
      setIsCustomSpec(false);
      setCustomSpecName('');
      setIsCustomColor(false);
      setCustomColorName('');
      setIsCustomSize(false);
      setCustomLength('');
      setCustomWidth('');
      setCustomHeight('');
      setCustomDiameter('');
      setItemRemarks('');
      setItemQuantity(1);
      setItemCostPrice('');
      setItemSalePrice('');
      setItemDiscountType('percent');
      setItemDiscountValue('');
      setAttachedFile(null);
    }
  };

  const removeCartItem = (id: string) => {
    setCartItems(prev => prev.filter(i => i._id !== id));
  };

  // ── Document & Invoice Upload ────────────────────────────────────────────
  const handleUploadFileAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingInvoice(true);
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the 15 MB limit.`);
        continue;
      }

      const progressKey = `${file.name}-${file.size}-${file.lastModified}`;
      invoiceUploadsActiveRef.current += 1;
      setUploadingInvoice(true);
      setInvoiceUploadProgress(prev => ({ ...prev, [progressKey]: 0 }));
      try {
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onprogress = event => {
            if (event.lengthComputable) setInvoiceUploadProgress(prev => ({ ...prev, [progressKey]: Math.min(40, Math.round(event.loaded / event.total * 40)) }));
          };
          reader.onload = async () => {
            try {
              const base64 = reader.result as string;
              setInvoiceUploadProgress(prev => ({ ...prev, [progressKey]: 45 }));
              if (window.electron?.makeUploadInvoiceAttachmentBuffer) {
                setInvoiceUploadProgress(prev => ({ ...prev, [progressKey]: 55 }));
                const res = await window.electron.makeUploadInvoiceAttachmentBuffer({
                  fileName: file.name,
                  fileBase64: base64
                });
                const persistentUrl = res.durableKey || (res.publicUrl && !res.publicUrl.includes('token=') ? res.publicUrl : undefined) || res.durableKey;
                if (res && (res.success || res.isPendingUpload) && persistentUrl) {
                  setInvoiceUploadProgress(prev => ({ ...prev, [progressKey]: 100 }));
                  setInvoiceAttachments(prev => [...prev, {
                    name: file.name,
                    url: persistentUrl,
                    isPending: Boolean(res.isPendingUpload)
                  }]);
                } else if (res && res.error) {
                  alert(`Upload failed for "${file.name}": ` + res.error);
                }
              } else {
                setInvoiceUploadProgress(prev => ({ ...prev, [progressKey]: 100 }));
                setInvoiceAttachments(prev => [...prev, { name: file.name, url: base64 }]);
              }
            } catch (bufErr: any) {
              console.error('Buffer upload exception:', bufErr);
            } finally {
              resolve();
            }
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(file);
        });
      } catch (err: any) {
        console.error(err);
      } finally {
        invoiceUploadsActiveRef.current = Math.max(0, invoiceUploadsActiveRef.current - 1);
        if (invoiceUploadsActiveRef.current === 0) setUploadingInvoice(false);
        window.setTimeout(() => setInvoiceUploadProgress(prev => { const next = { ...prev }; delete next[progressKey]; return next; }), 1200);
      }
    }
    e.target.value = '';
  };

  // ── Submit Order ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFactoryMgr) {
      setError('Factory Managers are strictly restricted from placing orders.');
      return;
    }
    if (cartItems.length === 0) {
      setError('Please add at least one product item to the order.');
      return;
    }

    if (!targetDeliveryDays || !targetDeliveryDate || targetDeliveryCalc.error) {
      setError(targetDeliveryCalc.error || 'Target Delivery Date is mandatory. Please enter a valid number of working days.');
      return;
    }
    if (requestedDeliveryDays && requestedDeliveryCalc.error) {
      setError(requestedDeliveryCalc.error);
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (pendingItemUploadsRef.current.length) await Promise.all(pendingItemUploadsRef.current);
      if (pricingSummary.discountValidationError) {
        alert(`Invalid discount: ${pricingSummary.discountValidationError}`);
        setLoading(false);
        return;
      }
      if (pricingSummary.paymentValidationError) {
        alert(pricingSummary.paymentValidationError);
        setLoading(false);
        return;
      }

      const totalQty = pricingSummary.totalQty;
      const totalCostPrice = pricingSummary.totalCostPrice;
      const totalSalePrice = pricingSummary.subtotal;

      const mainTitle = cartItems.length === 1 
        ? cartItems[0].product_name 
        : `${cartItems[0].product_name} (+${cartItems.length - 1} items)`;

      // @ts-ignore
      const order = await window.electron.createMakeOrder({
        furniture_name: mainTitle,
        description: specialInstructions || cartItems.map(i => `${i.product_name}${i.is_customized ? ' [Customized]' : ''} (${i.quantity})`).join(', '),
        quantity: totalQty,
        designer_name: designerName,
        priority,
        delivery_date: targetDeliveryDate,
        target_delivery_date: targetDeliveryDate,
        requested_delivery_date: requestedDeliveryDate || null,
        target_delivery_days: Number(targetDeliveryDays) || null,
        requested_delivery_days: requestedDeliveryDays ? Number(requestedDeliveryDays) : null,
        salesman_id: isAdminOrManager
          ? (selectedSalesmanId ? parseInt(selectedSalesmanId) : null)
          : (currentUser.id ? parseInt(String(currentUser.id)) : (selectedSalesmanId ? parseInt(selectedSalesmanId) : null)),
        customer_id: selectedCustomerId || null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim(),
        shipping_address: shippingAddress.trim(),
        location_landmark: locationLandmark.trim(),
        receiver_name: receiverName.trim(),
        receiver_phone: receiverPhone.trim(),
        special_instructions: specialInstructions.trim(),
        cost_price: totalCostPrice,
        sale_price: totalSalePrice,
        discount_type: pricingSummary.discountValNum > 0 ? pricingSummary.discountType : null,
        discount_value: pricingSummary.discountValNum > 0 ? pricingSummary.discountValNum : null,
        discount_amount: pricingSummary.discountAmount,
        final_price: pricingSummary.finalSalePrice,
        money_received: pricingSummary.moneyReceivedNum,
        amount_due: pricingSummary.amountDue,
        payment_status: pricingSummary.paymentStatus,
        production_hold: pricingSummary.productionHold,
        hold_reason: pricingSummary.productionHold ? `Outstanding balance of ৳${pricingSummary.amountDue.toLocaleString()} due` : null,
        admin_approval_status: 'none',
        invoice_attachments: invoiceAttachments.map(a => a.url),
        items: cartItems.map(i => ({
          product_id: i.product_id || null,
          requestion_item_id: (i as any).requestion_item_id || null,
          product_name: i.product_name,
          spec_id: i.spec_id || null,
          spec_name: i.spec_name || null,
          spec_details: i.spec_details || null,
          size_id: i.size_id || null,
          dimensions_text: i.dimensions_text || null,
          color_id: i.color_id || null,
          color_name: i.color_name || null,
          quantity: i.quantity,
          item_cost_price: pricingPerms.canViewCostPrice ? (Number(i.item_cost_price) || 0) : 0,
          item_sale_price: i.item_sale_price !== null && i.item_sale_price !== undefined && i.item_sale_price !== '' ? Number(i.item_sale_price) : null,
          discount_type: i.discount_type || null,
          discount_value: i.discount_value !== undefined && i.discount_value !== null && i.discount_value !== '' ? Number(i.discount_value) : null,
          discount_amount: i.discount_amount !== undefined && i.discount_amount !== null ? Number(i.discount_amount) : 0,
          final_item_price: i.final_item_price !== undefined && i.final_item_price !== null ? Number(i.final_item_price) : null,
          max_discount_type: i.max_discount_type || null,
          max_discount_value: i.max_discount_value !== undefined && i.max_discount_value !== null ? Number(i.max_discount_value) : null,
          is_customized: !!i.is_customized,
          custom_dimensions: i.custom_dimensions || (i.is_customized ? i.dimensions_text : null),
          designer_notes: i.notes || null
        }))
      });

      const orderId = order?.id;
      const createdItems = order?.items || [];
      const attachmentWarnings: string[] = [];

      // Upload per-item drawings / attachments if attached via base64 buffer
      if (orderId && Array.isArray(createdItems)) {
        for (let idx = 0; idx < cartItems.length; idx++) {
          const item = cartItems[idx];
          if (item.attachedFile && item.attachedFile.uploadId && item.attachedFile.url) {
            const createdItem = createdItems[idx];
            if (createdItem?.id) {
              const attached = await window.electron?.makeAssociateOrderAttachment?.({
                uploadId: item.attachedFile.uploadId,
                orderId,
                itemId: createdItem.id,
                fileRef: item.attachedFile.url
              });
              if (!attached?.success) attachmentWarnings.push(`${item.attachedFile.name}: ${attached?.error || 'attachment could not be linked'}`);
            }
          } else if (item.attachedFile && item.attachedFile.base64) {
            const createdItem = createdItems[idx];
            if (createdItem?.id && window.electron?.makeUploadInvoiceAttachmentBuffer) {
              try {
                await window.electron.makeUploadInvoiceAttachmentBuffer({
                  fileName: item.attachedFile.name,
                  fileBase64: item.attachedFile.base64,
                  orderId,
                  itemId: createdItem.id
                });
              } catch (upErr) {
                console.error('Failed to upload item drawing:', upErr);
              }
            }
          }
        }
      }

      const confirmedNo = order?.order_number || (orderId ? `ORD-${orderId}` : 'Confirmed');
      if (attachmentWarnings.length) showToast(`Order ${confirmedNo} was placed, but an attachment needs to be reattached: ${attachmentWarnings.join('; ')}`, 'warning');
      setConfirmedOrderNumber(confirmedNo);
      setSuccess(true);

      // Trigger Windows Action Center Notification safely without PII
      if (window.electron?.showWindowsNotification) {
        window.electron.showWindowsNotification({
          title: 'Order Confirmed',
          body: `Order #${confirmedNo} has been successfully placed in MAKE.`,
          category: 'new_order',
          dedupKey: `order-created-${orderId || confirmedNo}`
        });
      }

      clearPlaceOrderDraft();
      if (activeSavedDraftId) {
        deleteSavedPlaceOrderDraft(activeSavedDraftId);
        setSavedDrafts(loadSavedPlaceOrderDrafts());
        setActiveSavedDraftId(null);
      }
      setSelectedCustomerId(null);
      setSelectedCustomerInfo(null);
      setCustomerSearchQuery('');
      setCustomerSuggestions([]);
      setCartItems([]);
      setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setShippingAddress('');
      setLocationLandmark(''); setReceiverName(''); setReceiverPhone(''); setSpecialInstructions('');
      setTargetDeliveryDays(''); setRequestedDeliveryDays(''); setOrderPlacementDate(getTodayYmd());
      setInvoiceAttachments([]);
      setAttachedFile(null);
      setTimeout(() => {
        setSuccess(false);
        setConfirmedOrderNumber(null);
      }, 5000);
    } catch (err: any) {
      console.error(err);
      setError('Failed to place order: ' + (err?.message || 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'var(--input-bg, #f5f5f5)', border: '1px solid var(--border-color, #e0e0e0)',
    borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem',
    boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s'
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.8rem', fontWeight: 700,
    color: 'var(--text-secondary)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.03em'
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)',
    marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)',
    display: 'flex', alignItems: 'center', gap: '8px'
  };

  if (isFactoryMgr) {
    return (
      <DashboardLayout title="Place Customized Furniture Order">
        <div style={{ maxWidth: '800px', margin: '3rem auto', padding: '0 1.5rem' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '2.5rem', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <Lock size={48} color="#ea580c" style={{ margin: '0 auto 1rem auto' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Access Restricted: Factory Manager</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '520px', margin: '0 auto 1.5rem auto', lineHeight: 1.6 }}>
              Factory Manager accounts are designated exclusively for managing production stages and workshop operations in <strong>Track Orders</strong>. Placing new production orders is restricted to Furniture Designers, Salespersons, and Administrators.
            </p>
            <a href="#/make/track" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--accent-color)', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: 700, fontSize: '0.88rem' }}>
              Go to Track Orders →
            </a>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Place Customized Furniture Order">
      <div style={{ maxWidth: '1000px', margin: '1.5rem auto', padding: '0 1.5rem' }}>
        {!isDraftsView && <>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <Plus size={24} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>New Production Order</h2>
                  {autoOrderNumber && (
                    <span 
                      id="place-order-number-badge"
                      title="Authoritative system-generated order number"
                      style={{
                        padding: '3px 8px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        color: 'var(--accent-color)',
                        letterSpacing: '0.04em'
                      }}
                    >
                      {autoOrderNumber}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Active User: <strong>{designerName}</strong> • Order Number: Auto-generated • {headerDateTime}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={handleClearDraft}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="Clear entered order details and reset form"
              >
                <Trash2 size={14} /> Clear Draft
              </button>
              <div style={{ padding: '6px 14px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-color)', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>
                {cartItems.length} Item(s) in Order
              </div>
            </div>
          </div>

          {/* Capability / Role Badge Banner */}
          <div style={{
            padding: '0.6rem 1rem',
            borderRadius: '10px',
            background: pricingPerms.canModifyAll 
              ? 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.08) 100%)'
              : pricingPerms.isDesigner
                ? 'linear-gradient(90deg, rgba(16,185,129,0.08) 0%, rgba(59,130,246,0.08) 100%)'
                : 'linear-gradient(90deg, rgba(249,115,22,0.08) 0%, rgba(234,88,12,0.08) 100%)',
            border: `1px solid ${pricingPerms.canModifyAll ? 'rgba(99,102,241,0.25)' : pricingPerms.isDesigner ? 'rgba(16,185,129,0.25)' : 'rgba(249,115,22,0.25)'}`,
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '0.82rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={16} color={pricingPerms.canModifyAll ? '#6366f1' : pricingPerms.isDesigner ? '#10b981' : '#f97316'} />
              <span>
                Logged-in Group: <strong>{pricingPerms.displayRoleName}</strong>
                {' — '}
                {pricingPerms.canModifyAll && 'You can modify all product specifications, cost prices, and sale prices freely.'}
                {pricingPerms.isDesigner && 'You enter both Cost Price and Sale Price when adding order products.'}
                {pricingPerms.isSalesperson && 'You enter Cost Price for custom items. Sale Price is assigned by the Furniture Designer.'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: pricingPerms.canEditCostPrice ? 'rgba(249,115,22,0.15)' : 'rgba(150,150,150,0.1)', color: pricingPerms.canEditCostPrice ? '#ea580c' : '#888', fontWeight: 700 }}>
                Cost Price: {pricingPerms.canEditCostPrice ? 'Editable' : 'Locked'}
              </span>
              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: pricingPerms.canEditSalePrice ? 'rgba(16,185,129,0.15)' : 'rgba(150,150,150,0.1)', color: pricingPerms.canEditSalePrice ? '#10b981' : '#888', fontWeight: 700 }}>
                Sale Price: {pricingPerms.canEditSalePrice ? 'Editable' : 'Pending Designer'}
              </span>
            </div>
          </div>

          <AnimatePresence>
            {duplicateNotice && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '10px', padding: '12px 14px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--accent-color)', fontSize: '0.88rem', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShoppingBag size={18} /> {duplicateNotice}
                </div>
                <button type="button" onClick={() => setDuplicateNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={16} />
                </button>
              </motion.div>
            )}
            {success && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '14px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontSize: '0.9rem', fontWeight: 600 }}>
                <CheckCircle size={20} /> Order created and confirmed! Order #{confirmedOrderNumber || autoOrderNumber} is now tracked in MAKE.
              </motion.div>
            )}
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '14px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontSize: '0.9rem', fontWeight: 600 }}>
                <AlertCircle size={20} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* ── 1. CUSTOMER & DELIVERY INFO ────────────────────────────── */}
            <div data-tutorial="make-place-order">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                <p style={{ ...sectionTitle, margin: 0, border: 'none', padding: 0 }}>
                  <User size={18} color="var(--accent-color)" /> Customer &amp; Delivery Logistics
                </p>
                {selectedCustomerId && selectedCustomerInfo && (
                  <div id="place-order-linked-customer-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '4px 10px', fontSize: '0.8rem', color: '#059669' }}>
                    <span style={{ fontWeight: 700 }}>✓ Linked Existing Customer:</span>
                    <span style={{ fontWeight: 600 }}>{selectedCustomerInfo.name}</span>
                    {selectedCustomerInfo.phone && <span style={{ opacity: 0.8 }}>({selectedCustomerInfo.phone})</span>}
                    <button type="button" onClick={handleUnlinkCustomer} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, padding: '2px 4px', textDecoration: 'underline' }}>
                      Change / Unlink
                    </button>
                  </div>
                )}
              </div>

              {/* Customer Intelligent Autocomplete Search Bar */}
              <div ref={customerDropdownContainerRef} style={{ position: 'relative', marginBottom: '1.25rem' }}>
                <label style={labelStyle}>
                  Intelligent Customer Autocomplete (Search by Name, Phone, Email, Company, ID)
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={15} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }} />
                  <input
                    ref={customerSearchInputRef}
                    id="place-order-customer-search-input"
                    placeholder="Search existing customers by name, phone, email, or company..."
                    value={customerSearchQuery}
                    onChange={e => {
                      setCustomerSearchQuery(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => {
                      if (customerSuggestions.length > 0) setShowCustomerDropdown(true);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightedCustomerIndex(prev => Math.min(prev + 1, customerSuggestions.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightedCustomerIndex(prev => Math.max(prev - 1, 0));
                      } else if (e.key === 'Enter') {
                        if (highlightedCustomerIndex >= 0 && customerSuggestions[highlightedCustomerIndex]) {
                          e.preventDefault();
                          handleSelectCustomer(customerSuggestions[highlightedCustomerIndex]);
                        }
                      } else if (e.key === 'Escape') {
                        setShowCustomerDropdown(false);
                      }
                    }}
                    style={{ ...inputStyle, paddingLeft: '36px', paddingRight: (customerSearchQuery || isSearchingCustomer) ? '36px' : '12px' }}
                  />
                  {isSearchingCustomer && (
                    <div style={{ position: 'absolute', right: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)', pointerEvents: 'none' }}>
                      Searching...
                    </div>
                  )}
                  {!isSearchingCustomer && customerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerSearchQuery('');
                        setShowCustomerDropdown(false);
                      }}
                      style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                      aria-label="Clear customer search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Dropdown Suggestions */}
                {showCustomerDropdown && customerSuggestions.length > 0 && (
                  <div id="place-order-customer-dropdown" className="make-customer-dropdown">
                    {customerSuggestions.map((cust, idx) => (
                      <div
                        key={cust.id}
                        className={`make-customer-dropdown-item ${highlightedCustomerIndex === idx ? 'highlighted' : ''}`}
                        onClick={() => handleSelectCustomer(cust)}
                        onMouseEnter={() => setHighlightedCustomerIndex(idx)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            {cust.name}
                          </span>
                          <span style={{ fontSize: '0.72rem', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            ID #{cust.id}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          {cust.company && <span>🏢 {cust.company}</span>}
                          {cust.phone && <span>📞 {cust.phone}</span>}
                          {cust.email && <span>✉️ {cust.email}</span>}
                          {cust.address && <span>📍 {cust.address}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Inputs Grid */}
              <div className="make-responsive-grid-2" style={{ gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Customer Name *</label>
                  <input
                    id="place-order-customer-name"
                    placeholder="e.g. Acme Corp / John Doe"
                    value={customerName}
                    onChange={e => {
                      setCustomerName(e.target.value);
                      if (!selectedCustomerId && e.target.value.length >= 2) {
                        setCustomerSearchQuery(e.target.value);
                      }
                    }}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Customer Phone (Optional)</label>
                  <input
                    id="place-order-customer-phone"
                    placeholder="e.g. +880 1700 000000"
                    value={customerPhone}
                    onChange={e => {
                      setCustomerPhone(e.target.value);
                      if (!selectedCustomerId && e.target.value.length >= 4) {
                        setCustomerSearchQuery(e.target.value);
                      }
                    }}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Customer Email</label>
                  <input
                    id="place-order-customer-email"
                    type="email"
                    placeholder="e.g. customer@example.com"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Receiver Name (If different from customer)</label>
                  <input
                    id="place-order-receiver-name"
                    placeholder="e.g. Site Manager / Receptionist"
                    value={receiverName}
                    onChange={e => setReceiverName(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div className="make-grid-span-2">
                  <label style={labelStyle}>Receiver Phone (If different from customer)</label>
                  <input
                    id="place-order-receiver-phone"
                    placeholder="e.g. +880 1800 000000"
                    value={receiverPhone}
                    onChange={e => setReceiverPhone(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div className="make-grid-span-2">
                  <label style={labelStyle}>Full Shipping / Delivery Address</label>
                  <textarea
                    id="place-order-shipping-address"
                    rows={2}
                    placeholder="House, Road, Area, City..."
                    value={shippingAddress}
                    onChange={e => setShippingAddress(e.target.value)}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
                <div className="make-grid-span-2">
                  <label style={labelStyle}>
                    <MapPin size={13} style={{ display: 'inline', marginRight: '4px' }} /> Location Landmark
                  </label>
                  <input
                    id="place-order-location-landmark"
                    placeholder="e.g. Near City Center Gate 3 / Behind Police Box"
                    value={locationLandmark}
                    onChange={e => setLocationLandmark(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* ── 2. PRODUCT CATALOG SELECTION (ITEM BUILDER) ────────────── */}
            <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.02))', padding: '20px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <p style={{ ...sectionTitle, margin: 0, border: 'none', padding: 0 }}>
                  <ShoppingBag size={18} color="var(--accent-color)" /> Add Products to Order
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button type="button" onClick={() => setIsCustomItemMode(!isCustomItemMode)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                    {isCustomItemMode ? '← Switch to Catalog Product Selector' : '+ Add Custom / Non-Catalog Item'}
                  </button>
                </div>
              </div>

              {!isCustomItemMode ? (
                /* Catalog Picker Mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Intelligent Whole-Catalog Product Search Bar */}
                  <div style={{ position: 'relative' }} data-tutorial="make-product-search">
                    <label style={labelStyle}>Intelligent Product Search (Name, Model, Dimensions, Colors, Specs, Materials...)</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={15} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }} />
                      <input
                        placeholder="Search anything... e.g. Executive Table, M-1025, 1200x600, Walnut, Black, Premium"
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: '36px', paddingRight: productSearch ? '32px' : '14px' }}
                      />
                      {productSearch && (
                        <button
                          type="button"
                          onClick={() => { setProductSearch(''); setSearchResults([]); }}
                          style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {(searchResults || []).length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: 'var(--card-bg)', border: '1px solid var(--border-color)',
                        borderRadius: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
                        marginTop: '4px', maxHeight: '340px', overflowY: 'auto'
                      }}>
                        {(searchResults || []).map((item: any) => {
                          const sizesText = (item.sizes || []).map((s: any) => formatSizeDisplay(s)).slice(0, 3).join(', ');
                          const colorsText = (item.colors || []).map((c: any) => c.color_name).slice(0, 3).join(', ');
                          const specsText = (item.specifications || []).map((sp: any) => sp.spec_name).slice(0, 3).join(', ');

                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                handleProductSelect(item.id, item);
                                setProductSearch('');
                                setSearchResults([]);
                              }}
                              style={{
                                padding: '12px 14px', borderBottom: '1px solid var(--border-color)',
                                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                                gap: '12px', transition: 'background 0.15s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{item.product_name}</strong>
                                  {item.product_code && <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600, background: 'rgba(100,116,139,0.1)', padding: '1px 6px', borderRadius: '4px' }}>[{item.product_code}]</span>}
                                  {item.category && <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#4f46e5', fontSize: '0.72rem', fontWeight: 600 }}>{item.category}</span>}
                                </div>

                                {/* Matched highlight badges */}
                                {Array.isArray(item.matchedReasons) && item.matchedReasons.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
                                    {item.matchedReasons.map((reason: string, rIdx: number) => (
                                      <span key={rIdx} className="make-search-badge" style={{ fontSize: '0.7rem' }}>
                                        {reason}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Available sizes, colors, specs */}
                                <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {sizesText && <div><strong style={{ color: 'var(--text-primary)' }}>Sizes:</strong> {sizesText}</div>}
                                  {colorsText && <div><strong style={{ color: 'var(--text-primary)' }}>Colors:</strong> {colorsText}</div>}
                                  {specsText && <div><strong style={{ color: 'var(--text-primary)' }}>Specifications:</strong> {specsText}</div>}
                                  {item.description && <div style={{ fontStyle: 'italic', marginTop: '2px' }}>{item.description}</div>}
                                </div>
                              </div>
                              <button
                                type="button"
                                style={{
                                  alignSelf: 'center', padding: '6px 14px', background: 'var(--accent-color)',
                                  color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem',
                                  fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0
                                }}
                              >
                                Select Product →
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="make-responsive-grid-2">
                    {/* 1. Product Selection */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <label style={{ ...labelStyle, margin: 0 }}>Select Catalog Product</label>
                        {canCreateProduct && (
                          <button
                            id="place-order-create-product-btn"
                            type="button"
                            onClick={() => setShowProductCreateModal(true)}
                            style={{
                              background: '#3b82f6',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '3px 10px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 2px 6px rgba(59,130,246,0.25)'
                            }}
                          >
                            <Plus size={12} /> Create New Product
                          </button>
                        )}
                      </div>
                      <select value={selectedProduct?.id || ''} onChange={e => handleProductSelect(Number(e.target.value))} style={inputStyle}>
                        <option value="">-- Choose Product --</option>
                        {(catalogProducts || []).map(p => {
                          const sizeBadge = p.size_label || (p.sizes?.[0] ? formatSizeDisplay(p.sizes[0]) : '');
                          return (
                            <option key={p.id} value={p.id}>
                              {p.product_code ? `[${p.product_code}] ` : ''}{p.product_name}{sizeBadge ? ` (${sizeBadge})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* 2. Specification Selection */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <label style={{ ...labelStyle, margin: 0 }}>Specification / Model</label>
                        <button 
                          type="button" 
                          onClick={() => {
                            const next = !isCustomSpec;
                            setIsCustomSpec(next);
                            if (next) setSelectedSpec(null);
                          }}
                          style={{ background: isCustomSpec ? 'rgba(99,102,241,0.1)' : 'rgba(249,115,22,0.1)', color: isCustomSpec ? '#4f46e5' : '#ea580c', border: `1px solid ${isCustomSpec ? 'rgba(99,102,241,0.3)' : 'rgba(249,115,22,0.3)'}`, borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Plus size={12} /> {isCustomSpec ? '← Standard Specs' : '+ Custom Spec'}
                        </button>
                      </div>

                      {!isCustomSpec ? (
                        <select 
                          value={selectedSpec?.id || ''} 
                          onChange={e => handleSpecSelect(Number(e.target.value))} 
                          disabled={!selectedProduct || (selectedProduct.specifications || []).length === 0}
                          style={{ ...inputStyle, opacity: !selectedProduct ? 0.6 : 1 }}>
                          <option value="">{selectedProduct.specifications?.length ? '-- Standard / Choose Specification --' : 'Not available'}</option>
                          {(selectedProduct?.specifications || []).map((s: any) => (
                            <option key={s.id} value={s.id}>{s.spec_code ? `[${s.spec_code}] ` : ''}{s.spec_name}</option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ background: 'rgba(249,115,22,0.04)', border: '1px dashed #f97316', borderRadius: '8px', padding: '8px 10px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ea580c', marginBottom: '4px' }}>
                            ✨ Custom Specification / Model
                          </div>
                          <input 
                            type="text" 
                            placeholder="e.g. 6-leg executive frame, cable tray, modesty panel"
                            value={customSpecName}
                            onChange={e => setCustomSpecName(e.target.value)}
                            style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.85rem' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Dimensions & Colors */}
                  {selectedProduct && (
                    <div className={isCustomSize ? '' : 'make-responsive-grid-2'} style={{ display: 'grid', gridTemplateColumns: isCustomSize ? '1fr' : undefined, gap: '1rem' }}>
                      {/* Dimensions / Sizes Section (Single Product Size) */}
                      {!isCustomSize ? (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                            <label style={{ ...labelStyle, margin: 0 }}>
                              <Maximize2 size={13} style={{ display: 'inline', marginRight: '4px' }} /> Assigned Product Size
                            </label>
                            <button 
                              type="button" 
                              onClick={() => { setIsCustomSize(true); setSelectedSize(null); }}
                              style={{ background: 'rgba(249,115,22,0.1)', color: '#ea580c', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Plus size={12} /> Custom Size
                            </button>
                          </div>
                          <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {getOrderSizeLabel(selectedSize, selectedProduct.size || selectedProduct.size_label)}
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                              1 Active Size
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: 'rgba(249,115,22,0.04)', border: '1px dashed #f97316', borderRadius: '10px', padding: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ea580c', textTransform: 'uppercase' }}>
                                ✨ Custom Dimensions for {selectedProduct.product_name}
                              </span>
                              <span style={{ background: '#ffedd5', color: '#c2410c', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                Customized Size
                              </span>
                            </div>
                            <button 
                              type="button" 
                              onClick={() => setIsCustomSize(false)}
                              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                              ← Use Standard Sizes
                            </button>
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', alignItems: 'flex-end' }}>
                            <div>
                              <label style={{ ...labelStyle, fontSize: '0.72rem' }}>Shape</label>
                              <select value={customShape} onChange={e => setCustomShape(e.target.value as any)} style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.82rem' }}>
                                <option value="rect">Rectangular</option>
                                <option value="round">Round (Ø)</option>
                              </select>
                            </div>

                            {customShape === 'rect' ? (
                              <>
                                <div>
                                  <label style={{ ...labelStyle, fontSize: '0.72rem' }}>Length (L)</label>
                                  <input placeholder="e.g. 1800" value={customLength} onChange={e => setCustomLength(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.82rem' }} />
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize: '0.72rem' }}>Width (W)</label>
                                  <input placeholder="e.g. 900" value={customWidth} onChange={e => setCustomWidth(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.82rem' }} />
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize: '0.72rem' }}>Height (H)</label>
                                  <input placeholder="e.g. 750" value={customHeight} onChange={e => setCustomHeight(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.82rem' }} />
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ gridColumn: 'span 2' }}>
                                  <label style={{ ...labelStyle, fontSize: '0.72rem' }}>Diameter (Ø)</label>
                                  <input placeholder="e.g. 1200" value={customDiameter} onChange={e => setCustomDiameter(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.82rem' }} />
                                </div>
                                <div>
                                  <label style={{ ...labelStyle, fontSize: '0.72rem' }}>Height (H)</label>
                                  <input placeholder="e.g. 750" value={customHeight} onChange={e => setCustomHeight(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.82rem' }} />
                                </div>
                              </>
                            )}

                            <div>
                              <label style={{ ...labelStyle, fontSize: '0.72rem' }}>Unit</label>
                              <select value={customUnit} onChange={e => setCustomUnit(e.target.value)} style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.82rem' }}>
                                <option value="mm">mm</option>
                                <option value="inch">inch</option>
                                <option value="cm">cm</option>
                                <option value="feet">ft</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Color / Finish */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <label style={{ ...labelStyle, margin: 0 }}>
                            <Palette size={13} style={{ display: 'inline', marginRight: '4px' }} /> Color &amp; Finish
                          </label>
                          <button 
                            type="button" 
                            onClick={() => {
                              const next = !isCustomColor;
                              setIsCustomColor(next);
                              if (next) setSelectedColor(null);
                            }}
                            style={{ background: isCustomColor ? 'rgba(99,102,241,0.1)' : 'rgba(249,115,22,0.1)', color: isCustomColor ? '#4f46e5' : '#ea580c', border: `1px solid ${isCustomColor ? 'rgba(99,102,241,0.3)' : 'rgba(249,115,22,0.3)'}`, borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Plus size={12} /> {isCustomColor ? '← Standard Colors' : '+ Custom Color'}
                          </button>
                        </div>

                        {!isCustomColor ? (
                          <div ref={colorDropdownContainerRef} style={{ position: 'relative' }} onKeyDown={e => {
                            if (e.key === 'Escape') {
                              setShowColorOptions(false);
                            }
                          }}>
                            <button
                              type="button"
                              aria-haspopup="listbox"
                              aria-expanded={showColorOptions}
                              onClick={() => setShowColorOptions(value => !value)}
                              onKeyDown={e => {
                                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                                  if (!showColorOptions) {
                                    e.preventDefault();
                                    setShowColorOptions(true);
                                  }
                                }
                              }}
                              style={{
                                ...inputStyle,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                minHeight: '42px'
                              }}
                            >
                              <span aria-hidden="true" style={{
                                width: '22px',
                                height: '22px',
                                flexShrink: 0,
                                borderRadius: '6px',
                                border: '1px solid rgba(15,23,42,0.28)',
                                background: getColorSwatchColor(selectedColor?.color_code),
                                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)'
                              }} />
                              <span style={{ flex: 1 }}>
                                {selectedColor
                                  ? (selectedColor.color_name || 'Selected color') + (selectedColor.color_code ? ' (' + selectedColor.color_code + ')' : '')
                                  : (selectedProduct.colors?.length || selectedSpec?.colors?.length ? '-- Standard / Default Color --' : 'Not available')}
                              </span>
                              <ChevronDown size={15} style={{ flexShrink: 0, opacity: 0.7 }} />
                            </button>
                            {showColorOptions && (
                              <div
                                role="listbox"
                                aria-label="Color and finish options"
                                style={{
                                  position: 'absolute',
                                  top: 'calc(100% + 4px)',
                                  left: 0,
                                  right: 0,
                                  zIndex: 50,
                                  maxHeight: '240px',
                                  overflowY: 'auto',
                                  padding: '5px',
                                  background: 'var(--card-bg, #fff)',
                                  border: '1px solid var(--border-color, #d1d5db)',
                                  borderRadius: '10px',
                                  boxShadow: '0 12px 28px rgba(0,0,0,0.16)'
                                }}
                              >
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={!selectedColor}
                                  onClick={() => { setSelectedColor(null); setShowColorOptions(false); }}
                                  style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px 10px',
                                    border: 'none',
                                    borderRadius: '7px',
                                    background: !selectedColor ? 'rgba(99,102,241,0.10)' : 'transparent',
                                    color: 'var(--text-primary)',
                                    textAlign: 'left',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span aria-hidden="true" style={{ width: '22px', height: '22px', flexShrink: 0, border: '1px solid var(--border-color)', borderRadius: '6px', background: 'linear-gradient(135deg, #fff 45%, #e5e7eb 45%, #e5e7eb 55%, #fff 55%)' }} />
                                  <span>{selectedProduct.colors?.length || selectedSpec?.colors?.length ? '-- Standard / Default Color --' : 'Not available'}</span>
                                </button>
                                {((selectedProduct.colors && selectedProduct.colors.length > 0) ? selectedProduct.colors : (selectedSpec?.colors || [])).map((cl: any) => (
                                  <button
                                    key={cl.id}
                                    type="button"
                                    role="option"
                                    aria-selected={String(selectedColor?.id) === String(cl.id)}
                                    onClick={() => { setSelectedColor(cl); setShowColorOptions(false); }}
                                    style={{
                                      width: '100%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      padding: '8px 10px',
                                      border: 'none',
                                      borderRadius: '7px',
                                      background: String(selectedColor?.id) === String(cl.id) ? 'rgba(99,102,241,0.10)' : 'transparent',
                                      color: 'var(--text-primary)',
                                      textAlign: 'left',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <span aria-hidden="true" style={{
                                      width: '22px',
                                      height: '22px',
                                      flexShrink: 0,
                                      borderRadius: '6px',
                                      border: '1px solid rgba(15,23,42,0.28)',
                                      background: getColorSwatchColor(cl.color_code),
                                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)'
                                    }} />
                                    <span style={{ flex: 1 }}>
                                      {cl.color_name || 'Color'} {cl.color_code ? '(' + cl.color_code + ')' : ''}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ background: 'rgba(249,115,22,0.04)', border: '1px dashed #f97316', borderRadius: '8px', padding: '8px 10px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ea580c', marginBottom: '4px' }}>
                              🎨 Custom Color (Enter Color Name)
                            </div>
                            <input 
                              type="text" 
                              placeholder="e.g. Royal Navy Blue / Smoked Walnut / Matte Gold"
                              value={customColorName}
                              onChange={e => setCustomColorName(e.target.value)}
                              style={{ ...inputStyle, padding: '8px 10px', fontSize: '0.85rem' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Clean, Normal Pricing Fields */}
                  <div className="make-responsive-grid-2" style={{ gap: '1rem' }}>
                    {/* Cost Price: Strictly Designer / Admin only */}
                    {pricingPerms.canViewCostPrice && (
                      <div>
                        <label style={labelStyle}>
                          <DollarSign size={13} style={{ display: 'inline', marginRight: '3px' }} /> Cost Price (BDT ৳) *
                        </label>
                        <input 
                          type="number" 
                          min={0} 
                          placeholder="e.g. 15000" 
                          value={itemCostPrice} 
                          onChange={e => setItemCostPrice(e.target.value)} 
                          disabled={!pricingPerms.canEditCostPrice}
                          style={{ ...inputStyle, opacity: !pricingPerms.canEditCostPrice ? 0.7 : 1 }} 
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px', display: 'block' }}>
                          {pricingPerms.canEditCostPrice ? 'Entered by Designer / Admin' : '🔒 Read-only'}
                        </span>
                      </div>
                    )}

                    {/* Sale Price: Designer, Admin */}
                    <div>
                      <label style={labelStyle}>
                        <Tag size={13} style={{ display: 'inline', marginRight: '3px' }} /> Sale Price (BDT ৳) {pricingPerms.canEditSalePrice ? '*' : '(Designer Only)'}
                      </label>
                      <input 
                        type="number" 
                        min={0} 
                        disabled={!pricingPerms.canEditSalePrice}
                        placeholder={pricingPerms.canEditSalePrice ? 'e.g. 22000' : '🔒 Set by Furniture Designer upon review'} 
                        value={itemSalePrice} 
                        onChange={e => setItemSalePrice(e.target.value)} 
                        style={{ ...inputStyle, opacity: !pricingPerms.canEditSalePrice ? 0.7 : 1 }} 
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px', display: 'block' }}>
                        {pricingPerms.canEditSalePrice ? 'Entered by Designer / Admin' : '🔒 Pending designer review'}
                      </span>
                    </div>
                  </div>

                  {/* Line Item Discount for Catalog Product */}
                  {pricingPerms.canViewSalePrice && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                        <label style={{ ...labelStyle, margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Tag size={13} /> Line Discount (Optional)
                        </label>
                        {selectedProduct?.max_discount_value !== undefined && selectedProduct?.max_discount_value !== null && (
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                            Max Limit: {selectedProduct.max_discount_value}{selectedProduct.max_discount_type === 'amount' ? '৳' : '%'}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                          value={itemDiscountType}
                          onChange={e => setItemDiscountType(e.target.value as 'percent' | 'amount')}
                          style={{
                            width: '135px',
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem',
                            fontWeight: 600
                          }}
                        >
                          <option value="percent">Percentage (%)</option>
                          <option value="amount">Fixed (৳)</option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          step={itemDiscountType === 'percent' ? '0.1' : '1'}
                          max={itemDiscountType === 'percent' ? '100' : undefined}
                          placeholder={itemDiscountType === 'percent' ? 'e.g. 5' : 'e.g. 1000'}
                          value={itemDiscountValue}
                          onChange={e => setItemDiscountValue(e.target.value)}
                          style={{ ...inputStyle, flex: 1, padding: '8px 12px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Per-Item Drawing / Image / PDF / CAD Attachment */}
                  <div style={{ background: 'var(--input-bg)', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ ...labelStyle, margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Paperclip size={13} /> Attach Invoice Attachment / Drawing (Optional)
                      </label>
                      {attachedFile && (
                        <button type="button" onClick={handleRemoveAttachedFile} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <X size={12} /> Remove
                        </button>
                      )}
                    </div>

                    {!attachedFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          <Paperclip size={14} /> Choose File (Image, PDF, CAD)
                          <input 
                            type="file" 
                            accept="image/*,application/pdf,.dwg,.dxf,.step,.stp,.iges,.igs,.skp,.stl,.obj" 
                            onChange={handleItemFileSelect} 
                            style={{ display: 'none' }} 
                          />
                        </label>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          Attach CAD files (.dwg, .dxf, .step), PDFs or photos for this item
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--card-bg)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        {attachedFile.type === 'image' && attachedFile.previewUrl ? (
                          <img src={attachedFile.previewUrl} alt="Preview" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px' }} />
                        ) : attachedFile.type === 'cad' ? (
                          <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: 'rgba(14,165,233,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                            <Box size={18} />
                          </div>
                        ) : (
                          <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                            <FileText size={18} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {attachedFile.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {attachedFile.type === 'cad' ? 'CAD Model / Technical Drawing' : (attachedFile.type === 'pdf' ? 'PDF Document' : 'Image Blueprint')} &bull; {itemFileProgress !== null && itemFileProgress < 100 ? `Uploading securely… ${itemFileProgress}%` : 'Uploaded and ready to attach'}
                          </div>
                          {itemFileProgress !== null && <div style={{ height: 5, background: 'var(--border-color)', borderRadius: 5, overflow: 'hidden', marginTop: 5 }}><div style={{ width: `${itemFileProgress}%`, height: '100%', background: 'var(--accent-color)', transition: 'width 0.2s' }} /></div>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quantity & Item Remarks */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                    <div style={{ minWidth: '100px', flex: '1 1 120px' }}>
                      <label style={labelStyle}>Quantity</label>
                      <input type="number" min={1} value={itemQuantity} onChange={e => setItemQuantity(Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div style={{ minWidth: '180px', flex: '2 1 200px' }}>
                      <label style={labelStyle}>Custom Item Remarks / Notes</label>
                      <input placeholder="e.g. Reinforced base, matte finish" value={itemRemarks} onChange={e => setItemRemarks(e.target.value)} style={inputStyle} />
                    </div>
                    <button type="button" onClick={handleAddItemToOrder} disabled={!selectedProduct}
                      style={{ padding: '10px 20px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: !selectedProduct ? 'not-allowed' : 'pointer', opacity: !selectedProduct ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' }}>
                      <Plus size={16} /> Add Item
                    </button>
                  </div>
                </div>
              ) : (
                /* Custom Item Input Mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>Custom Item Name *</label>
                      <input placeholder="e.g. Custom Executive Desk Frame" value={customItemName} onChange={e => setCustomItemName(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Size / Dimensions</label>
                      <input placeholder="e.g. 1800 x 900 x 750 mm" value={customItemSize} onChange={e => setCustomItemSize(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Specifications &amp; Model Details</label>
                      <input placeholder="e.g. Black Powdercoated MS Frame, Solid Oak Top" value={customItemSpec} onChange={e => setCustomItemSpec(e.target.value)} style={inputStyle} />
                    </div>
                  </div>

                  {/* Clean, Normal Pricing Fields for Custom Item */}
                  <div className={pricingPerms.canViewCostPrice ? "make-responsive-grid-2" : ""} style={{ gap: '1rem' }}>
                    {/* Cost Price */}
                    {pricingPerms.canViewCostPrice && (
                      <div>
                        <label style={labelStyle}>
                          <DollarSign size={13} style={{ display: 'inline', marginRight: '3px' }} /> Cost Price (BDT ৳) *
                        </label>
                        <input 
                          type="number" 
                          min={0} 
                          placeholder="e.g. 15000" 
                          value={itemCostPrice} 
                          onChange={e => setItemCostPrice(e.target.value)} 
                          disabled={!pricingPerms.canEditCostPrice}
                          style={{ ...inputStyle, opacity: !pricingPerms.canEditCostPrice ? 0.7 : 1 }} 
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px', display: 'block' }}>
                          {pricingPerms.canEditCostPrice ? 'Entered by Designer / Admin' : '🔒 Read-only'}
                        </span>
                      </div>
                    )}

                    {/* Sale Price */}
                    <div>
                      <label style={labelStyle}>
                        <Tag size={13} style={{ display: 'inline', marginRight: '3px' }} /> Sale Price (BDT ৳) {pricingPerms.canEditSalePrice || pricingPerms.isSalesperson ? '*' : '(Designer Only)'}
                      </label>
                      <input 
                        type="number"
                        min={0}
                        disabled={!pricingPerms.canEditSalePrice && !pricingPerms.isSalesperson}
                        placeholder={pricingPerms.canEditSalePrice || pricingPerms.isSalesperson ? 'e.g. 22000' : '🔒 Set by Furniture Designer upon review'}
                        value={itemSalePrice}
                        onChange={e => setItemSalePrice(e.target.value)}
                        style={{ ...inputStyle, opacity: (!pricingPerms.canEditSalePrice && !pricingPerms.isSalesperson) ? 0.7 : 1 }}
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px', display: 'block' }}>
                        {pricingPerms.canEditSalePrice || pricingPerms.isSalesperson ? 'Entered by Sales / Designer / Admin' : '🔒 Pending designer review'}
                      </span>
                    </div>
                  </div>

                  {/* Custom/non-catalog items cannot receive discounts (enforced server-side too) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(107,114,128,0.08)', padding: '8px 12px', borderRadius: '8px', border: '1px dashed var(--border-color)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <Lock size={13} /> Discounts are not available for custom / non-catalog items.
                  </div>

                  {/* Per-Item Drawing / Image / PDF / CAD Attachment for Custom Item */}
                  <div style={{ background: 'var(--input-bg)', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ ...labelStyle, margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Paperclip size={13} /> Attach Invoice Attachment / Drawing (Optional)
                      </label>
                      {attachedFile && (
                        <button type="button" onClick={handleRemoveAttachedFile} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <X size={12} /> Remove
                        </button>
                      )}
                    </div>

                    {!attachedFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          <Paperclip size={14} /> Choose File (Image, PDF, CAD)
                          <input 
                            type="file" 
                            accept="image/*,application/pdf,.dwg,.dxf,.step,.stp,.iges,.igs,.skp,.stl,.obj" 
                            onChange={handleItemFileSelect} 
                            style={{ display: 'none' }} 
                          />
                        </label>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          Attach CAD files (.dwg, .dxf, .step), PDFs or photos for this custom item
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--card-bg)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        {attachedFile.type === 'image' && attachedFile.previewUrl ? (
                          <img src={attachedFile.previewUrl} alt="Preview" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px' }} />
                        ) : attachedFile.type === 'cad' ? (
                          <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: 'rgba(14,165,233,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                            <Box size={18} />
                          </div>
                        ) : (
                          <div style={{ width: '36px', height: '36px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                            <FileText size={18} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {attachedFile.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {attachedFile.type === 'cad' ? 'CAD Model / Technical Drawing' : (attachedFile.type === 'pdf' ? 'PDF Document' : 'Image Blueprint')} &bull; {itemFileProgress !== null && itemFileProgress < 100 ? `Uploading securely… ${itemFileProgress}%` : 'Uploaded and ready to attach'}
                          </div>
                          {itemFileProgress !== null && <div style={{ height: 5, background: 'var(--border-color)', borderRadius: 5, overflow: 'hidden', marginTop: 5 }}><div style={{ width: `${itemFileProgress}%`, height: '100%', background: 'var(--accent-color)', transition: 'width 0.2s' }} /></div>}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                    <div style={{ minWidth: '100px', flex: '1 1 120px' }}>
                      <label style={labelStyle}>Quantity</label>
                      <input type="number" min={1} value={itemQuantity} onChange={e => setItemQuantity(Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div style={{ minWidth: '180px', flex: '2 1 200px' }}>
                      <label style={labelStyle}>Custom Item Remarks / Notes</label>
                      <input placeholder="e.g. Client requested 32mm top thickness" value={itemRemarks} onChange={e => setItemRemarks(e.target.value)} style={inputStyle} />
                    </div>
                    <button type="button" onClick={handleAddItemToOrder}
                      style={{ padding: '10px 20px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' }}>
                      <Plus size={16} /> Add Item
                    </button>
                  </div>
                </div>
              )}

              {/* Cart Items List Table */}
              {cartItems.length > 0 && (
                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Items Added to Order ({cartItems.length})
                  </h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', background: 'var(--card-bg)', borderRadius: '8px', overflow: 'hidden' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Product / Spec</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Dimensions</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Color</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Qty</th>
                          {pricingPerms.canViewCostPrice && (
                            <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>Cost Price (৳)</th>
                          )}
                          <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>Sale Price (৳)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Notes</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Attachment</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cartItems || []).map((item, idx) => (
                          <tr key={item._id || idx} style={{ borderBottom: '1px solid var(--border-color)', background: item.is_customized ? 'rgba(249,115,22,0.03)' : 'transparent' }}>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700 }}>{item.product_name}</span>
                                {item.is_customized && (
                                  <span style={{ padding: '2px 8px', borderRadius: '12px', background: 'rgba(249,115,22,0.15)', color: '#ea580c', border: '1px solid rgba(249,115,22,0.3)', fontSize: '0.72rem', fontWeight: 800 }}>
                                    ✨ Customized
                                  </span>
                                )}
                              </div>
                              {(item.spec_details || item.spec_name) ? (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  {item.spec_details || item.spec_name}
                                </div>
                              ) : <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Specification: Not available</div>}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ color: item.is_customized ? '#c2410c' : 'var(--text-secondary)', fontWeight: item.is_customized ? 700 : 400 }}>
                                {item.dimensions_text || item.custom_dimensions || 'Not available'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {item.color_name ? (
                                <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'var(--input-bg)', fontWeight: 600 }}>{item.color_name}</span>
                              ) : 'Not available'}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>{item.quantity}</td>
                            
                            {/* Cost Price */}
                            {pricingPerms.canViewCostPrice && (
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                                ৳{Number(item.item_cost_price || 0).toLocaleString()}
                              </td>
                            )}

                            {/* Sale Price */}
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                              {item.item_sale_price !== null && item.item_sale_price !== undefined && item.item_sale_price !== '' ? (
                                <div>
                                  <div style={{ textDecoration: item.discount_amount && Number(item.discount_amount) > 0 ? 'line-through' : 'none', color: item.discount_amount && Number(item.discount_amount) > 0 ? 'var(--text-secondary)' : 'inherit' }}>৳{Number(item.item_sale_price).toLocaleString()}</div>
                                  {item.discount_amount && Number(item.discount_amount) > 0 ? (
                                    <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
                                      -৳{Number(item.discount_amount).toLocaleString()} ({item.discount_type === 'percent' ? `${item.discount_value}%` : 'fixed'})
                                    </div>
                                  ) : null}
                                  {item.final_item_price !== null && item.final_item_price !== undefined && item.discount_amount && Number(item.discount_amount) > 0 ? (
                                    <div style={{ fontSize: '0.9rem', color: 'var(--accent-color)', fontWeight: 800 }}>
                                      Final: ৳{Number(item.final_item_price).toLocaleString()}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                  <Lock size={11} /> Pending Designer
                                </span>
                              )}
                            </td>

                            <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{item.notes || '—'}</td>
                            
                            {/* Attachment indicator */}
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {item.attachedFile ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(99,102,241,0.08)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                                  {item.attachedFile.type === 'cad' ? '📐' : (item.attachedFile.type === 'pdf' ? '📄' : '🖼️')} {item.attachedFile.name.length > 14 ? item.attachedFile.name.substring(0, 11) + '...' : item.attachedFile.name}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontStyle: 'italic' }}>—</span>
                              )}
                            </td>

                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button type="button" onClick={() => removeCartItem(item._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Order Discount & Financial Summary Card */}
                  <div style={{
                    marginTop: '1.25rem',
                    padding: '1.25rem',
                    borderRadius: '12px',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Tag size={18} color="var(--accent-color)" />
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Order Discount &amp; Pricing Summary
                        </h4>
                      </div>
                      {pricingSummary.hasAnyConfiguredLimit && (
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#059669',
                          border: '1px solid rgba(16, 185, 129, 0.25)'
                        }}>
                          Max Allowed Discount: {pricingSummary.totalAllowedDiscountPercent}% (৳{pricingSummary.totalAllowedDiscountAmount.toLocaleString()})
                        </span>
                      )}
                    </div>

                    <div className="make-responsive-grid-2" style={{ gap: '1.5rem', alignItems: 'start' }}>
                      {/* Left Column: Discount & Payment Configuration */}
                      <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          APPLY ORDER DISCOUNT
                        </label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <select
                            value={discountType}
                            onChange={e => setDiscountType(e.target.value as 'percent' | 'amount')}
                            style={{
                              width: '140px',
                              padding: '8px 10px',
                              background: 'var(--input-bg)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                              fontWeight: 600
                            }}
                          >
                            <option value="percent">Percentage (%)</option>
                            <option value="amount">Fixed (৳)</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            step={discountType === 'percent' ? '0.1' : '1'}
                            max={discountType === 'percent' ? '100' : undefined}
                            placeholder={discountType === 'percent' ? 'e.g. 10' : 'e.g. 5000'}
                            value={discountValue}
                            onChange={e => setDiscountValue(e.target.value)}
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              background: 'var(--input-bg)',
                              border: `1px solid ${pricingSummary.discountValidationError ? '#ef4444' : 'var(--border-color)'}`,
                              borderRadius: '8px',
                              color: 'var(--text-primary)',
                              fontSize: '0.85rem',
                              fontWeight: 600
                            }}
                          />
                        </div>

                        {/* Helpful validation feedback */}
                        {pricingSummary.discountValidationError ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '0.78rem', fontWeight: 600, marginTop: '6px' }}>
                            <AlertCircle size={14} />
                            <span>{pricingSummary.discountValidationError}</span>
                          </div>
                        ) : discountValue && Number(discountValue) > 0 ? (
                          <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, marginTop: '4px' }}>
                            ✓ Valid discount: reduces total by ৳{pricingSummary.discountAmount.toLocaleString()}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Enter an optional order discount (up to permitted product catalog limits).
                          </div>
                        )}

                        {/* Money Received (Initial Payment) */}
                        {pricingPerms.canEnterInitialPayment && (
                          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                              MONEY RECEIVED (INITIAL PAYMENT)
                            </label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>৳</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={moneyReceived}
                                onChange={e => setMoneyReceived(e.target.value)}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  background: 'var(--input-bg)',
                                  border: `1px solid ${pricingSummary.paymentValidationError ? '#ef4444' : 'var(--border-color)'}`,
                                  borderRadius: '8px',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.85rem',
                                  fontWeight: 600
                                }}
                              />
                            </div>
                            {pricingSummary.paymentValidationError ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '0.78rem', fontWeight: 600, marginTop: '6px' }}>
                                <AlertCircle size={14} />
                                <span>{pricingSummary.paymentValidationError}</span>
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                Initial payment received at order placement (not full order total). Remaining balance becomes Amount Due.
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Column: Financial Totals Breakdown */}
                      <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                            <span>Total Items / Qty:</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cartItems.length} lines ({pricingSummary.totalQty} units)</span>
                          </div>

                          {pricingPerms.canViewSalePrice && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                              <span>Subtotal (Catalog Sale Price):</span>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {pricingSummary.subtotal !== null ? `৳${pricingSummary.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Pending designer'}
                              </span>
                            </div>
                          )}

                          {pricingSummary.discountAmount > 0 && pricingPerms.canViewSalePrice && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                              <span>Discount Applied ({discountType === 'percent' ? `${discountValue}%` : 'Fixed'}):</span>
                              <span style={{ fontWeight: 700 }}>-৳{pricingSummary.discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          )}

                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            paddingTop: '8px',
                            borderTop: '1px dashed var(--border-color)',
                            fontSize: '1rem',
                            fontWeight: 800,
                            color: 'var(--text-primary)'
                          }}>
                            <span>Order Total:</span>
                            <span style={{ color: 'var(--accent-color)' }}>
                              {pricingSummary.finalSalePrice !== null
                                ? `৳${pricingSummary.finalSalePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : (pricingSummary.subtotal !== null ? `৳${pricingSummary.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Pending Designer')}
                            </span>
                          </div>

                          {/* Payment & Balance Status */}
                          {pricingPerms.canViewSalePrice && (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981', paddingTop: '6px', borderTop: '1px dashed var(--border-color)' }}>
                                <span>Money Received (Initial Payment):</span>
                                <span style={{ fontWeight: 700 }}>৳{pricingSummary.moneyReceivedNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', color: pricingSummary.amountDue > 0 ? '#ea580c' : '#10b981', fontWeight: 700 }}>
                                <span>Amount Due:</span>
                                <span>৳{pricingSummary.amountDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Payment Status:</span>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  fontSize: '0.72rem',
                                  background: pricingSummary.paymentStatus === 'paid' ? 'rgba(16, 185, 129, 0.15)' : (pricingSummary.paymentStatus === 'partial' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                                  color: pricingSummary.paymentStatus === 'paid' ? '#059669' : (pricingSummary.paymentStatus === 'partial' ? '#d97706' : '#dc2626'),
                                  border: `1px solid ${pricingSummary.paymentStatus === 'paid' ? 'rgba(16, 185, 129, 0.3)' : (pricingSummary.paymentStatus === 'partial' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)')}`
                                }}>
                                  {pricingSummary.paymentStatus.toUpperCase()}
                                </span>
                              </div>
                            </>
                          )}

                          {/* Internal Cost Breakdown - Strictly guarded */}
                          {pricingPerms.canViewCostPrice && (
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              paddingTop: '6px',
                              borderTop: '1px solid var(--border-color)',
                              fontSize: '0.78rem',
                              color: 'var(--text-secondary)'
                            }}>
                              <span>Total Estimated Cost:</span>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                ৳{pricingSummary.totalCostPrice.toLocaleString()}
                              </span>
                            </div>
                          )}

                          {pricingPerms.canViewCostPrice && pricingSummary.marginAmount !== null && (
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              color: pricingSummary.marginAmount >= 0 ? '#10b981' : '#ef4444'
                            }}>
                              <span>Estimated Margin:</span>
                              <span>
                                {pricingSummary.marginAmount >= 0 ? '+' : ''}৳{pricingSummary.marginAmount.toLocaleString()}
                                {pricingSummary.finalSalePrice && pricingSummary.finalSalePrice > 0
                                  ? ` (${((pricingSummary.marginAmount / pricingSummary.finalSalePrice) * 100).toFixed(1)}%)`
                                  : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Amber Production Hold Warning Banner */}
                    {pricingSummary.productionHold && (
                      <div style={{
                        marginTop: '1rem',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px'
                      }}>
                        <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ fontSize: '0.82rem', color: '#b45309', lineHeight: 1.45 }}>
                          <strong>Production Hold Active:</strong> Outstanding balance of ৳{pricingSummary.amountDue.toLocaleString()} remains unpaid. This order will automatically enter <em>Production Hold</em> status upon placement and cannot proceed through factory stages until full payment is collected or an Admin explicitly approves production release.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── 3. ORDER METADATA & APPROVAL ASSIGNMENT ──────────────────── */}
            <div>
              <p style={sectionTitle}><Tag size={18} color="var(--accent-color)" /> Order Logistics &amp; Assignment</p>
              <div className="make-responsive-grid-4" style={{ gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Requested Delivery (Working Days)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 10"
                    value={requestedDeliveryDays}
                    onChange={e => setRequestedDeliveryDays(e.target.value)}
                    style={inputStyle}
                  />
                  <div style={{ marginTop: '4px', fontSize: '0.72rem', minHeight: '18px' }}>
                    {requestedDeliveryCalc.error ? (
                      <span style={{ color: '#ef4444' }}>{requestedDeliveryCalc.error}</span>
                    ) : requestedDeliveryCalc.dateStr ? (
                      <span style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        📅 <strong>{requestedDeliveryCalc.formattedDisplay}</strong>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Optional client request</span>
                    )}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Target Delivery (Working Days) *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 15"
                    value={targetDeliveryDays}
                    onChange={e => setTargetDeliveryDays(e.target.value)}
                    required
                    style={inputStyle}
                  />
                  <div style={{ marginTop: '4px', fontSize: '0.72rem', minHeight: '18px' }}>
                    {targetDeliveryCalc.error ? (
                      <span style={{ color: '#ef4444' }}>{targetDeliveryCalc.error}</span>
                    ) : targetDeliveryCalc.dateStr ? (
                      <span style={{ color: 'var(--accent-color)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        📅 <strong>{targetDeliveryCalc.formattedDisplay}</strong>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Mandatory factory deadline</span>
                    )}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{isAdminOrManager ? 'Assign Salesperson (Admin Override)' : 'Salesperson'}</label>
                  {isAdminOrManager ? (
                    <select value={selectedSalesmanId} onChange={e => setSelectedSalesmanId(e.target.value)} style={inputStyle}>
                      <option value="">No Specific Salesman (Direct)</option>
                      {(salesmen || []).map(s => (
                        <option key={s.id} value={s.id}>{s.full_name} ({s.username})</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                      <User size={14} /> {currentUser.full_name || currentUser.username || 'Current user'}
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>From your session</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 4. INVOICE ATTACHMENTS ─────────────────────────────────── */}
            <div data-tutorial="make-invoice-attachments">
              <p style={sectionTitle}><FileText size={18} color="var(--accent-color)" /> Invoice Attachments &amp; Documents</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <button type="button" onClick={handlePickDesktopInvoice} disabled={uploadingInvoice} aria-busy={uploadingInvoice}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--input-bg)', border: '1px dashed var(--border-color)', borderRadius: '8px', cursor: uploadingInvoice ? 'not-allowed' : 'pointer', opacity: uploadingInvoice ? 0.65 : 1, color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>
                  {uploadingInvoice
                    ? <><RefreshCw size={16} className="upload-spinner" /> Uploading…</>
                    : <><Paperclip size={16} /> Choose Invoice Image (Desktop File)</>}
                </button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--input-bg)', border: '1px dashed var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>
                  <Paperclip size={16} /> {uploadingInvoice ? 'Uploading in background · Attach more' : 'Attach Document / PDF'}
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,image/*"
                    onChange={handleUploadFileAttachment}
                    style={{ display: 'none' }}
                  />
                </label>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Accepts JPG, JPEG, PNG, WEBP (Max 15 MB) &amp; PDF
                </span>
              </div>

              {Object.entries(invoiceUploadProgress).map(([key, progress]) => <div key={key} style={{ marginTop: 8, padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{key.split('-').slice(0, -2).join('-')} · {progress >= 100 ? 'Saved' : 'Saving securely'}</span><strong>{progress}%</strong></div>
                <div style={{ height: 4, marginTop: 5, background: 'var(--border-color)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-color)', transition: 'width .2s' }} /></div>
              </div>)}

              {invoiceAttachments.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {invoiceAttachments.map((att, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px' }}>
                      <FileText size={15} color="var(--accent-color)" />
                      <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{att.name}</span>
                      {att.isPending && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.15)', color: '#d97706', fontWeight: 600 }}>
                          PENDING UPLOAD
                        </span>
                      )}
                      <button type="button" onClick={() => setInvoiceAttachments(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── SUBMIT & ACTION BUTTONS ──────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSaveAsDraft}
                disabled={loading || uploadingInvoice}
                style={{ padding: '16px 20px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: '12px', color: '#059669', fontWeight: 700, fontSize: '0.95rem', cursor: loading || uploadingInvoice ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: loading || uploadingInvoice ? 0.65 : 1 }}
              >
                <Save size={18} /> {activeSavedDraftId ? 'Update Saved Draft' : 'Save as Draft'}
              </button>
              <button
                type="button"
                onClick={handleClearDraft}
                style={{
                  padding: '16px 22px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Trash2 size={18} /> Clear Draft
              </button>
              <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                style={{ flex: 1, padding: '16px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '1.05rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, boxShadow: '0 8px 24px rgba(249,115,22,0.3)' }}>
                {loading ? 'Submitting Order...' : `Submit Order (${cartItems.length} Products)`}
              </motion.button>
            </div>
          </form>

        </motion.div></>}

          {/* Individually saved drafts are separate from the auto-restored working copy above. */}
          <section style={{
            marginTop: '20px',
            padding: '18px',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            background: 'var(--card-bg, #fff)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 800 }}>Saved Order Drafts</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Drafts are saved on this workstation for the current user. Successfully placed drafts are removed automatically.
                </p>
              </div>
              <span style={{ padding: '4px 10px', borderRadius: '20px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-color)', fontSize: '0.78rem', fontWeight: 800 }}>
                {savedDrafts.length} saved
              </span>
            </div>
            <input aria-label="Search order drafts" value={savedDraftSearch} onChange={e => setSavedDraftSearch(e.target.value)} placeholder="Search drafts by title, customer, or product…" style={{ width: '100%', margin: '0 0 12px', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--input-bg)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            {visibleSavedDrafts.length === 0 ? (
              <div style={{ padding: '22px 12px', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: '10px', fontSize: '0.88rem' }}>
                {savedDrafts.length ? 'No drafts match this search.' : 'No saved drafts yet. Fill in an order and select “Save as Draft”.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--input-bg, #f8fafc)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Draft</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Customer</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'center' }}>Items</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Last Saved</th>
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSavedDrafts.map(savedDraft => {
                      const itemCount = Array.isArray(savedDraft.data.cartItems)
                        ? savedDraft.data.cartItems.length
                        : (savedDraft.data.selectedProduct ? 1 : 0);
                      const customer = savedDraft.data.customerName
                        || savedDraft.data.selectedCustomerInfo?.name
                        || '—';
                      return (
                        <tr key={savedDraft.id} style={{ borderBottom: '1px solid var(--border-color)', background: activeSavedDraftId === savedDraft.id ? 'rgba(99,102,241,0.05)' : 'transparent' }}>
                          <td style={{ padding: '11px 12px', color: 'var(--text-primary)', fontWeight: 700 }}>
                            {savedDraft.title}
                            <div style={{ marginTop: '3px', fontSize: '0.74rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
                              {savedDraft.data.targetDeliveryDate
                                ? `Target: ${savedDraft.data.targetDeliveryDate}${savedDraft.data.targetDeliveryDays ? ` (${savedDraft.data.targetDeliveryDays} working days)` : ''}`
                                : 'Target date not set'}
                            </div>
                          </td>
                          <td style={{ padding: '11px 12px', color: 'var(--text-primary)' }}>{customer}</td>
                          <td style={{ padding: '11px 12px', textAlign: 'center', color: 'var(--text-primary)' }}>{itemCount}</td>
                          <td style={{ padding: '11px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{new Date(savedDraft.updatedAt).toLocaleString()}</td>
                          <td style={{ padding: '11px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => handleLoadSavedDraft(savedDraft)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 9px', marginRight: '6px', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'var(--card-bg, #fff)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 700 }}
                            >
                              <FolderOpen size={14} /> Load
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateSavedDraft(savedDraft)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 9px', marginRight: '6px', borderRadius: '7px', border: '1px solid var(--border-color)', background: 'var(--card-bg, #fff)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 700 }}
                              title="Duplicate draft"
                            >
                              <Copy size={14} /> Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSavedDraft(savedDraft)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 9px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
      </div>

      {showProductCreateModal && (
        <ProductCreateModal
          isOpen={showProductCreateModal}
          onClose={() => setShowProductCreateModal(false)}
          onSuccess={handleProductCreated}
        />
      )}
    </DashboardLayout>
  );
};

export default PlaceOrder;
