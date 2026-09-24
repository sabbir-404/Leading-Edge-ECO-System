import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, AlertCircle, CheckCircle, Paperclip, X, FileText, 
  Trash2, MapPin, User, ShoppingBag, 
  Palette, Maximize2, Tag, Shield, DollarSign, Lock, Box, Search
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { 
  getUserPricingPermissions 
} from '../../utils/permissions';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

interface CartItem {
  _id: string;
  product_id?: number;
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
  notes?: string;
  attachedFile?: {
    name: string;
    path?: string;
    base64?: string;
    url?: string;
    type: string;
    previewUrl?: string;
  } | null;
}

const PlaceOrder: React.FC = () => {
  const pricingPerms = getUserPricingPermissions();

  // Order Header state
  const [priority, setPriority] = useState('Normal');
  const [targetDeliveryDate, setTargetDeliveryDate] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [salesmen, setSalesmen] = useState<any[]>([]);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState<string>('');
  
  // Customer & Delivery info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [locationLandmark, setLocationLandmark] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Catalog data for item picker
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [selectedSpec, setSelectedSpec] = useState<any | null>(null);
  const [selectedSize, setSelectedSize] = useState<any | null>(null);
  const [selectedColor, setSelectedColor] = useState<any | null>(null);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemCostPrice, setItemCostPrice] = useState<number | string>('');
  const [itemSalePrice, setItemSalePrice] = useState<number | string>('');
  const [itemRemarks, setItemRemarks] = useState<string>('');

  // Per-item Invoice Attachment / CAD Drawing
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    base64?: string;
    url?: string;
    type: string;
    previewUrl?: string;
  } | null>(null);

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

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] || (reader.result as string);
      setAttachedFile({
        name: file.name,
        base64: base64,
        type: isCad ? 'cad' : (isPdf ? 'pdf' : (isImage ? 'image' : 'document')),
        previewUrl
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachedFile = () => {
    if (attachedFile?.previewUrl) {
      URL.revokeObjectURL(attachedFile.previewUrl);
    }
    setAttachedFile(null);
  };

  // Custom Size toggle & state for catalog products
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [customShape, setCustomShape] = useState<'rect' | 'round'>('rect');
  const [customLength, setCustomLength] = useState('');
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [customDiameter, setCustomDiameter] = useState('');
  const [customUnit, setCustomUnit] = useState('mm');

  // Custom Specification toggle & state for catalog products
  const [isCustomSpec, setIsCustomSpec] = useState(false);
  const [customSpecName, setCustomSpecName] = useState('');

  // Custom Color toggle & state for catalog products
  const [isCustomColor, setIsCustomColor] = useState(false);
  const [customColorName, setCustomColorName] = useState('');

  // Manual/Custom non-catalog item fallback mode
  const [isCustomItemMode, setIsCustomItemMode] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemSpec, setCustomItemSpec] = useState('');

  // Multi-item Cart
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Search state
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Invoice Attachments
  const [invoiceAttachments, setInvoiceAttachments] = useState<{ name: string; url: string }[]>([]);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  // Submission & Feedback
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');


  const designerName = localStorage.getItem('user_name') || 'Unknown';

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
  }, []);

  // Debounced product search
  useEffect(() => {
    if (!productSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        if (window.electron?.makeSearchProducts) {
          const res = await window.electron.makeSearchProducts({ query: productSearch, activeOnly: true });
          setSearchResults(Array.isArray(res) ? res : []);
        } else {
          const lower = productSearch.toLowerCase();
          const filtered = (catalogProducts || []).filter(p =>
            p.product_name?.toLowerCase().includes(lower) ||
            p.product_code?.toLowerCase().includes(lower) ||
            p.description?.toLowerCase().includes(lower) ||
            p.category?.toLowerCase().includes(lower)
          );
          setSearchResults(Array.isArray(filtered) ? filtered : []);
        }
      } catch (err) {
        console.error('Search products failed:', err);
        setSearchResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch, catalogProducts]);

  const handlePickDesktopInvoice = async () => {
    setUploadingInvoice(true);
    try {
      if (window.electron?.makePickAndUploadInvoiceAttachment) {
        const res = await window.electron.makePickAndUploadInvoiceAttachment();
        if (res && res.success && res.publicUrl) {
          setInvoiceAttachments(prev => [...prev, { name: res.fileName || 'Invoice Image', url: res.publicUrl }]);
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

  const handleMobileInvoiceCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds the 15 MB limit.');
      return;
    }

    setUploadingInvoice(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        if (window.electron?.makeUploadInvoiceAttachmentBuffer) {
          const res = await window.electron.makeUploadInvoiceAttachmentBuffer({
            fileName: file.name,
            fileBase64: base64
          });
          if (res && res.success && res.publicUrl) {
            setInvoiceAttachments(prev => [...prev, { name: file.name, url: res.publicUrl }]);
          } else if (res && res.error) {
            alert('Upload failed: ' + res.error);
          }
        } else {
          setInvoiceAttachments(prev => [...prev, { name: file.name, url: base64 }]);
        }
        setUploadingInvoice(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      alert('Error uploading invoice image: ' + (err.message || 'Unknown error'));
      setUploadingInvoice(false);
    }
  };

  const handleProductSelect = (productId: number, directProd?: any) => {
    const prod = directProd || searchResults.find(p => p.id === productId) || catalogProducts.find(p => p.id === productId) || null;
    setSelectedProduct(prod);
    setSelectedSpec(null);
    setSelectedSize(null);
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
      setItemCostPrice(pricingPerms.canViewCostPrice ? (prod.purchase_price || '') : '');
      setItemSalePrice(prod.selling_price || prod.mrp || '');
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

    if (isCustomItemMode) {
      if (!customItemName.trim()) {
        alert('Custom item name is required.');
        return;
      }
      const newItem: CartItem = {
        _id: String(Date.now()),
        product_name: customItemName.trim(),
        spec_details: customItemSpec.trim(),
        dimensions_text: customItemSpec.trim(),
        is_customized: true,
        custom_dimensions: customItemSpec.trim(),
        quantity: itemQuantity > 0 ? itemQuantity : 1,
        item_cost_price: costP,
        item_sale_price: saleP,
        notes: itemRemarks,
        attachedFile: attachedFile ? { ...attachedFile } : null
      };
      setCartItems(prev => [...prev, newItem]);
      setCustomItemName('');
      setCustomItemSpec('');
      setItemRemarks('');
      setItemQuantity(1);
      setItemCostPrice('');
      setItemSalePrice('');
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
        quantity: itemQuantity > 0 ? itemQuantity : 1,
        item_cost_price: costP,
        item_sale_price: saleP,
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
      setAttachedFile(null);
    }
  };

  const removeCartItem = (id: string) => {
    setCartItems(prev => prev.filter(i => i._id !== id));
  };

  // ── Document & Invoice Upload ────────────────────────────────────────────
  const handleUploadFileAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds the 15 MB limit.');
      return;
    }

    setUploadingInvoice(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        if (window.electron?.makeUploadInvoiceAttachmentBuffer) {
          const res = await window.electron.makeUploadInvoiceAttachmentBuffer({
            fileName: file.name,
            fileBase64: base64
          });
          if (res && res.success && res.publicUrl) {
            setInvoiceAttachments(prev => [...prev, { name: file.name, url: res.publicUrl }]);
          } else if (res && res.error) {
            alert('Upload failed: ' + res.error);
          }
        } else {
          setInvoiceAttachments(prev => [...prev, { name: file.name, url: base64 }]);
        }
        setUploadingInvoice(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error(err);
      alert('Error uploading document: ' + (err.message || 'Unknown error'));
      setUploadingInvoice(false);
    }
  };

  // ── Submit Order ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) {
      setError('Please add at least one product item to the order.');
      return;
    }

    if (!targetDeliveryDate) {
      setError('Target Delivery Date is mandatory. Please select a target delivery date.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const totalQty = cartItems.reduce((acc, i) => acc + i.quantity, 0);
      const totalCostPrice = pricingPerms.canViewCostPrice 
        ? cartItems.reduce((acc, i) => acc + (Number(i.item_cost_price) || 0) * i.quantity, 0)
        : 0;
      const hasAnySalePrice = cartItems.some(i => i.item_sale_price !== null && i.item_sale_price !== undefined && i.item_sale_price !== '');
      const totalSalePrice = hasAnySalePrice 
        ? cartItems.reduce((acc, i) => acc + (Number(i.item_sale_price) || 0) * i.quantity, 0)
        : null;

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
        salesman_id: selectedSalesmanId ? parseInt(selectedSalesmanId) : null,
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
        invoice_attachments: invoiceAttachments.map(a => a.url),
        items: cartItems.map(i => ({
          product_id: i.product_id || null,
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
          is_customized: !!i.is_customized,
          custom_dimensions: i.custom_dimensions || (i.is_customized ? i.dimensions_text : null),
          designer_notes: i.notes || null
        }))
      });

      const orderId = order?.id;
      const createdItems = order?.items || [];

      // Upload per-item drawings / attachments if attached via base64 buffer
      if (orderId && Array.isArray(createdItems)) {
        for (let idx = 0; idx < cartItems.length; idx++) {
          const item = cartItems[idx];
          if (item.attachedFile && item.attachedFile.base64) {
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

      setSuccess(true);
      setCartItems([]);
      setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setShippingAddress('');
      setLocationLandmark(''); setReceiverName(''); setReceiverPhone(''); setSpecialInstructions('');
      setTargetDeliveryDate(''); setRequestedDeliveryDate('');
      setInvoiceAttachments([]);
      setAttachedFile(null);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err: any) {
      console.error(err);
      setError('Failed to place order: ' + (err?.message || 'Database error'));
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

  return (
    <DashboardLayout title="Place Customized Furniture Order">
      <div style={{ maxWidth: '1000px', margin: '1.5rem auto', padding: '0 1.5rem' }}>
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <Plus size={24} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>New Production Order</h2>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Connected to NAS PostgreSQL Database • Active User: <strong>{designerName}</strong></p>
              </div>
            </div>
            <div style={{ padding: '6px 14px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-color)', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>
              {cartItems.length} Item(s) in Order
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
            {success && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '14px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontSize: '0.9rem', fontWeight: 600 }}>
                <CheckCircle size={20} /> Order created successfully! It is now tracked in MAKE.
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
              <p style={sectionTitle}><User size={18} color="var(--accent-color)" /> Customer &amp; Delivery Logistics</p>
              <div className="make-responsive-grid-2" style={{ gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Customer Name *</label>
                  <input placeholder="e.g. Acme Corp / John Doe" value={customerName} onChange={e => setCustomerName(e.target.value)} required style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Customer Phone (Optional)</label>
                  <input placeholder="e.g. +880 1700 000000" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Customer Email</label>
                  <input type="email" placeholder="e.g. customer@example.com" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Receiver Name (If different from customer)</label>
                  <input placeholder="e.g. Site Manager / Receptionist" value={receiverName} onChange={e => setReceiverName(e.target.value)} style={inputStyle} />
                </div>
                <div className="make-grid-span-2">
                  <label style={labelStyle}>Receiver Phone (If different from customer)</label>
                  <input placeholder="e.g. +880 1800 000000" value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} style={inputStyle} />
                </div>
                <div className="make-grid-span-2">
                  <label style={labelStyle}>Full Shipping / Delivery Address</label>
                  <textarea rows={2} placeholder="House, Road, Area, City..." value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div className="make-grid-span-2">
                  <label style={labelStyle}>
                    <MapPin size={13} style={{ display: 'inline', marginRight: '4px' }} /> Location Landmark
                  </label>
                  <input placeholder="e.g. Near City Center Gate 3 / Behind Police Box" value={locationLandmark} onChange={e => setLocationLandmark(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* ── 2. PRODUCT CATALOG SELECTION (ITEM BUILDER) ────────────── */}
            <div style={{ background: 'var(--bg-secondary, rgba(0,0,0,0.02))', padding: '20px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <p style={{ ...sectionTitle, margin: 0, border: 'none', padding: 0 }}>
                  <ShoppingBag size={18} color="var(--accent-color)" /> Add Products to Order
                </p>
                <button type="button" onClick={() => setIsCustomItemMode(!isCustomItemMode)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                  {isCustomItemMode ? '← Switch to Catalog Product Selector' : '+ Add Custom / Non-Catalog Item'}
                </button>
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
                          const sizesText = (item.sizes || []).map((s: any) => s.size_label || (s.diameter ? `Ø ${s.diameter}x${s.height}` : `${s.length}x${s.width}${s.height ? `x${s.height}` : ''} ${s.unit || 'mm'}`)).slice(0, 3).join(', ');
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
                      <label style={labelStyle}>Select Catalog Product</label>
                      <select value={selectedProduct?.id || ''} onChange={e => handleProductSelect(Number(e.target.value))} style={inputStyle}>
                        <option value="">-- Choose Product --</option>
                        {(catalogProducts || []).map(p => (
                          <option key={p.id} value={p.id}>{p.product_code ? `[${p.product_code}] ` : ''}{p.product_name}</option>
                        ))}
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
                          <option value="">-- Standard / Choose Specification --</option>
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
                    <div style={{ display: 'grid', gridTemplateColumns: isCustomSize ? '1fr' : '1.5fr 1.5fr', gap: '1rem' }}>
                      {/* Dimensions / Sizes Section */}
                      {!isCustomSize ? (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                            <label style={{ ...labelStyle, margin: 0 }}>
                              <Maximize2 size={13} style={{ display: 'inline', marginRight: '4px' }} /> Size / Dimensions
                            </label>
                            <button 
                              type="button" 
                              onClick={() => { setIsCustomSize(true); setSelectedSize(null); }}
                              style={{ background: 'rgba(249,115,22,0.1)', color: '#ea580c', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '6px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Plus size={12} /> Custom Size
                            </button>
                          </div>
                          <select
                            value={selectedSize?.id || ''}
                            onChange={e => {
                              const availableSizes = (selectedProduct.sizes && selectedProduct.sizes.length > 0) ? selectedProduct.sizes : (selectedSpec?.sizes || []);
                              const sz = availableSizes.find((s: any) => s.id === Number(e.target.value)) || null;
                              setSelectedSize(sz);
                            }}
                            style={inputStyle}>
                            <option value="">-- Standard / Default Size --</option>
                            {((selectedProduct.sizes && selectedProduct.sizes.length > 0) ? selectedProduct.sizes : (selectedSpec?.sizes || [])).map((sz: any) => {
                              const label = sz.size_label 
                                ? `${sz.size_label} (${sz.diameter ? `Ø ${sz.diameter} ${sz.unit || 'mm'}` : `${sz.length}x${sz.width}x${sz.height} ${sz.unit || 'mm'}`})`
                                : (sz.diameter 
                                  ? `Ø ${sz.diameter} x ${sz.height || '—'} ${sz.unit || 'mm'} (Round)` 
                                  : `${sz.length || '—'} x ${sz.width || '—'} x ${sz.height || '—'} ${sz.unit || 'mm'}`);
                              return <option key={sz.id} value={sz.id}>{label}</option>;
                            })}
                          </select>
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
                          
                          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr 80px', gap: '8px', alignItems: 'flex-end' }}>
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
                          <select
                            value={selectedColor?.id || ''}
                            onChange={e => {
                              const availableColors = (selectedProduct.colors && selectedProduct.colors.length > 0) ? selectedProduct.colors : (selectedSpec?.colors || []);
                              const cl = availableColors.find((c: any) => c.id === Number(e.target.value)) || null;
                              setSelectedColor(cl);
                            }}
                            style={inputStyle}>
                            <option value="">-- Standard / Default Color --</option>
                            {((selectedProduct.colors && selectedProduct.colors.length > 0) ? selectedProduct.colors : (selectedSpec?.colors || [])).map((cl: any) => (
                              <option key={cl.id} value={cl.id}>{cl.color_name} {cl.color_code ? `(${cl.color_code})` : ''}</option>
                            ))}
                          </select>
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
                  <div style={{ display: 'grid', gridTemplateColumns: pricingPerms.canViewCostPrice ? '1fr 1fr' : '1fr', gap: '1rem' }}>
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
                            {attachedFile.type === 'cad' ? 'CAD Model / Technical Drawing' : (attachedFile.type === 'pdf' ? 'PDF Document' : 'Image Blueprint')} &bull; Ready to attach
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quantity & Item Remarks */}
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label style={labelStyle}>Quantity</label>
                      <input type="number" min={1} value={itemQuantity} onChange={e => setItemQuantity(Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Custom Item Remarks / Notes</label>
                      <input placeholder="e.g. Reinforced base, matte finish" value={itemRemarks} onChange={e => setItemRemarks(e.target.value)} style={inputStyle} />
                    </div>
                    <button type="button" onClick={handleAddItemToOrder} disabled={!selectedProduct}
                      style={{ padding: '10px 20px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: !selectedProduct ? 'not-allowed' : 'pointer', opacity: !selectedProduct ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Plus size={16} /> Add Item
                    </button>
                  </div>
                </div>
              ) : (
                /* Custom Item Input Mode */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="make-responsive-grid-2" style={{ gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>Custom Item Name *</label>
                      <input placeholder="e.g. Custom Executive Desk Frame" value={customItemName} onChange={e => setCustomItemName(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Specifications &amp; Dimensions</label>
                      <input placeholder="e.g. 1800x900x750mm, Black Powdercoated" value={customItemSpec} onChange={e => setCustomItemSpec(e.target.value)} style={inputStyle} />
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
                            {attachedFile.type === 'cad' ? 'CAD Model / Technical Drawing' : (attachedFile.type === 'pdf' ? 'PDF Document' : 'Image Blueprint')} &bull; Ready to attach
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '1rem', alignItems: 'flex-end' }}>
                    <div>
                      <label style={labelStyle}>Quantity</label>
                      <input type="number" min={1} value={itemQuantity} onChange={e => setItemQuantity(Number(e.target.value))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Custom Item Remarks / Notes</label>
                      <input placeholder="e.g. Client requested 32mm top thickness" value={itemRemarks} onChange={e => setItemRemarks(e.target.value)} style={inputStyle} />
                    </div>
                    <button type="button" onClick={handleAddItemToOrder}
                      style={{ padding: '10px 20px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                              {item.spec_name && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.spec_name}</div>}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ color: item.is_customized ? '#c2410c' : 'var(--text-secondary)', fontWeight: item.is_customized ? 700 : 400 }}>
                                {item.dimensions_text || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {item.color_name ? (
                                <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'var(--input-bg)', fontWeight: 600 }}>{item.color_name}</span>
                              ) : '—'}
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
                                `৳${Number(item.item_sale_price).toLocaleString()}`
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
                </div>
              )}
            </div>

            {/* ── 3. ORDER METADATA & APPROVAL ASSIGNMENT ──────────────────── */}
            <div>
              <p style={sectionTitle}><Tag size={18} color="var(--accent-color)" /> Order Logistics &amp; Assignment</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Target Delivery Date *</label>
                  <input type="date" value={targetDeliveryDate} onChange={e => setTargetDeliveryDate(e.target.value)} required style={inputStyle} />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                    Mandatory delivery deadline
                  </span>
                </div>
                <div>
                  <label style={labelStyle}>Requested Delivery Date</label>
                  <input type="date" value={requestedDeliveryDate} onChange={e => setRequestedDeliveryDate(e.target.value)} style={inputStyle} />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                    Optional (client request)
                  </span>
                </div>
                <div>
                  <label style={labelStyle}>Assign Salesman (For Review)</label>
                  <select value={selectedSalesmanId} onChange={e => setSelectedSalesmanId(e.target.value)} style={inputStyle}>
                    <option value="">No Specific Salesman (Direct)</option>
                    {(salesmen || []).map(s => (
                      <option key={s.id} value={s.id}>{s.full_name} ({s.username})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── 4. INVOICE ATTACHMENTS ─────────────────────────────────── */}
            <div data-tutorial="make-invoice-attachments">
              <p style={sectionTitle}><FileText size={18} color="var(--accent-color)" /> Invoice Attachments &amp; Documents</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <button type="button" onClick={handlePickDesktopInvoice} disabled={uploadingInvoice}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--input-bg)', border: '1px dashed var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>
                  <Paperclip size={16} /> Choose Invoice Image (Desktop File)
                </button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'rgba(99,102,241,0.08)', border: '1px dashed var(--accent-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--accent-color)', fontSize: '0.875rem', fontWeight: 600 }}>
                  <Paperclip size={16} /> Take Photo / Camera (Mobile Web)
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleMobileInvoiceCapture}
                    style={{ display: 'none' }}
                  />
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--input-bg)', border: '1px dashed var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>
                  <Paperclip size={16} /> Attach Document / PDF
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleUploadFileAttachment}
                    style={{ display: 'none' }}
                  />
                </label>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Accepts JPG, JPEG, PNG, WEBP (Max 15 MB) &amp; PDF
                </span>
              </div>

              {invoiceAttachments.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {invoiceAttachments.map((att, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px' }}>
                      <FileText size={15} color="var(--accent-color)" />
                      <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{att.name}</span>
                      <button type="button" onClick={() => setInvoiceAttachments(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── SUBMIT BUTTON ──────────────────────────────────────────── */}
            <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              style={{ padding: '16px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '1.05rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, boxShadow: '0 8px 24px rgba(249,115,22,0.3)' }}>
              {loading ? 'Submitting Order to NAS Database...' : `Submit Order (${cartItems.length} Products)`}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default PlaceOrder;
