/**
 * LE-SOFT MAKE — Sales & Furniture Design Portal Single Page Application (SPA)
 * High-performance, reactive frontend for product catalog ordering, tracking, custom sizing,
 * purchase history analytics, and version-tracked approvals.
 */

(function () {
  'use strict';

  // Resilient configuration bootstrap: handles direct injection, delayed injection, or cache defaults
  function getConfig() {
    const cfg = window.LE_MAKE_CONFIG || {};
    const origin = window.location.origin;
    return {
      apiUrl: cfg.apiUrl || (origin + '/wp-json/le-make/v1/'),
      nonce: cfg.nonce || '',
      isLoggedIn: Boolean(cfg.isLoggedIn),
      user: cfg.user || null,
      loginUrl: cfg.loginUrl || (origin + '/wp-login.php?redirect_to=' + encodeURIComponent(window.location.href)),
      version: cfg.version || '1.2.0'
    };
  }

  const initialConfig = getConfig();
  let apiUrl = initialConfig.apiUrl;

  // ─── Sequential Production Stages Pipeline ─────────────────────────────────
  const PRODUCTION_STAGES = [
    'Work in process',
    'Production On Going',
    'Primary QC',
    'Color Ongoing',
    'QC Final',
    'Packaging',
    'Ready to Ship',
    'Delivered'
  ];

  // ─── Working Days Calculator (Friday = Weekend) ────────────────────────────
  function calculateWorkingDaysDate(startDate, workingDays) {
    const d = new Date(startDate);
    let added = 0;
    while (added < workingDays) {
      d.setDate(d.getDate() + 1);
      // Skip Friday (getDay() === 5)
      if (d.getDay() !== 5) {
        added++;
      }
    }
    return d;
  }

  function formatDateYMD(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // ─── State Management ──────────────────────────────────────────────────────
  const state = {
    isLoggedIn: Boolean(initialConfig.isLoggedIn),
    user: initialConfig.user || null,
    currentNonce: initialConfig.nonce || '',
    loginForm: {
      username: '',
      password: '',
      remember: true,
      error: '',
      loading: false
    },

    currentTab: 'dashboard', // 'dashboard' | 'catalog' | 'create_order' | 'track_orders'
    stats: { total: 0, pending_pricing: 0, action_required: 0, in_production: 0, delivered: 0 },
    products: [],
    orders: [],
    statusFilter: 'All',
    catalogSearch: '',
    loading: false, // Start false so portal mounts immediately without getting stuck in skeleton
    nasOnline: true,
    activeTier: 'cloudflare_tunnel',
    offlineSyncPendingCount: 0,
    orderAttachment: null,

    // Order Builder Form
    customer: {
      referenceBillNo: '',
      targetDeliveryDays: '',
      name: '',
      phone: '',
      email: '',
      address: '',
      landmark: '',
      receiverName: '',
      receiverPhone: '',
      instructions: '',
      priority: 'Normal',
      targetDeliveryDate: '',
      requestedDeliveryDate: ''
    },
    cart: [],
    selectedProduct: null,
    selectedSpec: null,
    selectedSize: null,
    selectedColor: null,
    itemCostPrice: '',
    itemSalePrice: '',
    itemQty: 1,
    itemNotes: '',

    // Custom Size state for Catalog items
    isCustomSize: false,
    customShape: 'rect', // 'rect' | 'round'
    customLength: '',
    customWidth: '',
    customHeight: '',
    customDiameter: '',
    customUnit: 'mm',

    // Manual/Custom non-catalog item mode
    isCustomItemMode: false,
    customItemName: '',
    customItemSpec: '',

    // Custom Spec & Custom Color state
    isCustomSpec: false,
    customSpecName: '',
    isCustomColor: false,
    customColorName: '',

    // Item Attachment (Technical Drawing / Sketch / Photo for configured item)
    itemAttachedFile: null,
    itemUploadingFile: false,

    // Order-level Attachment in Track Orders (Admin, Designer, Salesman)
    activeOrderAttachId: null,
    orderAttachForm: {
      fileUrl: '',
      fileName: '',
      note: '',
      previewUrl: '',
      uploading: false,
      saving: false,
      error: ''
    },

    // Active Version Diff Modal
    activeDiffOrder: null,
    diffData: null,
    diffLoading: false,
    diffModalOpen: false,

    // Product Purchase History Modal
    historyModalProduct: null,
    historyData: null,
    historyLoading: false,
    historyModalOpen: false,

    // In-Portal & Push Notifications
    notifications: [],
    unreadNotifsCount: 0,
    notifDrawerOpen: false,
    toasts: [],
    lastSeenNotifId: 0,

    // Factory Manager Production Stage Updates
    activeStageUpdateOrder: null,
    stageUpdateForm: {
      stage: 'Work in process',
      note: '',
      photoUrl: '',
      previewUrl: '',
      uploading: false,
      saving: false,
      error: ''
    }
  };

  // ─── API Helper ────────────────────────────────────────────────────────────
  async function api(endpoint, method = 'GET', body = null) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (state.currentNonce) {
      headers['X-WP-Nonce'] = state.currentNonce;
    }

    const options = { 
      method, 
      headers,
      credentials: 'same-origin' // Ensures WordPress cookies are sent with all requests
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(apiUrl + endpoint, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Network response was not ok' }));
      throw new Error(err.error || err.message || `API error: ${res.status}`);
    }
    return res.json();
  }

  // ─── Data Fetching ─────────────────────────────────────────────────────────
  async function fetchData() {
    if (!state.isLoggedIn) {
      state.loading = false;
      render();
      return;
    }

    try {
      const [sysStatus, statsData, productsData, ordersData, notifsData] = await Promise.all([
        api('system-status').catch(() => null),
        api('stats').catch(e => { console.warn('[LE-MAKE] Stats API notice:', e.message); return null; }),
        api('products' + (state.catalogSearch ? `?search=${encodeURIComponent(state.catalogSearch)}` : '')).catch(e => { console.warn('[LE-MAKE] Products API notice:', e.message); return []; }),
        api('orders').catch(e => { console.warn('[LE-MAKE] Orders API notice:', e.message); return []; }),
        api('notifications').catch(e => { console.warn('[LE-MAKE] Notifications API notice:', e.message); return null; })
      ]);

      if (sysStatus) {
        state.nasOnline = sysStatus.nas_online ?? true;
        state.activeTier = sysStatus.active_tier ?? 'cloudflare_tunnel';
        state.offlineSyncPendingCount = sysStatus.pending_sync_count ?? 0;
      }

      state.stats = statsData || state.stats;
      state.products = Array.isArray(productsData) ? productsData : (productsData?.products || []);
      state.orders = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || []);
      
      if (notifsData && Array.isArray(notifsData.notifications)) {
        processNotifications(notifsData.notifications, notifsData.unread_count);
      }

      state.loading = false;
      render();
    } catch (err) {
      console.error('[LE-MAKE] Failed to fetch data:', err);
      state.loading = false;
      render();
    }
  }

  // ─── Authentication Handlers ───────────────────────────────────────────────
  async function handleLoginSubmit(e) {
    if (e) e.preventDefault();
    const { username, password, remember } = state.loginForm;

    if (!username.trim() || !password) {
      state.loginForm.error = 'Please enter both username and password.';
      render();
      return;
    }

    state.loginForm.loading = true;
    state.loginForm.error = '';
    render();

    try {
      const res = await api('auth/login', 'POST', {
        username: username.trim(),
        password: password,
        remember: remember
      });

      if (res && res.isLoggedIn) {
        state.isLoggedIn = true;
        state.user = res.user;
        state.currentNonce = res.nonce || state.currentNonce;
        state.loginForm.loading = false;
        state.loginForm.password = '';
        state.loading = true;
        render();
        await fetchData();
      } else {
        throw new Error(res.error || 'Authentication failed');
      }
    } catch (err) {
      state.loginForm.loading = false;
      state.loginForm.error = err.message || 'Invalid username or password.';
      render();
    }
  }

  async function handleLogout() {
    if (!confirm('Are you sure you want to log out of the LE-SOFT MAKE portal?')) {
      return;
    }

    try {
      const res = await api('auth/logout', 'POST');
      if (res && res.nonce) {
        state.currentNonce = res.nonce;
      }
    } catch (err) {
      console.warn('Logout API notice:', err);
    }

    state.isLoggedIn = false;
    state.user = null;
    state.cart = [];
    state.orders = [];
    state.stats = { total: 0, pending_pricing: 0, action_required: 0, in_production: 0, delivered: 0 };
    state.currentTab = 'dashboard';
    state.loginForm.password = '';
    state.loginForm.error = '';
    render();
  }

  // ─── Actions & Handlers ────────────────────────────────────────────────────
  function setTab(tab) {
    state.currentTab = tab;
    render();
  }

  function handleProductCardClick(productId) {
    const prod = state.products.find(p => p.id === productId) || null;
    state.selectedProduct = prod;
    state.selectedSpec = prod?.specifications?.[0] || null;
    state.selectedSize = (prod?.sizes && prod.sizes.length > 0) ? prod.sizes[0] : (state.selectedSpec?.sizes?.[0] || null);
    state.selectedColor = (prod?.colors && prod.colors.length > 0) ? prod.colors[0] : (state.selectedSpec?.colors?.[0] || null);
    
    // Reset custom size fields
    state.isCustomSize = false;
    state.customLength = '';
    state.customWidth = '';
    state.customHeight = '';
    state.customDiameter = '';
    
    if (prod) {
      state.itemCostPrice = prod.purchase_price || '';
      state.itemSalePrice = prod.selling_price || prod.mrp || '';
    } else {
      state.itemCostPrice = '';
      state.itemSalePrice = '';
    }

    render();
  }

  function handleSpecChange(specId) {
    if (!state.selectedProduct) return;
    const spec = (state.selectedProduct.specifications || []).find(s => s.id === specId) || null;
    state.selectedSpec = spec;
    if (!state.selectedProduct.sizes || state.selectedProduct.sizes.length === 0) {
      state.selectedSize = spec?.sizes?.[0] || null;
    }
    if (!state.selectedProduct.colors || state.selectedProduct.colors.length === 0) {
      state.selectedColor = spec?.colors?.[0] || null;
    }
    render();
  }

  function handleAddToCart() {
    const costP = state.itemCostPrice !== '' ? Math.max(0, Number(state.itemCostPrice) || 0) : 0;
    const saleP = state.itemSalePrice !== '' ? Math.max(0, Number(state.itemSalePrice) || 0) : null;

    if (state.isCustomItemMode) {
      if (!state.customItemName.trim()) {
        alert('Custom item name is required.');
        return;
      }
      const item = {
        _id: String(Date.now()),
        product_name: state.customItemName.trim(),
        spec_details: state.customItemSpec.trim(),
        dimensions_text: state.customItemSpec.trim() || 'Custom Dimensions',
        is_customized: true,
        custom_dimensions: state.customItemSpec.trim(),
        quantity: state.itemQty > 0 ? state.itemQty : 1,
        item_cost_price: costP,
        item_sale_price: saleP,
        notes: state.itemNotes,
        technical_drawing_url: state.itemAttachedFile?.file_url || null,
        technical_drawing_name: state.itemAttachedFile?.file_name || null
      };
      state.cart.push(item);
      state.customItemName = '';
      state.customItemSpec = '';
      state.itemNotes = '';
      state.itemQty = 1;
      state.itemCostPrice = '';
      state.itemSalePrice = '';
      state.itemAttachedFile = null;
      render();
      return;
    }

    if (!state.selectedProduct) {
      alert('Please select a product from the catalog.');
      return;
    }

    let dimText = 'Standard Dimensions';
    let isCustomized = false;

    if (state.isCustomSize) {
      isCustomized = true;
      if (state.customShape === 'round') {
        dimText = `Ø ${state.customDiameter || '—'} x ${state.customHeight || '—'} ${state.customUnit} (Custom)`;
      } else {
        dimText = `${state.customLength || '—'} x ${state.customWidth || '—'} x ${state.customHeight || '—'} ${state.customUnit} (Custom)`;
      }
    } else if (state.selectedSize) {
      if (state.selectedSize.diameter) {
        dimText = `Ø ${state.selectedSize.diameter} x ${state.selectedSize.height || '—'} ${state.selectedSize.unit || 'mm'} (Round)`;
      } else {
        dimText = `${state.selectedSize.length || '—'} x ${state.selectedSize.width || '—'} x ${state.selectedSize.height || '—'} ${state.selectedSize.unit || 'mm'}`;
      }
    }

    let specName = state.selectedSpec?.spec_name;
    let specDetails = state.selectedSpec?.spec_details;
    if (state.isCustomSpec) {
      isCustomized = true;
      specName = state.customSpecName.trim() || 'Custom Spec';
      specDetails = specName;
    }

    let colorName = state.selectedColor?.color_name;
    let colorCode = state.selectedColor?.color_code;
    if (state.isCustomColor) {
      isCustomized = true;
      colorName = state.customColorName.trim() || 'Custom Color';
      colorCode = null; // No color code needed for custom color
    }

    const item = {
      _id: String(Date.now()),
      product_id: state.selectedProduct.id,
      product_code: state.selectedProduct.product_code,
      product_name: state.selectedProduct.product_name,
      spec_id: state.isCustomSpec ? null : state.selectedSpec?.id,
      spec_name: specName,
      spec_details: specDetails,
      size_id: state.isCustomSize ? null : state.selectedSize?.id,
      dimensions_text: dimText,
      is_customized: isCustomized,
      custom_dimensions: isCustomized ? dimText : undefined,
      color_id: state.isCustomColor ? null : state.selectedColor?.id,
      color_name: colorName,
      color_code: colorCode,
      quantity: state.itemQty > 0 ? state.itemQty : 1,
      item_cost_price: costP,
      item_sale_price: saleP,
      notes: state.itemNotes,
      technical_drawing_url: state.itemAttachedFile?.file_url || null,
      technical_drawing_name: state.itemAttachedFile?.file_name || null
    };

    state.cart.push(item);
    state.itemNotes = '';
    state.itemQty = 1;
    state.itemAttachedFile = null;
    state.isCustomSpec = false;
    state.customSpecName = '';
    state.isCustomColor = false;
    state.customColorName = '';
    render();
  }

  function handleRemoveCartItem(itemId) {
    state.cart = state.cart.filter(i => i._id !== itemId);
    render();
  }

  // ─── Item-Level Attachment Handlers ──────────────────────────────────────────
  async function handleItemFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('File size exceeds the 20MB limit.');
      return;
    }
    state.itemUploadingFile = true;
    render();

    try {
      const formData = new FormData();
      formData.append('file', file);
      const headers = {};
      if (state.currentNonce) {
        headers['X-WP-Nonce'] = state.currentNonce;
      }
      const res = await fetch(apiUrl + 'upload-attachment', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || err.message || 'Upload failed');
      }
      const data = await res.json();
      state.itemAttachedFile = {
        file_url: data.url,
        file_name: data.filename || file.name,
        file_type: file.type || ''
      };
    } catch (err) {
      alert('Attachment upload failed: ' + err.message);
    } finally {
      state.itemUploadingFile = false;
      render();
    }
  }

  function removeItemAttachedFile() {
    state.itemAttachedFile = null;
    render();
  }

  function toggleCustomSpec() {
    state.isCustomSpec = !state.isCustomSpec;
    render();
  }

  function toggleCustomColor() {
    state.isCustomColor = !state.isCustomColor;
    render();
  }

  // ─── Order-Level Attachment Handlers (Track Orders) ────────────────────────
  function openOrderAttach(orderId) {
    state.activeOrderAttachId = (state.activeOrderAttachId === orderId ? null : orderId);
    state.orderAttachForm = { fileUrl: '', fileName: '', note: '', previewUrl: '', uploading: false, saving: false, error: '' };
    render();
  }

  function closeOrderAttach() {
    state.activeOrderAttachId = null;
    state.orderAttachForm = { fileUrl: '', fileName: '', note: '', previewUrl: '', uploading: false, saving: false, error: '' };
    render();
  }

  async function handleOrderAttachFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('File size exceeds the 20MB limit.');
      return;
    }
    state.orderAttachForm.uploading = true;
    state.orderAttachForm.error = '';
    render();

    try {
      const formData = new FormData();
      formData.append('file', file);
      const headers = {};
      if (state.currentNonce) {
        headers['X-WP-Nonce'] = state.currentNonce;
      }
      const res = await fetch(apiUrl + 'upload-attachment', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || err.message || 'Upload failed');
      }
      const data = await res.json();
      state.orderAttachForm.fileUrl = data.url;
      state.orderAttachForm.fileName = data.filename || file.name;
      state.orderAttachForm.previewUrl = data.url;
    } catch (err) {
      state.orderAttachForm.error = err.message;
    } finally {
      state.orderAttachForm.uploading = false;
      render();
    }
  }

  async function handleOrderAttachSubmit(orderId) {
    if (!state.orderAttachForm.fileUrl) {
      state.orderAttachForm.error = 'Please select a file or capture a photo first.';
      render();
      return;
    }
    state.orderAttachForm.saving = true;
    state.orderAttachForm.error = '';
    render();

    try {
      await api(`orders/${orderId}/attach`, 'POST', {
        file_url: state.orderAttachForm.fileUrl,
        file_name: state.orderAttachForm.fileName,
        note: state.orderAttachForm.note
      });
      alert('Attachment successfully added to order!');
      state.activeOrderAttachId = null;
      state.orderAttachForm = { fileUrl: '', fileName: '', note: '', previewUrl: '', uploading: false, saving: false, error: '' };
      await fetchData();
    } catch (err) {
      state.orderAttachForm.error = err.message;
      state.orderAttachForm.saving = false;
      render();
    }
  }

  async function handleUploadAttachment(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert('File size exceeds the 20MB limit.');
      return;
    }

    state.uploadingAttachment = true;
    render();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const headers = {};
      if (state.currentNonce) {
        headers['X-WP-Nonce'] = state.currentNonce;
      }

      const res = await fetch(apiUrl + 'upload-attachment', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || err.message || 'Upload failed');
      }

      const data = await res.json();
      if (!state.orderAttachments) state.orderAttachments = [];
      state.orderAttachments.push({
        name: data.filename || file.name,
        url: data.url,
        size: file.size,
        tier: data.tier,
        is_temp_offline: data.is_temp_offline || false
      });
    } catch (err) {
      alert('Attachment upload failed: ' + err.message);
    } finally {
      state.uploadingAttachment = false;
      render();
    }
  }

  function handleRemoveAttachment(idx) {
    if (state.orderAttachments) {
      state.orderAttachments.splice(idx, 1);
      render();
    }
  }

  function handleDeliveryDaysChange(val) {
    state.customer.targetDeliveryDays = val;
    const days = parseInt(val, 10);
    if (!isNaN(days) && days > 0) {
      const deliveryDate = calculateWorkingDaysDate(new Date(), days);
      state.customer.targetDeliveryDate = formatDateYMD(deliveryDate);
    } else {
      state.customer.targetDeliveryDate = '';
    }
    render();
  }

  function handleDeliveryDateChange(val) {
    // Kept for backward compatibility but delivery days is the primary input now
    state.customer.targetDeliveryDate = val;
    render();
  }

  async function handleSubmitOrder(e) {
    e.preventDefault();
    if (state.cart.length === 0) {
      alert('Please add at least one product to your order.');
      return;
    }
    if (!state.customer.name.trim() || !state.customer.phone.trim()) {
      alert('Customer Name and Customer Phone are required.');
      return;
    }
    if (!state.customer.referenceBillNo || !state.customer.referenceBillNo.trim()) {
      alert('Reference Bill Number is mandatory. Please enter the reference bill number.');
      return;
    }

    // All roles: working days input is mandatory
    const days = parseInt(state.customer.targetDeliveryDays, 10);
    if (!days || days <= 0) {
      alert('Targeted Delivery Day(s) is mandatory. Please enter the number of working-day turnaround days.');
      return;
    }
    if (!state.customer.targetDeliveryDate) {
      const deliveryDate = calculateWorkingDaysDate(new Date(), days);
      state.customer.targetDeliveryDate = formatDateYMD(deliveryDate);
    }

    const submitBtn = document.getElementById('le-make-submit-order-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Submitting Order...';
    }

    try {
      const payload = {
        furniture_name: state.cart.length === 1 
          ? state.cart[0].product_name 
          : `${state.cart[0].product_name} (+${state.cart.length - 1} items)`,
        reference_bill_no: state.customer.referenceBillNo.trim(),
        target_delivery_days: state.customer.targetDeliveryDays ? parseInt(state.customer.targetDeliveryDays, 10) : null,
        customer_name: state.customer.name,
        customer_phone: state.customer.phone,
        customer_email: state.customer.email,
        shipping_address: state.customer.address,
        location_landmark: state.customer.landmark,
        receiver_name: state.customer.receiverName,
        receiver_phone: state.customer.receiverPhone,
        special_instructions: state.customer.instructions,
        priority: state.customer.priority,
        target_delivery_date: state.customer.targetDeliveryDate,
        delivery_date: state.customer.targetDeliveryDate,
        requested_delivery_date: state.customer.requestedDeliveryDate || null,
        items: state.cart,
        attachments: state.orderAttachments || []
      };

      await api('orders', 'POST', payload);
      alert('Order successfully submitted!');

      // Reset form & reload data
      state.cart = [];
      state.orderAttachments = [];
      state.customer = {
        name: '', phone: '', email: '', address: '', landmark: '',
        receiverName: '', receiverPhone: '', instructions: '',
        priority: 'Normal', targetDeliveryDate: '', requestedDeliveryDate: '',
        referenceBillNo: '', targetDeliveryDays: ''
      };
      state.currentTab = 'track_orders';
      await fetchData();
    } catch (err) {
      alert('Failed to place order: ' + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Submit Production Order';
      }
    }
  }

  async function openDiffModal(order) {
    state.activeDiffOrder = order;
    state.diffModalOpen = true;
    state.diffLoading = true;
    render();

    try {
      const currentVer = order.current_version || 1;
      const prevVer = order.approved_version || (currentVer > 1 ? currentVer - 1 : 1);
      const diff = await api(`orders/${order.id}/diff?v_from=${prevVer}&v_to=${currentVer}`);
      state.diffData = diff;
    } catch (err) {
      console.error(err);
      state.diffData = null;
    } finally {
      state.diffLoading = false;
      render();
    }
  }

  async function openHistoryModal(product) {
    state.historyModalProduct = product;
    state.historyModalOpen = true;
    state.historyLoading = true;
    render();

    try {
      const history = await api(`products/${product.id}/history`);
      state.historyData = history;
    } catch (err) {
      console.error(err);
      state.historyData = null;
    } finally {
      state.historyLoading = false;
      render();
    }
  }

  async function handleApproveVersion(orderId, versionNumber) {
    if (!confirm(`Are you sure you want to approve Version v${versionNumber} and proceed to production?`)) return;

    try {
      await api(`orders/${orderId}/approve`, 'POST', { version_number: versionNumber });
      alert('Order approved! Production has been initiated.');
      state.diffModalOpen = false;
      await fetchData();
    } catch (err) {
      alert('Failed to approve order: ' + err.message);
    }
  }

  async function handleRejectVersion(orderId, versionNumber) {
    const reason = prompt('Please describe why this modification is rejected (what needs to be revised):');
    if (!reason) return;

    try {
      await api(`orders/${orderId}/reject`, 'POST', { version_number: versionNumber, reason });
      alert('Revision request sent to the furniture designer.');
      state.diffModalOpen = false;
      await fetchData();
    } catch (err) {
      alert('Failed to reject order: ' + err.message);
    }
  }

  // ─── Device Detection (Mobile Camera vs PC File Picker) ──────────────────
  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
      || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches && 'ontouchstart' in window);
  }

  // ─── Real-Time Notifications & Toasts ─────────────────────────────────────
  function showToast(title, message, photoUrl = null) {
    const id = Date.now() + Math.random();
    state.toasts.push({ id, title, message, photoUrl });
    renderToasts();
    setTimeout(() => {
      state.toasts = state.toasts.filter(t => t.id !== id);
      renderToasts();
    }, 6500);
  }

  function renderToasts() {
    let container = document.getElementById('le-make-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'le-make-toast-container';
      container.className = 'le-make-toast-container';
      document.body.appendChild(container);
    }
    if (state.toasts.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = state.toasts.map(t => `
      <div class="le-make-toast">
        <span style="font-size: 1.25rem;">🔔</span>
        <div style="flex: 1; min-width: 0;">
          <strong style="display: block; color: #ffffff; font-size: 0.85rem; margin-bottom: 2px;">${escapeHtml(t.title)}</strong>
          <span style="color: #cbd5e1; font-size: 0.78rem; display: block; line-height: 1.3;">${escapeHtml(t.message)}</span>
        </div>
        ${t.photoUrl ? `<img src="${escapeHtml(resolveMediaUrl(t.photoUrl))}" style="width: 36px; height: 36px; border-radius: 4px; object-fit: cover;" />` : ''}
      </div>
    `).join('');
  }

  function processNotifications(newList, unreadCount) {
    state.notifications = newList;
    state.unreadNotifsCount = typeof unreadCount === 'number' ? unreadCount : newList.filter(n => !n.is_read).length;

    // Detect new unread notification
    const newestUnread = newList.find(n => !n.is_read && n.id > state.lastSeenNotifId);
    if (newestUnread) {
      state.lastSeenNotifId = Math.max(state.lastSeenNotifId, newestUnread.id);
      showToast(newestUnread.title, newestUnread.message, newestUnread.metadata?.photo_url);

      // Browser Web Push Notification
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(newestUnread.title, {
            body: newestUnread.message,
            icon: newestUnread.metadata?.photo_url || undefined
          });
        } catch (e) {
          console.warn('Web notification notice:', e);
        }
      }
    }
  }

  async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        showToast('Push Alerts Active', 'You will now receive desktop alerts for production updates.');
      }
      render();
    }
  }

  async function markNotificationRead(id) {
    try {
      await api(`notifications/${id}/read`, 'POST');
      const item = state.notifications.find(n => n.id === id);
      if (item) item.is_read = true;
      state.unreadNotifsCount = Math.max(0, state.unreadNotifsCount - 1);
      render();
    } catch (e) {
      console.warn(e);
    }
  }

  async function markAllNotificationsRead() {
    try {
      await api('notifications/read-all', 'POST');
      state.notifications.forEach(n => n.is_read = true);
      state.unreadNotifsCount = 0;
      render();
    } catch (e) {
      console.warn(e);
    }
  }

  function toggleNotifDrawer() {
    state.notifDrawerOpen = !state.notifDrawerOpen;
    render();
  }

  function renderNotificationDrawer() {
    return `
      <div class="le-make-notif-drawer">
        <div class="le-make-notif-header">
          <div style="font-weight: 700; font-size: 0.9rem; color: var(--le-color-dark); display: flex; align-items: center; gap: 6px;">
            <span>🔔</span> Notifications
            ${state.unreadNotifsCount > 0 ? `<span style="background: rgba(220,38,38,0.1); color: #dc2626; font-size: 0.72rem; padding: 2px 6px; border-radius: 10px; font-weight: 700;">${state.unreadNotifsCount} new</span>` : ''}
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${('Notification' in window && Notification.permission === 'default') ? `
              <button type="button" class="le-make-btn le-make-btn-sm" style="font-size: 0.72rem; padding: 2px 6px; background: rgba(2,132,199,0.1); color: #0284c7; border: 1px solid rgba(2,132,199,0.2);" onclick="window.LE_MAKE.requestNotificationPermission()">
                Enable Push
              </button>
            ` : ''}
            <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="font-size: 0.72rem; padding: 2px 8px;" onclick="window.LE_MAKE.markAllNotificationsRead()">
              Mark all read
            </button>
          </div>
        </div>

        <div class="le-make-notif-list">
          ${state.notifications.length === 0 ? `
            <div style="padding: 2rem; text-align: center; color: var(--le-color-muted); font-size: 0.82rem;">
              No recent notifications.
            </div>
          ` : state.notifications.map(n => `
            <div class="le-make-notif-item ${!n.is_read ? 'unread' : ''}" onclick="window.LE_MAKE.markNotificationRead(${n.id})">
              <div class="le-make-notif-icon">
                ${n.metadata?.stage ? '🛠️' : (n.title.includes('Approved') ? '✅' : '📢')}
              </div>
              <div class="le-make-notif-content">
                <div class="le-make-notif-title">${escapeHtml(n.title)}</div>
                <div class="le-make-notif-desc">${escapeHtml(n.message)}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                  <span class="le-make-notif-time">${n.created_at ? new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</span>
                  ${n.metadata?.photo_url ? `
                    <a href="${escapeHtml(n.metadata.photo_url)}" target="_blank" rel="noopener noreferrer" style="font-size: 0.72rem; color: #0284c7; font-weight: 600; text-decoration: underline;" onclick="event.stopPropagation()">
                      📷 View Photo
                    </a>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ─── Factory Manager Production Workbench ──────────────────────────────────
  function openStageUpdate(order) {
    state.activeStageUpdateOrder = order;
    const currentIdx = PRODUCTION_STAGES.indexOf(order.status);
    let nextStage = PRODUCTION_STAGES[0];
    if (currentIdx >= 0) {
      if (currentIdx < PRODUCTION_STAGES.length - 1) {
        nextStage = PRODUCTION_STAGES[currentIdx + 1];
      } else {
        nextStage = PRODUCTION_STAGES[currentIdx];
      }
    }

    state.stageUpdateForm = {
      stage: nextStage,
      note: '',
      photoUrl: order.current_stage_photo || '',
      previewUrl: order.current_stage_photo || '',
      uploading: false,
      saving: false,
      error: ''
    };
    render();
  }

  function closeStageUpdate() {
    state.activeStageUpdateOrder = null;
    render();
  }

  async function handleStagePhotoSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const preview = URL.createObjectURL(file);
    state.stageUpdateForm.previewUrl = preview;
    state.stageUpdateForm.uploading = true;
    state.stageUpdateForm.error = '';
    render();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const headers = {};
      if (state.currentNonce) {
        headers['X-WP-Nonce'] = state.currentNonce;
      }

      const res = await fetch(apiUrl + 'upload-attachment', {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'same-origin'
      });

      if (!res.ok) {
        throw new Error('Failed to upload image. Please try again.');
      }

      const data = await res.json();
      if (data && data.url) {
        state.stageUpdateForm.photoUrl = data.url;
      } else {
        throw new Error('Upload succeeded but no file URL was returned');
      }
    } catch (err) {
      console.error('Stage photo upload failed:', err);
      state.stageUpdateForm.error = 'Photo upload failed: ' + err.message;
    } finally {
      state.stageUpdateForm.uploading = false;
      render();
    }
  }

  async function handleStageSubmit(orderId) {
    const { stage, note, photoUrl } = state.stageUpdateForm;
    if (!stage) {
      alert('Please select a production stage.');
      return;
    }

    const currentOrder = state.activeStageUpdateOrder;
    const currentIdx = PRODUCTION_STAGES.indexOf(currentOrder?.status);
    const targetIdx = PRODUCTION_STAGES.indexOf(stage);

    if (targetIdx === -1) {
      alert('Invalid production stage selected.');
      return;
    }

    if (currentIdx === -1) {
      if (targetIdx !== 0) {
        alert(`Stages must be updated sequentially. The initial stage must be "${PRODUCTION_STAGES[0]}".`);
        return;
      }
    } else if (targetIdx > currentIdx + 1) {
      alert(`Stages must be updated sequentially. The next required stage is "${PRODUCTION_STAGES[currentIdx + 1]}". You cannot skip ahead.`);
      return;
    }

    state.stageUpdateForm.saving = true;
    state.stageUpdateForm.error = '';
    render();

    try {
      await api(`orders/${orderId}/stage-update`, 'POST', {
        stage,
        note,
        photo_url: photoUrl
      });

      showToast('Stage Updated!', `Order #${orderId} progressed to "${stage}". Stakeholders notified.`);
      state.activeStageUpdateOrder = null;
      await fetchData();
    } catch (err) {
      state.stageUpdateForm.error = err.message || 'Failed to update stage';
      state.stageUpdateForm.saving = false;
      render();
    }
  }

  // ─── Render Components ─────────────────────────────────────────────────────

  function renderNavbar() {
    const user = state.user || {};

    return `
      ${!state.nasOnline ? `
        <div class="le-make-offline-banner">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.15rem;">⚠️</span>
            <div>
              <strong>Offline Mode Active</strong> &mdash; Order submissions and catalog are active.
            </div>
          </div>
          <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="background: rgba(255,255,255,0.95); white-space: nowrap;" onclick="window.LE_MAKE.retryNasConnection()">
            🔄 Check Connection
          </button>
        </div>
      ` : ''}

      <div class="le-make-header">
        <div class="le-make-nav-tabs">
          <button class="le-make-nav-btn ${state.currentTab === 'dashboard' ? 'active' : ''}" onclick="window.LE_MAKE.setTab('dashboard')">
            📊 Overview
          </button>
          <button class="le-make-nav-btn ${state.currentTab === 'catalog' ? 'active' : ''}" onclick="window.LE_MAKE.setTab('catalog')">
            🪑 Catalog
          </button>
          <button class="le-make-nav-btn ${state.currentTab === 'create_order' ? 'active' : ''}" onclick="window.LE_MAKE.setTab('create_order')">
            ➕ New Order
          </button>
          <button class="le-make-nav-btn ${state.currentTab === 'track_orders' ? 'active' : ''}" onclick="window.LE_MAKE.setTab('track_orders')">
            📦 Orders &amp; Approvals ${state.stats.action_required > 0 ? `<span class="le-make-badge le-make-badge-action-required" style="margin-left:4px;">${state.stats.action_required}</span>` : ''}
          </button>
        </div>

        <div class="le-make-header-right">
          <!-- Notification Bell & Badge -->
          <div class="le-make-notif-btn-wrapper">
            <button type="button" class="le-make-notif-btn" title="Production Notifications" onclick="window.LE_MAKE.toggleNotifDrawer()">
              🔔
              ${state.unreadNotifsCount > 0 ? `<span class="le-make-notif-badge">${state.unreadNotifsCount}</span>` : ''}
            </button>
            ${state.notifDrawerOpen ? renderNotificationDrawer() : ''}
          </div>

          <div class="le-make-user-pill">
            <div class="le-make-user-info">
              <span class="le-make-user-name">${escapeHtml(user.name || 'User')}</span>
              <span class="le-make-user-role">${escapeHtml(user.roleName || 'Salesperson')}</span>
            </div>
            <button class="le-make-btn le-make-btn-secondary le-make-btn-sm le-make-logout-btn" title="Sign out" onclick="window.LE_MAKE.handleLogout()">
              🚪 Logout
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderStats() {
    return `
      <div class="le-make-stats-grid">
        <div class="le-make-stat-card">
          <div class="le-make-stat-icon le-make-stat-icon-orders">📋</div>
          <div>
            <div class="le-make-stat-val">${state.stats.total}</div>
            <div class="le-make-stat-lbl">Total Orders</div>
          </div>
        </div>

        <div class="le-make-stat-card">
          <div class="le-make-stat-icon le-make-stat-icon-review">⏳</div>
          <div>
            <div class="le-make-stat-val">${state.stats.pending_pricing}</div>
            <div class="le-make-stat-lbl">Pending Review</div>
          </div>
        </div>

        <div class="le-make-stat-card" style="${state.stats.action_required > 0 ? 'border-color: var(--le-accent); background: #fffaf7;' : ''}">
          <div class="le-make-stat-icon le-make-stat-icon-action">🔔</div>
          <div>
            <div class="le-make-stat-val" style="${state.stats.action_required > 0 ? 'color: var(--le-accent);' : ''}">${state.stats.action_required}</div>
            <div class="le-make-stat-lbl">Action Required</div>
          </div>
        </div>

        <div class="le-make-stat-card">
          <div class="le-make-stat-icon le-make-stat-icon-production">⚙️</div>
          <div>
            <div class="le-make-stat-val">${state.stats.in_production}</div>
            <div class="le-make-stat-lbl">In Production</div>
          </div>
        </div>

        <div class="le-make-stat-card">
          <div class="le-make-stat-icon le-make-stat-icon-delivered">✅</div>
          <div>
            <div class="le-make-stat-val">${state.stats.delivered}</div>
            <div class="le-make-stat-lbl">Delivered</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDashboardView() {
    const recentOrders = state.orders.slice(0, 5);

    return `
      ${renderStats()}

      <div class="le-make-panel">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <h3 class="le-make-section-title" style="margin: 0;">Recent Production Orders</h3>
          <button class="le-make-btn le-make-btn-primary le-make-btn-sm" onclick="window.LE_MAKE.setTab('create_order')">
            ➕ Place New Order
          </button>
        </div>

        ${recentOrders.length === 0 ? `
          <div style="text-align: center; padding: 2.5rem; color: var(--le-color-muted);">
            No production orders recorded yet. Click "Place New Order" to start.
          </div>
        ` : `
          <div class="le-make-table-container">
            <table class="le-make-table">
              <thead>
                <tr>
                  <th>Order Ref</th>
                  <th>Furniture Item</th>
                  <th>Customer</th>
                  <th>Landmark</th>
                  <th>Target Date</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${recentOrders.map(o => `
                  <tr>
                    <td><code style="font-family: var(--le-font-mono); font-weight: 700; color: var(--le-accent); font-size: 0.85rem;">${escapeHtml(o.order_number || `#${o.id}`)}</code></td>
                    <td><strong style="color: var(--le-color-dark);">${escapeHtml(o.furniture_name)}</strong> (x${o.quantity})</td>
                    <td>${escapeHtml(o.customer_name || '—')}</td>
                    <td style="color: var(--le-accent); font-weight: 600;">${escapeHtml(o.location_landmark || '—')}</td>
                    <td>${(o.target_delivery_date || o.delivery_date) ? new Date(o.target_delivery_date || o.delivery_date).toLocaleDateString() : 'TBD'}</td>
                    <td><span class="le-make-badge" style="background: var(--le-color-bg-alt); color: var(--le-color-dark); border: 1px solid var(--le-color-border-subtle);">${escapeHtml(o.status)}</span></td>
                    <td>${renderApprovalBadge(o.approval_status, o.current_version)}</td>
                    <td>
                      ${(o.approval_status === 'modification_pending_approval' || o.approval_status === 'priced') ? `
                        <button class="le-make-btn le-make-btn-primary le-make-btn-sm" onclick="window.LE_MAKE.openDiffModal(${JSON.stringify(o).replace(/"/g, '&quot;')})">
                          Review &amp; Approve
                        </button>
                      ` : `
                        <button class="le-make-btn le-make-btn-secondary le-make-btn-sm" onclick="window.LE_MAKE.setTab('track_orders')">
                          Details
                        </button>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  function renderCatalogView() {
    return `
      <div class="le-make-panel">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 1.5rem;">
          <div>
            <h3 class="le-make-section-title" style="margin: 0 0 4px;">Catalog &amp; Product Database</h3>
            <p style="margin: 0; font-size: 0.82rem; color: var(--le-color-muted);">Browse catalog models, technical specifications, dimensional sizes, and past order history.</p>
          </div>

          <div style="display: flex; gap: 10px; width: 100%; max-width: 320px;">
            <input type="text" class="le-make-input" placeholder="Search products..." 
              value="${escapeHtml(state.catalogSearch)}" 
              oninput="window.LE_MAKE.handleCatalogSearch(this.value)" />
          </div>
        </div>

        <div class="le-make-product-grid">
          ${state.products.map(p => `
            <div class="le-make-product-card" style="cursor: default;">
              ${p.main_image ? `<img src="${escapeHtml(resolveMediaUrl(p.main_image))}" class="le-make-product-img" alt="${escapeHtml(p.product_name)}" />` : `<div class="le-make-product-img" style="display:flex;align-items:center;justify-content:center;color:var(--le-color-light);font-size:32px;">🪑</div>`}
              <div class="le-make-product-code">${escapeHtml(p.product_code || 'CODE')}</div>
              <div class="le-make-product-name">${escapeHtml(p.product_name)}</div>
              
              <div style="font-size: 0.78rem; color: var(--le-color-muted); margin-top: 6px;">
                ${(p.specifications || []).length} Specifications • ${(p.sizes || []).length} Standard Sizes
              </div>

              <div style="margin-top: 14px; display: flex; gap: 8px; width: 100%;">
                <button class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="flex: 1;" onclick="window.LE_MAKE.openHistoryModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                  📊 Order History
                </button>
                <button class="le-make-btn le-make-btn-primary le-make-btn-sm" style="flex: 1;" onclick="window.LE_MAKE.handleSelectProductAndOrder(${p.id})">
                  ➕ Order
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderApprovalBadge(status, version = 1) {
    if (status === 'modification_pending_approval') {
      return `<span class="le-make-badge le-make-badge-action-required">⚠️ Review v${version}</span>`;
    }
    if (status === 'priced') {
      return `<span class="le-make-badge le-make-badge-pending-pricing">💰 Priced (v${version})</span>`;
    }
    if (status === 'sales_approved' || status === 'approved') {
      return `<span class="le-make-badge le-make-badge-approved">✔ Approved (v${version})</span>`;
    }
    if (status === 'rejected') {
      return `<span class="le-make-badge le-make-badge-rejected">✖ Revision Req.</span>`;
    }
    return `<span class="le-make-badge le-make-badge-pending-pricing">Pending Review</span>`;
  }

  function renderCreateOrderView() {
    const user = state.user || {};

    return `
      <div class="le-make-panel">
        <h3 class="le-make-title" style="margin: 0 0 1.25rem; font-size: 1.35rem; border-bottom: 1px solid var(--le-color-border); padding-bottom: 12px;">
          Create Customized Furniture Order
        </h3>

        <!-- ── 1. CUSTOMER & DELIVERY LOGISTICS ── -->
        <div style="margin-bottom: 2rem;">
          <h4 class="le-make-section-title">1. Customer &amp; Delivery Logistics</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px;">
            <div class="le-make-form-group">
              <label class="le-make-label">Reference Bill Number * <span style="color: var(--le-danger);">(Mandatory)</span></label>
              <input type="text" class="le-make-input" placeholder="e.g. BILL-2026-0891"
                value="${escapeHtml(state.customer.referenceBillNo || '')}"
                oninput="window.LE_MAKE.state.customer.referenceBillNo = this.value" required />
              <div style="font-size: 0.72rem; color: var(--le-color-muted); margin-top: 2px;">Official reference bill number for this order.</div>
            </div>

            <div class="le-make-form-group">
              <label class="le-make-label">Customer Name *</label>
              <input type="text" class="le-make-input" placeholder="e.g. John Doe / Prime Ltd"
                value="${escapeHtml(state.customer.name)}" oninput="window.LE_MAKE.state.customer.name = this.value" required />
            </div>

            <div class="le-make-form-group">
              <label class="le-make-label">Customer Phone *</label>
              <input type="text" class="le-make-input" placeholder="e.g. +880 1700 000000"
                value="${escapeHtml(state.customer.phone)}" oninput="window.LE_MAKE.state.customer.phone = this.value" required />
            </div>

            <div class="le-make-form-group">
              <label class="le-make-label">Customer Email</label>
              <input type="email" class="le-make-input" placeholder="e.g. client@example.com"
                value="${escapeHtml(state.customer.email)}" oninput="window.LE_MAKE.state.customer.email = this.value" />
            </div>

            <div class="le-make-form-group">
              <label class="le-make-label">Receiver Name (If different from customer)</label>
              <input type="text" class="le-make-input" placeholder="e.g. Site Supervisor"
                value="${escapeHtml(state.customer.receiverName)}" oninput="window.LE_MAKE.state.customer.receiverName = this.value" />
            </div>

            <div class="le-make-form-group">
              <label class="le-make-label">Receiver Phone</label>
              <input type="text" class="le-make-input" placeholder="e.g. +880 1800 000000"
                value="${escapeHtml(state.customer.receiverPhone)}" oninput="window.LE_MAKE.state.customer.receiverPhone = this.value" />
            </div>

            <!-- Full Shipping Address -->
            <div class="le-make-form-group" style="grid-column: 1 / -1;">
              <label class="le-make-label">Full Shipping / Delivery Address</label>
              <textarea class="le-make-textarea" rows="2" placeholder="House, Road, Block, Area..."
                oninput="window.LE_MAKE.state.customer.address = this.value">${escapeHtml(state.customer.address)}</textarea>
            </div>

            <!-- Landmark DIRECTLY BELOW Shipping Address -->
            <div class="le-make-form-group" style="grid-column: 1 / -1;">
              <label class="le-make-label" style="color: var(--le-accent);">📍 Location Landmark</label>
              <input type="text" class="le-make-input le-make-landmark-input" placeholder="e.g. Near City Center Gate 3 / Behind Police Box"
                value="${escapeHtml(state.customer.landmark)}" oninput="window.LE_MAKE.state.customer.landmark = this.value" />
              <div style="font-size: 0.75rem; color: var(--le-color-muted); margin-top: 4px;">Prominent landmark used for courier dispatch and delivery logistics routing.</div>
            </div>
          </div>
        </div>

        <!-- ── 2. PRODUCT CATALOG SELECTION (ITEM BUILDER) ── -->
        <div class="le-make-subpanel" style="margin-bottom: 2rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;">
            <h4 class="le-make-section-title" style="margin: 0;">2. Select &amp; Customize Products</h4>
            <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" onclick="window.LE_MAKE.toggleCustomItemMode()">
              ${state.isCustomItemMode ? '← Switch to Catalog Products' : '+ Add Non-Catalog Custom Item'}
            </button>
          </div>

          ${!state.isCustomItemMode ? `
            <!-- Catalog Mode -->
            <div>
              <!-- Dedicated Catalog Product Selector Dropdown & Filter -->
              <div class="le-make-product-selector-box">
                <div style="display: flex; flex-direction: column; gap: 10px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <label class="le-make-label" style="margin: 0; font-weight: 700; color: var(--le-color-dark);">
                      Select Product from Catalog:
                    </label>
                    <span style="font-size: 0.78rem; color: var(--le-color-muted);">
                      ${state.products.length} Products Available ${state.nasOnline === false ? '• <span class="le-make-media-offline-badge">Cloud Text Backup Active</span>' : ''}
                    </span>
                  </div>

                  <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px;">
                    <div>
                      <select class="le-make-select" onchange="if (this.value) window.LE_MAKE.handleProductCardClick(Number(this.value))">
                        <option value="">-- Choose a Catalog Product (${state.products.length} loaded) --</option>
                        ${state.products.map(p => `
                          <option value="${p.id}" ${state.selectedProduct?.id === p.id ? 'selected' : ''}>
                            ${escapeHtml(p.product_code || 'CODE')} - ${escapeHtml(p.product_name)}
                          </option>
                        `).join('')}
                      </select>
                    </div>
                    <div>
                      <input type="text" class="le-make-input" placeholder="Filter catalog..."
                        value="${escapeHtml(state.catalogSearch || '')}"
                        oninput="window.LE_MAKE.handleCatalogSearch(this.value)" />
                    </div>
                  </div>
                </div>
              </div>

              ${state.products.length === 0 ? `
                <div style="text-align: center; padding: 2rem; background: #fffaf0; border: 1px dashed #d97706; border-radius: var(--le-radius-sm); margin-bottom: 1rem;">
                  <div style="font-size: 1.8rem; margin-bottom: 6px;">📂</div>
                  <div style="font-weight: 700; color: #92400e; font-size: 1rem; margin-bottom: 4px;">
                    No Catalog Products Found
                  </div>
                  <div style="color: #78350f; font-size: 0.85rem; max-width: 500px; margin: 0 auto 14px;">
                    You can use "+ Add Non-Catalog Custom Item" above to specify your furniture directly, or click below to refresh.
                  </div>
                  <div style="display: flex; gap: 8px; justify-content: center;">
                    <button type="button" class="le-make-btn le-make-btn-primary le-make-btn-sm" onclick="window.LE_MAKE.fetchData()">
                      🔄 Refresh Products
                    </button>
                    <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" onclick="window.LE_MAKE.toggleCustomItemMode()">
                      + Add Non-Catalog Custom Item
                    </button>
                  </div>
                </div>
              ` : (() => {
                const search = (state.catalogSearch || '').trim().toLowerCase();
                const matched = search
                  ? state.products.filter(p =>
                      (p.product_name && p.product_name.toLowerCase().includes(search)) ||
                      (p.product_code && p.product_code.toLowerCase().includes(search)) ||
                      (p.description && p.description.toLowerCase().includes(search))
                    )
                  : state.products;
                const displayed = matched.slice(0, 3);

                if (matched.length === 0) {
                  return `
                    <div style="text-align: center; padding: 1.75rem; background: #fffaf0; border: 1px dashed #d97706; border-radius: var(--le-radius-sm); margin-bottom: 1rem;">
                      <div style="font-size: 1.5rem; margin-bottom: 4px;">🔍</div>
                      <div style="font-weight: 700; color: #92400e; font-size: 0.95rem; margin-bottom: 2px;">
                        No Catalog Products Found
                      </div>
                      <div style="color: #78350f; font-size: 0.8rem;">
                        No models matched "${escapeHtml(state.catalogSearch)}". Use "+ Add Non-Catalog Custom Item" or try another keyword.
                      </div>
                    </div>
                  `;
                }

                return `
                  <div style="display: flex; justify-content: space-between; align-items: center; margin: 6px 0 10px; font-size: 0.8rem; color: var(--le-color-muted);">
                    <span>
                      ${search ? `🔍 Found <strong>${matched.length}</strong> matching product${matched.length === 1 ? '' : 's'} — displaying <strong>${displayed.length}</strong>:` : `Showing <strong>${displayed.length}</strong> of ${state.products.length} products (use search above to find other items):`}
                    </span>
                    <span style="font-size: 0.74rem; color: var(--le-accent); font-weight: 700;">(At max 3 shown)</span>
                  </div>

                  <div class="le-make-product-grid">
                    ${displayed.map(p => `
                      <div class="le-make-product-card ${state.selectedProduct?.id === p.id ? 'selected' : ''}" onclick="window.LE_MAKE.handleProductCardClick(${p.id})">
                        <div class="le-make-product-img-wrapper" style="position:relative; overflow:hidden; border-radius: var(--le-radius-sm); height: 160px; background: #f1f5f9; display: flex; align-items: center; justify-content: center;">
                          ${p.main_image ? `
                            <img src="${escapeHtml(resolveMediaUrl(p.main_image))}" class="le-make-product-img" alt="${escapeHtml(p.product_name)}" style="width:100%; height:100%; object-fit:cover;"
                              onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                            <div class="le-make-img-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; flex-direction:column; background: #f8fafc; color: #64748b; font-size: 0.78rem; text-align:center; padding: 8px;">
                              <span style="font-size: 1.5rem; margin-bottom: 4px;">🪑</span>
                              <span style="font-weight: 600; color: #475569;">${escapeHtml(p.product_name)}</span>
                              <span style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Image Preview Unavailable</span>
                            </div>
                          ` : `
                            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8;">
                              <span style="font-size: 2rem;">🪑</span>
                              <span style="font-size: 0.72rem; margin-top: 4px;">No Photo</span>
                            </div>
                          `}
                        </div>
                        <div class="le-make-product-code">${escapeHtml(p.product_code || 'CODE')}</div>
                        <div class="le-make-product-name">${escapeHtml(p.product_name)}</div>
                        <div style="font-size: 0.78rem; color: var(--le-text-secondary); margin-top: auto;">
                          ${(p.specifications || []).length} Specs Available
                        </div>
                      </div>
                    `).join('')}
                  </div>
                `;
              })()}

              <!-- Product Configuration Form -->
              ${state.selectedProduct ? `
                <div style="background: #ffffff; border: 1px solid var(--le-border); border-radius: var(--le-radius-sm); padding: 1.25rem; margin-top: 1rem;">
                  <h5 style="margin: 0 0 12px; font-size: 0.9rem; font-weight: 800;">
                    Configuring: ${escapeHtml(state.selectedProduct.product_name)}
                  </h5>

                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px;">
                    <!-- Specification / Custom Spec -->
                    <div>
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <label class="le-make-label" style="margin: 0;">Specification / Model</label>
                        <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="padding: 2px 8px; font-size: 0.72rem;" onclick="window.LE_MAKE.toggleCustomSpec()">
                          ${state.isCustomSpec ? '← Standard Specs' : '+ Custom Spec'}
                        </button>
                      </div>

                      ${!state.isCustomSpec ? `
                        <select class="le-make-select" onchange="window.LE_MAKE.handleSpecChange(Number(this.value))">
                          ${(state.selectedProduct.specifications || []).map(s => `
                            <option value="${s.id}" ${state.selectedSpec?.id === s.id ? 'selected' : ''}>
                              ${escapeHtml(s.spec_name)} ${s.spec_code ? `(${s.spec_code})` : ''}
                            </option>
                          `).join('')}
                        </select>
                      ` : `
                        <div style="background: rgba(249,115,22,0.06); border: 1px dashed var(--le-accent); border-radius: 6px; padding: 8px;">
                          <div style="font-size: 0.75rem; font-weight: 800; color: var(--le-accent); margin-bottom: 4px;">
                            ✨ Custom Specification
                          </div>
                          <input type="text" class="le-make-input" placeholder="e.g. 6-leg executive frame, cable tray"
                            value="${escapeHtml(state.customSpecName || '')}"
                            oninput="window.LE_MAKE.state.customSpecName = this.value" />
                        </div>
                      `}
                    </div>

                    <!-- Dimensions / Custom Size -->
                    <div>
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <label class="le-make-label" style="margin: 0;">Size / Dimensions</label>
                        <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="padding: 2px 8px; font-size: 0.72rem;" onclick="window.LE_MAKE.toggleCustomSize()">
                          ${state.isCustomSize ? '← Standard' : '+ Custom Size'}
                        </button>
                      </div>

                      ${!state.isCustomSize ? `
                        <select class="le-make-select" onchange="window.LE_MAKE.handleSizeChange(Number(this.value))">
                          ${((state.selectedProduct.sizes && state.selectedProduct.sizes.length > 0) ? state.selectedProduct.sizes : (state.selectedSpec?.sizes || [])).map(sz => {
                            const label = sz.size_label
                                ? `${sz.size_label} (${sz.diameter ? `Ø ${sz.diameter} ${sz.unit || 'mm'}` : `${sz.length}x${sz.width}x${sz.height} ${sz.unit || 'mm'}`})`
                                : (sz.diameter
                                  ? `Ø ${sz.diameter} x ${sz.height || '—'} ${sz.unit || 'mm'} (Round)`
                                  : `${sz.length || '—'} x ${sz.width || '—'} x ${sz.height || '—'} ${sz.unit || 'mm'}`);
                            return `<option value="${sz.id}" ${state.selectedSize?.id === sz.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                          }).join('')}
                        </select>
                      ` : `
                        <div style="background: rgba(249,115,22,0.06); border: 1px dashed var(--le-accent); border-radius: 6px; padding: 8px;">
                          <div style="font-size: 0.75rem; font-weight: 800; color: var(--le-accent); margin-bottom: 6px;">
                            ✨ Custom Size Entry
                          </div>
                          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 70px; gap: 4px;">
                            <input type="text" class="le-make-input" style="padding: 6px;" placeholder="Length (L)" value="${escapeHtml(state.customLength)}" oninput="window.LE_MAKE.state.customLength = this.value" />
                            <input type="text" class="le-make-input" style="padding: 6px;" placeholder="Width (W)" value="${escapeHtml(state.customWidth)}" oninput="window.LE_MAKE.state.customWidth = this.value" />
                            <input type="text" class="le-make-input" style="padding: 6px;" placeholder="Height (H)" value="${escapeHtml(state.customHeight)}" oninput="window.LE_MAKE.state.customHeight = this.value" />
                            <select class="le-make-select" style="padding: 6px;" onchange="window.LE_MAKE.state.customUnit = this.value">
                              <option value="mm">mm</option>
                              <option value="inch">in</option>
                              <option value="cm">cm</option>
                              <option value="feet">ft</option>
                            </select>
                          </div>
                        </div>
                      `}
                    </div>

                    <!-- Color & Finish / Custom Color -->
                    <div>
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <label class="le-make-label" style="margin: 0;">Color / Finish</label>
                        <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="padding: 2px 8px; font-size: 0.72rem;" onclick="window.LE_MAKE.toggleCustomColor()">
                          ${state.isCustomColor ? '← Standard Colors' : '+ Custom Color'}
                        </button>
                      </div>

                      ${!state.isCustomColor ? (() => {
                        const availableColors = (state.selectedProduct.colors && state.selectedProduct.colors.length > 0)
                          ? state.selectedProduct.colors
                          : (state.selectedSpec?.colors || []);

                        if (availableColors.length === 0) {
                          return `<div style="font-size: 0.78rem; color: var(--le-color-muted); padding: 6px 0;">No predefined colors. Click "+ Custom Color" to specify.</div>`;
                        }

                        return `
                          <!-- Visual Color Dots with Color Name -->
                          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;">
                            ${availableColors.map(cl => {
                              const isSel = state.selectedColor?.id === cl.id;
                              const dotColor = cl.color_code || '#cccccc';
                              return `
                                <button type="button" 
                                  onclick="window.LE_MAKE.handleColorChange(${cl.id})"
                                  style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 14px; border: ${isSel ? '2px solid var(--le-accent)' : '1px solid var(--le-color-border)'}; background: ${isSel ? 'rgba(255,106,0,0.08)' : '#ffffff'}; cursor: pointer; font-size: 0.78rem; font-weight: ${isSel ? '700' : '500'}; color: var(--le-color-dark);">
                                  <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${escapeHtml(dotColor)}; border: 1px solid rgba(0,0,0,0.2); box-shadow: 0 1px 2px rgba(0,0,0,0.08); flex-shrink: 0;"></span>
                                  <span>${escapeHtml(cl.color_name)}</span>
                                </button>
                              `;
                            }).join('')}
                          </div>
                          <select class="le-make-select" onchange="window.LE_MAKE.handleColorChange(Number(this.value))">
                            ${availableColors.map(cl => `
                              <option value="${cl.id}" ${state.selectedColor?.id === cl.id ? 'selected' : ''}>
                                ${escapeHtml(cl.color_name)} ${cl.color_code ? `(${cl.color_code})` : ''}
                              </option>
                            `).join('')}
                          </select>
                        `;
                      })() : `
                        <!-- Custom Color Input (Name Only, No Color Code) -->
                        <div style="background: rgba(249,115,22,0.06); border: 1px dashed var(--le-accent); border-radius: 6px; padding: 8px;">
                          <div style="font-size: 0.75rem; font-weight: 800; color: var(--le-accent); margin-bottom: 4px;">
                            🎨 Custom Color (Enter Color Name)
                          </div>
                          <input type="text" class="le-make-input" placeholder="e.g. Royal Navy Blue / Smoked Walnut"
                            value="${escapeHtml(state.customColorName || '')}"
                            oninput="window.LE_MAKE.state.customColorName = this.value" />
                        </div>
                      `}
                    </div>

                    <!-- Cost & Sale Price inputs -->
                    <div>
                      <label class="le-make-label">Cost Price (BDT ৳)</label>
                      <input type="number" min="0" class="le-make-input" placeholder="e.g. 15000"
                        value="${escapeHtml(state.itemCostPrice)}" oninput="window.LE_MAKE.state.itemCostPrice = this.value"
                        ${!user.canEditCost ? 'disabled' : ''} />
                    </div>

                    <div>
                      <label class="le-make-label">Sale Price (BDT ৳) ${user.canEditSale ? '' : '(Designer Set)'}</label>
                      <input type="number" min="0" class="le-make-input" placeholder="${user.canEditSale ? 'e.g. 22000' : '🔒 Set upon designer review'}"
                        value="${escapeHtml(state.itemSalePrice)}" oninput="window.LE_MAKE.state.itemSalePrice = this.value"
                        ${!user.canEditSale ? 'disabled' : ''} />
                    </div>

                    <!-- Quantity -->
                    <div>
                      <label class="le-make-label">Quantity</label>
                      <input type="number" min="1" class="le-make-input" value="${state.itemQty}"
                        oninput="window.LE_MAKE.state.itemQty = Number(this.value)" />
                    </div>
                  </div>

                  <!-- Remarks Input -->
                  <div style="margin-bottom: 12px;">
                    <label class="le-make-label">Remarks</label>
                    <input type="text" class="le-make-input" placeholder="e.g. Reinforced base, matte varnish, cable grommet"
                      value="${escapeHtml(state.itemNotes)}" oninput="window.LE_MAKE.state.itemNotes = this.value" />
                  </div>

                  <!-- Item-Level Technical Drawing / Photo Attachment -->
                  <div style="margin-bottom: 14px; padding: 12px; background: #f8fafc; border: 1px dashed var(--le-color-border); border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                      <div>
                        <label class="le-make-label" style="margin: 0; font-weight: 700;">
                          📎 Technical Drawing / Sketch / Photo for this Item <span style="font-weight: 400; color: var(--le-color-muted);">(Optional)</span>
                        </label>
                        <div style="font-size: 0.73rem; color: var(--le-color-muted); margin-top: 2px;">
                          Capture photo via camera or browse local image/blueprint (PDF, DWG, PNG, JPG).
                        </div>
                      </div>

                      <div style="display: flex; align-items: center; gap: 8px;">
                        <label class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin: 0;">
                          📷 Capture Photo
                          <input type="file" accept="image/*" capture="environment" style="display: none;"
                            onchange="window.LE_MAKE.handleItemFileSelected(event)" ${state.itemUploadingFile ? 'disabled' : ''} />
                        </label>

                        <label class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin: 0;">
                          📁 Browse Storage
                          <input type="file" accept="image/*,.pdf,.dwg,.dxf" style="display: none;"
                            onchange="window.LE_MAKE.handleItemFileSelected(event)" ${state.itemUploadingFile ? 'disabled' : ''} />
                        </label>
                      </div>
                    </div>

                    ${state.itemUploadingFile ? `
                      <div style="font-size: 0.78rem; color: var(--le-accent); font-weight: 600; margin-top: 8px;">
                        ⏳ Uploading attachment...
                      </div>
                    ` : ''}

                    ${state.itemAttachedFile ? `
                      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; padding: 6px 10px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; font-size: 0.78rem;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                          ${state.itemAttachedFile.file_url && state.itemAttachedFile.file_url.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? `
                            <a href="${escapeHtml(resolveMediaUrl(state.itemAttachedFile.file_url))}" target="_blank" rel="noopener noreferrer">
                              <img src="${escapeHtml(resolveMediaUrl(state.itemAttachedFile.file_url))}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; border: 1px solid #10b981;" alt="Preview" />
                            </a>
                          ` : '<span style="font-size: 1.2rem;">📐</span>'}
                          <div>
                            <span style="color: #065f46; font-weight: 700;">${escapeHtml(state.itemAttachedFile.file_name)}</span>
                            <span style="color: #047857; margin-left: 6px;">✓ Ready</span>
                          </div>
                        </div>
                        <button type="button" class="le-make-btn le-make-btn-sm" style="background: none; border: none; color: #dc2626; cursor: pointer; padding: 0 4px; font-weight: 700;" onclick="window.LE_MAKE.removeItemAttachedFile()">
                          ✕ Remove
                        </button>
                      </div>
                    ` : ''}
                  </div>

                  <div style="display: flex; justify-content: flex-end;">
                    <button type="button" class="le-make-btn le-make-btn-primary" onclick="window.LE_MAKE.handleAddToCart()">
                      ➕ Add Item to Order
                    </button>
                  </div>
                </div>
              ` : `
                <div style="text-align: center; padding: 1.5rem; color: var(--le-text-secondary); font-size: 0.88rem;">
                  Select a product from the catalog above to configure custom dimensions, colors, and quantities.
                </div>
              `}
            </div>
          ` : `
            <!-- Non-Catalog Item Mode -->
            <div style="background: #ffffff; border: 1px solid var(--le-border); border-radius: var(--le-radius-sm); padding: 1.25rem;">
              <h5 style="margin: 0 0 12px; font-size: 0.9rem; font-weight: 800;">
                Custom / Non-Catalog Product Specifications
              </h5>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px;">
                <div>
                  <label class="le-make-label">Custom Item Name *</label>
                  <input type="text" class="le-make-input" placeholder="e.g. Custom Executive Conference Table"
                    value="${escapeHtml(state.customItemName)}" oninput="window.LE_MAKE.state.customItemName = this.value" required />
                </div>

                <div>
                  <label class="le-make-label">Specifications &amp; Dimensions</label>
                  <input type="text" class="le-make-input" placeholder="e.g. 2400x1200x750mm, Black Oak"
                    value="${escapeHtml(state.customItemSpec)}" oninput="window.LE_MAKE.state.customItemSpec = this.value" />
                </div>

                <div>
                  <label class="le-make-label">Estimated Cost Price (BDT ৳)</label>
                  <input type="number" min="0" class="le-make-input" placeholder="e.g. 25000"
                    value="${escapeHtml(state.itemCostPrice)}" oninput="window.LE_MAKE.state.itemCostPrice = this.value"
                    ${!user.canEditCost ? 'disabled' : ''} />
                </div>

                <div>
                  <label class="le-make-label">Customer Sale Price (BDT ৳)</label>
                  <input type="number" min="0" class="le-make-input" placeholder="${user.canEditSale ? 'e.g. 35000' : '🔒 Set by Designer'}"
                    value="${escapeHtml(state.itemSalePrice)}" oninput="window.LE_MAKE.state.itemSalePrice = this.value"
                    ${!user.canEditSale ? 'disabled' : ''} />
                </div>

                <div>
                  <label class="le-make-label">Quantity</label>
                  <input type="number" min="1" class="le-make-input" value="${state.itemQty}"
                    oninput="window.LE_MAKE.state.itemQty = Number(this.value)" />
                </div>
              </div>

              <!-- Remarks Input for Non-Catalog Item -->
              <div style="margin-bottom: 12px;">
                <label class="le-make-label">Remarks</label>
                <input type="text" class="le-make-input" placeholder="e.g. Client requested wire pass-through"
                  value="${escapeHtml(state.itemNotes)}" oninput="window.LE_MAKE.state.itemNotes = this.value" />
              </div>

              <!-- Item-Level Technical Drawing / Photo Attachment for Non-Catalog Item -->
              <div style="margin-bottom: 14px; padding: 12px; background: #f8fafc; border: 1px dashed var(--le-color-border); border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div>
                    <label class="le-make-label" style="margin: 0; font-weight: 700;">
                      📎 Technical Drawing / Sketch / Photo for this Item <span style="font-weight: 400; color: var(--le-color-muted);">(Optional)</span>
                    </label>
                    <div style="font-size: 0.73rem; color: var(--le-color-muted); margin-top: 2px;">
                      Capture photo via camera or browse local image/blueprint (PDF, DWG, PNG, JPG).
                    </div>
                  </div>

                  <div style="display: flex; align-items: center; gap: 8px;">
                    <label class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin: 0;">
                      📷 Capture Photo
                      <input type="file" accept="image/*" capture="environment" style="display: none;"
                        onchange="window.LE_MAKE.handleItemFileSelected(event)" ${state.itemUploadingFile ? 'disabled' : ''} />
                    </label>

                    <label class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin: 0;">
                      📁 Browse Storage
                      <input type="file" accept="image/*,.pdf,.dwg,.dxf" style="display: none;"
                        onchange="window.LE_MAKE.handleItemFileSelected(event)" ${state.itemUploadingFile ? 'disabled' : ''} />
                    </label>
                  </div>
                </div>

                ${state.itemUploadingFile ? `
                  <div style="font-size: 0.78rem; color: var(--le-accent); font-weight: 600; margin-top: 8px;">
                    ⏳ Uploading attachment...
                  </div>
                ` : ''}

                ${state.itemAttachedFile ? `
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; padding: 6px 10px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; font-size: 0.78rem;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      ${state.itemAttachedFile.file_url && state.itemAttachedFile.file_url.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? `
                        <a href="${escapeHtml(resolveMediaUrl(state.itemAttachedFile.file_url))}" target="_blank" rel="noopener noreferrer">
                          <img src="${escapeHtml(resolveMediaUrl(state.itemAttachedFile.file_url))}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; border: 1px solid #10b981;" alt="Preview" />
                        </a>
                      ` : '<span style="font-size: 1.2rem;">📐</span>'}
                      <div>
                        <span style="color: #065f46; font-weight: 700;">${escapeHtml(state.itemAttachedFile.file_name)}</span>
                        <span style="color: #047857; margin-left: 6px;">✓ Ready</span>
                      </div>
                    </div>
                    <button type="button" class="le-make-btn le-make-btn-sm" style="background: none; border: none; color: #dc2626; cursor: pointer; padding: 0 4px; font-weight: 700;" onclick="window.LE_MAKE.removeItemAttachedFile()">
                      ✕ Remove
                    </button>
                  </div>
                ` : ''}
              </div>

              <div style="display: flex; justify-content: flex-end;">
                <button type="button" class="le-make-btn le-make-btn-primary" onclick="window.LE_MAKE.handleAddToCart()">
                  ➕ Add Custom Item
                </button>
              </div>
            </div>
          `}

          <!-- Cart Items Table with Customized Badge and Drawing Link -->
          ${state.cart.length > 0 ? `
            <div style="margin-top: 1.5rem; background: #fff; border: 1px solid var(--le-border); border-radius: var(--le-radius-sm); padding: 1rem;">
              <h5 style="margin: 0 0 10px; font-size: 0.88rem; font-weight: 800; text-transform: uppercase;">
                Items Added to Order (${state.cart.length})
              </h5>
              <table class="le-make-table">
                <thead>
                  <tr>
                    <th>Product / Spec</th>
                    <th>Dimensions</th>
                    <th>Color</th>
                    <th style="text-align: center;">Qty</th>
                    <th style="text-align: right;">Cost (৳)</th>
                    <th style="text-align: right;">Sale (৳)</th>
                    <th>Remarks</th>
                    <th>Attachment</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${state.cart.map(item => `
                    <tr style="${item.is_customized ? 'background: rgba(249,115,22,0.03);' : ''}">
                      <td>
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                          <strong>${escapeHtml(item.product_name)}</strong>
                          ${item.is_customized ? `<span style="padding: 2px 6px; border-radius: 4px; background: rgba(249,115,22,0.15); color: var(--le-accent); border: 1px solid rgba(249,115,22,0.3); font-size: 0.7rem; font-weight: 800;">✨ Customized</span>` : ''}
                        </div>
                        ${item.spec_name ? `<div style="font-size:0.75rem;color:var(--le-text-secondary);">${escapeHtml(item.spec_name)}</div>` : ''}
                      </td>
                      <td style="${item.is_customized ? 'color: var(--le-accent); font-weight: 600;' : ''}">${escapeHtml(item.dimensions_text)}</td>
                      <td>
                        <div style="display: flex; align-items: center; gap: 6px;">
                          ${item.color_code ? `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${escapeHtml(item.color_code)}; border: 1px solid rgba(0,0,0,0.2);"></span>` : ''}
                          <span>${escapeHtml(item.color_name || '—')}</span>
                        </div>
                      </td>
                      <td style="text-align: center; font-weight: 700;">${item.quantity}</td>
                      <td style="text-align: right; font-weight: 600;">৳${Number(item.item_cost_price || 0).toLocaleString()}</td>
                      <td style="text-align: right; font-weight: 600;">${item.item_sale_price ? `৳${Number(item.item_sale_price).toLocaleString()}` : '<span style="color:#94a3b8;font-style:italic;">Pending</span>'}</td>
                      <td style="font-size: 0.8rem; color: var(--le-text-secondary);">${escapeHtml(item.notes || '—')}</td>
                      <td>
                        ${item.technical_drawing_url ? `
                          <a href="${escapeHtml(resolveMediaUrl(item.technical_drawing_url))}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; color: var(--le-accent); font-weight: 700; font-size: 0.75rem; text-decoration: underline;">
                            📐 ${escapeHtml(item.technical_drawing_name || 'Drawing')}
                          </a>
                        ` : `<span style="color: var(--le-color-muted); font-size: 0.72rem; font-style: italic;">None</span>`}
                      </td>
                      <td style="text-align: right;">
                        <button class="le-make-btn le-make-btn-danger le-make-btn-sm" onclick="window.LE_MAKE.handleRemoveCartItem('${item._id}')">
                          Remove
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>

        <!-- ── 3. ORDER LOGISTICS & DEADLINES ── -->
        <div style="margin-bottom: 2rem;">
          <h4 class="le-make-section-title">3. Order Logistics &amp; Deadlines</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 14px;">
            <div class="le-make-form-group">
              <label class="le-make-label">Priority</label>
              <select class="le-make-select" onchange="window.LE_MAKE.state.customer.priority = this.value">
                <option value="Normal" ${state.customer.priority === 'Normal' ? 'selected' : ''}>Normal</option>
                <option value="High" ${state.customer.priority === 'High' ? 'selected' : ''}>High</option>
                <option value="Urgent" ${state.customer.priority === 'Urgent' ? 'selected' : ''}>Urgent</option>
                <option value="Low" ${state.customer.priority === 'Low' ? 'selected' : ''}>Low</option>
              </select>
            </div>

            <div class="le-make-form-group">
                <label class="le-make-label">Targeted Delivery Day * <span style="color: var(--le-danger);">(Working Days — Fridays Excluded)</span></label>
                <input type="number" min="1" max="365" class="le-make-input" placeholder="e.g. 15 (number of working days)"
                  value="${escapeHtml(state.customer.targetDeliveryDays || '')}"
                  oninput="window.LE_MAKE.handleDeliveryDaysChange(this.value)" required />
                <div style="font-size: 0.76rem; color: var(--le-accent); font-weight: 600; margin-top: 4px;">
                  ${state.customer.targetDeliveryDate ? `📅 Est. Delivery: ${new Date(state.customer.targetDeliveryDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })} <span style="color: var(--le-color-muted); font-weight: 400;">(${state.customer.targetDeliveryDays} working days, Fridays excluded)</span>` : '💡 Enter the number of working days for turnaround. Fridays (weekend) are automatically excluded.'}
                </div>
              </div>

            <div class="le-make-form-group">
              <label class="le-make-label">Requested Delivery Date <span style="color: var(--le-color-muted);">(Optional)</span></label>
              <input type="date" class="le-make-input" value="${escapeHtml(state.customer.requestedDeliveryDate)}"
                oninput="window.LE_MAKE.state.customer.requestedDeliveryDate = this.value" />
            </div>
          </div>

          <!-- Special Instructions Textarea -->
          <div class="le-make-form-group" style="margin-bottom: 14px;">
            <label class="le-make-label">Special Instructions &amp; Production Notes</label>
            <textarea class="le-make-textarea" rows="2" placeholder="e.g. Special packaging, site lift delivery, handle finishes..."
              oninput="window.LE_MAKE.state.customer.instructions = this.value">${escapeHtml(state.customer.instructions || '')}</textarea>
          </div>
        </div>

        <!-- Submit Button -->
        <button id="le-make-submit-order-btn" class="le-make-btn le-make-btn-primary" style="width: 100%; padding: 14px; font-size: 1rem; font-weight: 700;" onclick="window.LE_MAKE.handleSubmitOrder(event)">
          Submit Production Order (${state.cart.length} Items)
        </button>
      </div>
    `;
  }

  function renderTrackOrdersView() {
    const filtered = state.statusFilter === 'All' 
      ? state.orders 
      : state.orders.filter(o => o.status === state.statusFilter);

    return `
      ${renderStats()}

      <div class="le-make-panel">
        
        <!-- Filter Tabs -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 1.5rem;">
          ${['All', 'Placed', 'Work in process', 'Production On Going', 'Primary QC', 'Color Ongoing', 'QC Final', 'Packaging', 'Ready to Ship', 'Delivered'].map(s => `
            <button class="le-make-btn ${state.statusFilter === s ? 'le-make-btn-primary' : 'le-make-btn-secondary'} le-make-btn-sm" onclick="window.LE_MAKE.setStatusFilter('${s}')">
              ${s}
            </button>
          `).join('')}
        </div>

        ${filtered.length === 0 ? `
          <div style="text-align: center; padding: 3rem; color: var(--le-color-muted);">
            No orders found matching the filter.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 14px;">
            ${filtered.map(o => `
              <div style="border: 1px solid ${o.approval_status === 'modification_pending_approval' ? 'rgba(255,106,0,0.4)' : 'var(--le-color-border)'}; border-radius: var(--le-radius); padding: 1.25rem; background: ${o.approval_status === 'modification_pending_approval' ? '#fffaf7' : '#ffffff'}; box-shadow: var(--le-shadow-subtle);">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
                  <div>
                    <span style="font-family: var(--le-font-mono); font-weight: 700; color: var(--le-accent); font-size: 0.95rem; margin-right: 8px;">${escapeHtml(o.order_number || `#${o.id}`)}</span>
                    <strong style="font-size: 1.05rem; font-family: var(--le-font-sans); color: var(--le-color-dark);">${escapeHtml(o.furniture_name)}</strong>
                    <span style="margin-left: 8px;">${renderApprovalBadge(o.approval_status, o.current_version)}</span>
                  </div>

                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${(o.approval_status === 'modification_pending_approval' || o.approval_status === 'priced') ? `
                      <button class="le-make-btn le-make-btn-primary le-make-btn-sm" onclick="window.LE_MAKE.openDiffModal(${JSON.stringify(o).replace(/"/g, '&quot;')})">
                        🔍 Review Version v${o.current_version} Diff &amp; Approve
                      </button>
                    ` : `
                      <button class="le-make-btn le-make-btn-secondary le-make-btn-sm" onclick="window.LE_MAKE.openDiffModal(${JSON.stringify(o).replace(/"/g, '&quot;')})">
                        Version History (v${o.current_version || 1})
                      </button>
                    `}
                    <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="display: inline-flex; align-items: center; gap: 4px;" onclick="window.LE_MAKE.openOrderAttach(${o.id})">
                      📎 Attach File / Image
                    </button>
                    ${(state.user?.isAdmin || state.user?.isFactoryManager || state.user?.canUpdateProduction) ? `
                      <button type="button" class="le-make-btn le-make-btn-sm" style="background: #0284c7; color: #ffffff; border: none;" onclick="window.LE_MAKE.openStageUpdate(${JSON.stringify(o).replace(/"/g, '&quot;')})">
                        🏭 Update Stage &amp; Photos
                      </button>
                    ` : ''}
                  </div>
                </div>

                <!-- Order Details Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 0.82rem; color: var(--le-color-muted); margin-bottom: 10px;">
                  <div>Customer: <strong style="color: var(--le-color-dark);">${escapeHtml(o.customer_name || '—')}</strong> (${escapeHtml(o.customer_phone || '')})</div>
                  <div>Landmark: <strong style="color: var(--le-accent);">📍 ${escapeHtml(o.location_landmark || 'None')}</strong></div>
                  <div>Ref Bill No: <strong style="color: var(--le-color-dark); font-family: var(--le-font-mono);">${escapeHtml(o.reference_bill_no || '—')}</strong></div>
                  <div>Target Delivery: <strong>${(o.target_delivery_date || o.delivery_date) ? new Date(o.target_delivery_date || o.delivery_date).toLocaleDateString() : 'TBD'}</strong> ${o.target_delivery_days ? `<span style="color: var(--le-accent); font-weight: 700;">(${o.target_delivery_days} days turnaround)</span>` : ''}</div>
                  ${o.requested_delivery_date ? `<div>Req. Delivery: <strong style="color: var(--le-accent);">${new Date(o.requested_delivery_date).toLocaleDateString()}</strong></div>` : ''}
                  <div>Sale Price: <strong style="color: var(--le-success);">${o.sale_price ? `৳${Number(o.sale_price).toLocaleString()}` : 'Pending Pricing'}</strong></div>
                  <div>Production Stage: <strong style="color: #0284c7;">${escapeHtml(o.status || 'Placed')}</strong></div>
                </div>

                <!-- Miniature Sequential Stage Stepper in Order Card -->
                <div style="display: flex; gap: 4px; overflow-x: auto; margin: 4px 0 10px; padding: 4px 0;">
                  ${PRODUCTION_STAGES.map((st, sIdx) => {
                    const oIdx = PRODUCTION_STAGES.indexOf(o.status);
                    const isDone = oIdx >= 0 && sIdx < oIdx;
                    const isCur = sIdx === oIdx;
                    return `
                      <div style="white-space: nowrap; font-size: 0.68rem; padding: 2px 7px; border-radius: 4px; ${isDone ? 'background: #dcfce7; color: #15803d; font-weight: 600;' : (isCur ? 'background: #0284c7; color: #ffffff; font-weight: 700;' : 'background: #f1f5f9; color: #94a3b8;')}">
                        ${isDone ? '✓' : (sIdx + 1)}. ${st}
                      </div>
                    `;
                  }).join('')}
                </div>

                <!-- Latest Production Stage Photo if present -->
                ${o.current_stage_photo ? `
                  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px; padding: 8px 12px; background: rgba(2, 132, 199, 0.05); border: 1px solid rgba(2, 132, 199, 0.18); border-radius: 8px;">
                    <a href="${escapeHtml(resolveMediaUrl(o.current_stage_photo))}" target="_blank" rel="noopener noreferrer" title="View Full Stage Photo">
                      <img src="${escapeHtml(resolveMediaUrl(o.current_stage_photo))}" class="le-make-stage-thumb" alt="Stage Photo" onerror="this.style.display='none'" />
                    </a>
                    <div style="font-size: 0.8rem; color: #0369a1;">
                      <div>Latest Progress Photo: <strong style="color: #0f172a;">${escapeHtml(o.status || 'In Production')}</strong></div>
                      ${o.factory_manager_name ? `<div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">Updated by: <strong>${escapeHtml(o.factory_manager_name)}</strong></div>` : ''}
                    </div>
                  </div>
                ` : ''}

                <!-- Order-Level File / Image Attachment Workbench (Designer, Admin, Salesman) -->
                ${(state.activeOrderAttachId === o.id) ? `
                  <div class="le-make-stage-card" style="border-left: 4px solid var(--le-accent); margin-bottom: 12px; background: #fffcf8;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.25rem;">📎</span>
                        <h4 style="margin: 0; font-size: 1rem; color: var(--le-color-dark); font-family: var(--le-font-sans); font-weight: 700;">
                          Attach File / Image to Order ${escapeHtml(o.order_number || `#${o.id}`)}
                        </h4>
                      </div>
                      <button type="button" style="background:none; border:none; font-size: 16px; cursor:pointer; color: #64748b;" onclick="window.LE_MAKE.closeOrderAttach()">✕ Close</button>
                    </div>

                    ${state.orderAttachForm.error ? `
                      <div style="background: rgba(220,38,38,0.08); color: #dc2626; border: 1px solid rgba(220,38,38,0.25); border-radius: 6px; padding: 8px 12px; font-size: 0.82rem; margin-bottom: 12px;">
                        ${escapeHtml(state.orderAttachForm.error)}
                      </div>
                    ` : ''}

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 12px;">
                      <div>
                        <label class="le-make-label" style="font-weight: 700;">Select Document or Snap Photo *</label>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                          <label class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin: 0;">
                            📷 Capture Photo
                            <input type="file" accept="image/*" capture="environment" style="display: none;"
                              onchange="window.LE_MAKE.handleOrderAttachFileSelected(event)" ${state.orderAttachForm.uploading ? 'disabled' : ''} />
                          </label>
                          <label class="le-make-btn le-make-btn-secondary le-make-btn-sm" style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin: 0;">
                            📁 Browse Storage
                            <input type="file" accept="image/*,.pdf,.dwg,.doc,.docx" style="display: none;"
                              onchange="window.LE_MAKE.handleOrderAttachFileSelected(event)" ${state.orderAttachForm.uploading ? 'disabled' : ''} />
                          </label>

                          ${state.orderAttachForm.uploading ? `
                            <span style="font-size: 0.78rem; color: var(--le-accent); font-weight: 600;">⏳ Uploading...</span>
                          ` : (state.orderAttachForm.fileUrl ? `
                            <span style="font-size: 0.78rem; color: var(--le-success); font-weight: 600;">✓ Ready (${escapeHtml(state.orderAttachForm.fileName || 'Attached')})</span>
                          ` : '')}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--le-color-muted); margin-top: 4px;">
                          Available for Designer, Admin &amp; Salesman. Accepts PDF, DWG blueprints, PNG, JPG (max 20MB).
                        </div>
                      </div>

                      <div>
                        <label class="le-make-label" style="font-weight: 700;">Remarks / Description (Optional)</label>
                        <input type="text" class="le-make-input" placeholder="e.g. Approved shop drawing, customer fabric sample"
                          value="${escapeHtml(state.orderAttachForm.note || '')}"
                          oninput="window.LE_MAKE.state.orderAttachForm.note = this.value" />
                      </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px;">
                      <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" onclick="window.LE_MAKE.closeOrderAttach()">
                        Cancel
                      </button>
                      <button type="button" class="le-make-btn le-make-btn-primary le-make-btn-sm"
                        onclick="window.LE_MAKE.handleOrderAttachSubmit(${o.id})" ${state.orderAttachForm.saving || state.orderAttachForm.uploading ? 'disabled' : ''}>
                        ${state.orderAttachForm.saving ? '⏳ Saving...' : '💾 Save Attachment to Order'}
                      </button>
                    </div>
                  </div>
                ` : ''}

                <!-- Order Attachments & Files Gallery -->
                ${(() => {
                  const attachments = [];
                  if (Array.isArray(o.pdf_urls)) {
                    o.pdf_urls.forEach(u => {
                      if (u && !attachments.some(a => a.url === u)) {
                        attachments.push({ url: u, title: 'Document / Drawing', note: '' });
                      }
                    });
                  }
                  if (Array.isArray(o.updates)) {
                    o.updates.forEach(up => {
                      if (up.photo_url && !attachments.some(a => a.url === up.photo_url)) {
                        attachments.push({
                          url: up.photo_url,
                          title: up.stage_name || 'Attached File',
                          note: up.update_note || '',
                          created_at: up.created_at
                        });
                      }
                    });
                  }

                  if (attachments.length === 0) return '';

                  return `
                    <div style="margin: 8px 0 10px; padding: 8px 12px; background: #f8fafc; border: 1px solid var(--le-color-border-subtle); border-radius: 8px;">
                      <div style="font-size: 0.78rem; font-weight: 700; color: var(--le-color-dark); margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
                        <span>📎 Order Attachments &amp; Drawings (${attachments.length}):</span>
                      </div>
                      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${attachments.map(att => {
                          const resolved = resolveMediaUrl(att.url);
                          const isImg = resolved.match(/\\.(jpeg|jpg|png|gif|webp)(\\?.*)?$/i);
                          return `
                            <div style="display: inline-flex; align-items: center; gap: 6px; background: #ffffff; border: 1px solid var(--le-color-border); border-radius: 6px; padding: 4px 8px; font-size: 0.75rem;">
                              ${isImg ? `
                                <a href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer" title="View image">
                                  <img src="${escapeHtml(resolved)}" style="width: 22px; height: 22px; object-fit: cover; border-radius: 4px; border: 1px solid #cbd5e1;" onerror="this.style.display='none'" />
                                </a>
                              ` : `<span>📄</span>`}
                              <a href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer" style="color: var(--le-accent); font-weight: 600; text-decoration: underline; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${escapeHtml(att.note ? att.note : (att.title || 'View File'))}
                              </a>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                  `;
                })()}

                <!-- Factory Manager Stage Update Workbench Card -->
                ${(state.activeStageUpdateOrder?.id === o.id) ? `
                  <div class="le-make-stage-card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.25rem;">🏭</span>
                        <h4 style="margin: 0; font-size: 1rem; color: #0369a1; font-family: var(--le-font-sans); font-weight: 700;">
                          Factory Production Progress Workbench
                        </h4>
                      </div>
                      <button type="button" style="background:none; border:none; font-size: 16px; cursor:pointer; color: #64748b;" onclick="window.LE_MAKE.closeStageUpdate()">✕ Close</button>
                    </div>

                    ${state.stageUpdateForm.error ? `
                      <div style="background: rgba(220,38,38,0.08); color: #dc2626; border: 1px solid rgba(220,38,38,0.25); border-radius: 6px; padding: 8px 12px; font-size: 0.82rem; margin-bottom: 12px;">
                        ${escapeHtml(state.stageUpdateForm.error)}
                      </div>
                    ` : ''}

                    <!-- Interactive Visual Sequential Stepper -->
                    <div style="display: flex; gap: 6px; overflow-x: auto; padding: 8px 4px 12px 4px; margin-bottom: 12px; border-bottom: 1px dashed rgba(2, 132, 199, 0.2);">
                      ${PRODUCTION_STAGES.map((st, idx) => {
                        const curIdx = PRODUCTION_STAGES.indexOf(o.status);
                        const isCompleted = curIdx >= 0 && idx < curIdx;
                        const isCurrent = idx === curIdx;
                        const isNext = (curIdx === -1 && idx === 0) || (idx === curIdx + 1);
                        let bg = '#f8fafc';
                        let color = '#94a3b8';
                        let border = '1px solid #cbd5e1';
                        let icon = `${idx + 1}`;
                        if (isCompleted) {
                          bg = '#ecfdf5';
                          color = '#059669';
                          border = '1px solid #10b981';
                          icon = '✓';
                        } else if (isCurrent) {
                          bg = '#eff6ff';
                          color = '#0284c7';
                          border = '2px solid #0284c7';
                          icon = '●';
                        } else if (isNext) {
                          bg = '#fff7ed';
                          color = '#ea580c';
                          border = '2px dashed #ea580c';
                          icon = '➔';
                        }
                        return `
                          <div style="flex: 1; min-width: 95px; background: ${bg}; border: ${border}; border-radius: 6px; padding: 6px 8px; font-size: 0.72rem; text-align: center; color: ${color}; display: flex; flex-direction: column; align-items: center; gap: 2px;">
                            <span style="font-weight: 800; font-size: 0.78rem;">${icon} Stage ${idx + 1}</span>
                            <span style="font-weight: 600; line-height: 1.1;">${escapeHtml(st)}</span>
                            <span style="font-size: 0.65rem; text-transform: uppercase; font-weight: 700; margin-top: 2px;">
                              ${isCompleted ? 'Done' : (isCurrent ? 'Active' : (isNext ? 'Next Allowed' : 'Locked'))}
                            </span>
                          </div>
                        `;
                      }).join('')}
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 12px;">
                      <div>
                        <label class="le-make-label" style="font-weight: 700; color: #0f172a;">Production Stage * (Sequential Progression)</label>
                        <select class="le-make-select" onchange="window.LE_MAKE.state.stageUpdateForm.stage = this.value; window.LE_MAKE.render();">
                          ${PRODUCTION_STAGES.map((st, idx) => {
                            const curIdx = PRODUCTION_STAGES.indexOf(o.status);
                            const isPast = curIdx >= 0 && idx < curIdx;
                            const isCurrent = idx === curIdx;
                            const isNext = (curIdx === -1 && idx === 0) || (idx === curIdx + 1);
                            const isLocked = !isPast && !isCurrent && !isNext;

                            let label = `${idx + 1}. ${st}`;
                            if (isCurrent) label += ' (Current Stage - add photo/remarks)';
                            else if (isNext) label += ' ➔ (Next Sequential Stage) [Allowed]';
                            else if (isPast) label += ' ✓ (Completed)';
                            else if (isLocked) label += ' 🔒 (Locked: Sequential)';

                            return `<option value="${st}" ${state.stageUpdateForm.stage === st ? 'selected' : ''} ${isLocked ? 'disabled' : ''}>${label}</option>`;
                          }).join('')}
                        </select>
                      </div>

                      <div>
                        <label class="le-make-label" style="font-weight: 700; color: #0f172a;">
                          ${isMobileDevice() ? '📷 Snap Stage Photo (Direct Camera)' : '📁 Upload Stage Photo (Stored Image)'}
                        </label>
                        <div style="display: flex; align-items: center; gap: 10px;">
                          <label class="le-make-camera-btn">
                            ${state.stageUpdateForm.uploading ? '⏳ Uploading...' : (isMobileDevice() ? '📷 Open Camera' : '📁 Browse Image')}
                            <input type="file" style="display: none;" 
                              accept="image/*" 
                              ${isMobileDevice() ? 'capture="environment"' : ''} 
                              onchange="window.LE_MAKE.handleStagePhotoSelected(event)" 
                              ${state.stageUpdateForm.uploading ? 'disabled' : ''} />
                          </label>
                          ${state.stageUpdateForm.previewUrl ? `
                            <a href="${escapeHtml(state.stageUpdateForm.previewUrl)}" target="_blank" rel="noopener noreferrer">
                              <img src="${escapeHtml(state.stageUpdateForm.previewUrl)}" class="le-make-stage-thumb" style="width: 44px; height: 44px;" alt="Preview" />
                            </a>
                            <span style="font-size: 0.75rem; color: var(--le-success); font-weight: 600;">✓ Ready</span>
                          ` : ''}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--le-color-muted); margin-top: 4px;">
                          ${isMobileDevice() ? 'Mobile detected: directly opens camera for live snap.' : 'PC detected: choose existing image from device.'}
                        </div>
                      </div>
                    </div>

                    <div style="margin-bottom: 12px;">
                      <label class="le-make-label" style="font-weight: 700; color: #0f172a;">Progress Notes / Remarks</label>
                      <textarea class="le-make-textarea" rows="2" placeholder="e.g. Frame fabrication completed, moving to powder coat booth..."
                        oninput="window.LE_MAKE.state.stageUpdateForm.note = this.value">${escapeHtml(state.stageUpdateForm.note)}</textarea>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 8px;">
                      <button type="button" class="le-make-btn le-make-btn-secondary le-make-btn-sm" onclick="window.LE_MAKE.closeStageUpdate()">
                        Cancel
                      </button>
                      <button type="button" class="le-make-btn le-make-btn-primary le-make-btn-sm" style="background: #0284c7;"
                        onclick="window.LE_MAKE.handleStageSubmit(${o.id})" ${state.stageUpdateForm.saving || state.stageUpdateForm.uploading ? 'disabled' : ''}>
                        ${state.stageUpdateForm.saving ? '⏳ Saving...' : '📢 Save Stage &amp; Broadcast Alert'}
                      </button>
                    </div>
                  </div>
                ` : ''}

                <!-- Multi-Item breakdown if present -->
                ${(o.items && o.items.length > 0) ? `
                  <div style="background: var(--le-color-bg-alt); border-radius: 8px; padding: 10px 12px; font-size: 0.82rem; border: 1px solid var(--le-color-border-subtle); display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-weight: 700; color: var(--le-color-dark);">
                      Customized Product Items (${o.items.length}):
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                      ${o.items.map(it => {
                        const rawDrawing = it.technical_drawing_url 
                          ? it.technical_drawing_url
                          : (Array.isArray(it.pdf_urls) && it.pdf_urls.length > 0 ? it.pdf_urls[0] : null);
                        const drawingUrl = rawDrawing ? resolveMediaUrl(rawDrawing) : null;
                        return `
                          <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--le-color-border-subtle); flex-wrap: wrap; gap: 6px;">
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                              <strong style="color: var(--le-color-dark);">${escapeHtml(it.product_name)}</strong>
                              ${it.is_customized ? `<span class="le-make-badge-customized" style="font-size: 0.68rem; padding: 1px 6px;">[Custom Size]</span>` : ''}
                              <span style="color: var(--le-color-muted); font-size: 0.78rem;">(${escapeHtml(it.custom_dimensions || it.dimensions_text || it.size_label || 'Standard')})</span>
                              ${it.color_name ? `<span style="font-size: 0.75rem; color: #475569; background: #f1f5f9; padding: 1px 6px; border-radius: 4px;">🎨 ${escapeHtml(it.color_name)}</span>` : ''}
                              ${it.item_notes ? `<span style="font-size: 0.75rem; color: var(--le-color-muted); font-style: italic;">Remarks: "${escapeHtml(it.item_notes)}"</span>` : ''}
                              <span style="font-weight: 700; background: var(--le-color-bg-alt); padding: 1px 6px; border-radius: 10px; font-size: 0.75rem;">${it.quantity}x</span>
                              ${it.item_sale_price ? `<span style="color: var(--le-success); font-weight: 600; font-size: 0.78rem;">৳${Number(it.item_sale_price).toLocaleString()} / unit</span>` : ''}
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                              ${drawingUrl ? `
                                <a href="${escapeHtml(drawingUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; color: var(--le-accent); font-weight: 700; font-size: 0.75rem; text-decoration: underline; background: rgba(255,106,0,0.08); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(255,106,0,0.2);">
                                  📐 View Drawing / Photo
                                </a>
                              ` : `<span style="color: var(--le-color-muted); font-size: 0.72rem; font-style: italic;">No drawing</span>`}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  function renderHistoryModal() {
    if (!state.historyModalOpen || !state.historyModalProduct) return '';

    const prod = state.historyModalProduct;
    const history = state.historyData;

    return `
      <div class="le-make-modal-backdrop" onclick="if(event.target === this) window.LE_MAKE.closeHistoryModal()">
        <div class="le-make-modal" style="max-width: 750px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--le-color-border); padding-bottom: 14px; margin-bottom: 16px;">
            <div>
              <h3 class="le-make-modal-title">
                📊 Purchase &amp; Customization History
              </h3>
              <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--le-color-muted);">
                ${escapeHtml(prod.product_name)} (<span style="font-family: var(--le-font-mono); color: var(--le-accent); font-weight: 700;">${escapeHtml(prod.product_code || 'CODE')}</span>)
              </p>
            </div>
            <button style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--le-color-muted);" onclick="window.LE_MAKE.closeHistoryModal()">✕</button>
          </div>

          ${state.historyLoading ? `
            <div class="le-make-loading-screen">
              <div class="le-make-spinner"></div>
              <p>Fetching purchase history from database...</p>
            </div>
          ` : `
            <div>
              <!-- Stats summary cards -->
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 18px;">
                <div style="background: var(--le-color-bg-alt); border: 1px solid var(--le-color-border); border-radius: 8px; padding: 14px; text-align: center;">
                  <div style="font-size: 1.35rem; font-weight: 800; color: var(--le-color-dark); font-family: var(--le-font-serif);">${history?.total_ordered || 0}</div>
                  <div style="font-size: 0.72rem; color: var(--le-color-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-top: 4px;">Total Units Ordered</div>
                </div>
                <div style="background: #fffaf7; border: 1px solid rgba(255,106,0,0.25); border-radius: 8px; padding: 14px; text-align: center;">
                  <div style="font-size: 1.35rem; font-weight: 800; color: var(--le-accent); font-family: var(--le-font-serif);">${history?.customized_count || 0}</div>
                  <div style="font-size: 0.72rem; color: #c2410c; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-top: 4px;">Customized Units</div>
                </div>
                <div style="background: var(--le-success-bg); border: 1px solid rgba(22,163,74,0.2); border-radius: 8px; padding: 14px; text-align: center;">
                  <div style="font-size: 1.35rem; font-weight: 800; color: var(--le-success); font-family: var(--le-font-serif);">${history?.order_count || 0}</div>
                  <div style="font-size: 0.72rem; color: var(--le-success); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-top: 4px;">Total Orders</div>
                </div>
              </div>

              <!-- History Table -->
              <h4 style="margin: 0 0 10px; font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--le-color-muted);">
                Historical Orders Log
              </h4>
              ${(!history?.history || history.history.length === 0) ? `
                <p style="text-align: center; color: var(--le-color-muted); padding: 2rem 0;">No purchase records found for this product.</p>
              ` : `
                <div class="le-make-table-container" style="max-height: 280px; overflow-y: auto;">
                  <table class="le-make-table">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Date</th>
                        <th>Dimensions</th>
                        <th>Qty</th>
                        <th>Customized?</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${history.history.map(h => `
                        <tr>
                          <td><code style="font-family: var(--le-font-mono); font-weight: 700; color: var(--le-accent); font-size: 0.85rem;">${escapeHtml(h.order_number)}</code></td>
                          <td>${escapeHtml(h.customer_name)}</td>
                          <td>${h.order_date ? new Date(h.order_date).toLocaleDateString() : '—'}</td>
                          <td style="${h.is_customized ? 'color: var(--le-accent); font-weight: 600;' : ''}">${escapeHtml(h.custom_dimensions || 'Standard')}</td>
                          <td style="font-weight: 700; text-align: center;">${h.quantity}</td>
                          <td>
                            ${h.is_customized ? `<span class="le-make-badge-customized">✨ Custom</span>` : `<span style="color: var(--le-color-light); font-size: 0.75rem;">Standard</span>`}
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              `}
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderDiffModal() {
    if (!state.diffModalOpen || !state.activeDiffOrder) return '';

    const order = state.activeDiffOrder;
    const diff = state.diffData;

    return `
      <div class="le-make-modal-backdrop" onclick="if(event.target === this) window.LE_MAKE.closeDiffModal()">
        <div class="le-make-modal">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--le-color-border); padding-bottom: 14px; margin-bottom: 16px;">
            <div>
              <h3 class="le-make-modal-title">
                Version Approval: ${escapeHtml(order.furniture_name)}
              </h3>
              <p style="margin: 3px 0 0; font-size: 0.82rem; color: var(--le-color-muted);">
                Active Version: <strong>v${order.current_version || 1}</strong> | Previously Approved: <strong>v${order.approved_version || 'None'}</strong>
              </p>
            </div>
            <button style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--le-color-muted);" onclick="window.LE_MAKE.closeDiffModal()">✕</button>
          </div>

          ${state.diffLoading ? `
            <div class="le-make-loading-screen">
              <div class="le-make-spinner"></div>
              <p>Calculating side-by-side technical differences...</p>
            </div>
          ` : `
            <div>
              <div style="background: rgba(255,106,0,0.08); border: 1px solid rgba(255,106,0,0.25); border-radius: var(--le-radius-sm); padding: 12px 16px; margin-bottom: 16px; font-size: 0.85rem; color: #c2410c;">
                <strong>Designer Action Notice:</strong> The furniture designer has reviewed this order and set specifications/pricing. Review before approving.
              </div>

              ${diff?.fieldChanges && diff.fieldChanges.length > 0 ? `
                <div style="margin-bottom: 16px;">
                  <h4 class="le-make-section-title" style="font-size: 0.95rem; margin-bottom: 8px;">Modified Order Fields</h4>
                  <div class="le-make-table-container">
                    <table class="le-make-table">
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th style="color: var(--le-danger);">Previous (v${diff.version_from})</th>
                          <th style="color: var(--le-success);">Updated (v${diff.version_to})</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${diff.fieldChanges.map(ch => `
                          <tr>
                            <td><strong>${escapeHtml(ch.field.replace(/_/g, ' '))}</strong></td>
                            <td style="background: rgba(220,38,38,0.04); color: var(--le-danger);">${escapeHtml(String(ch.old_value || '—'))}</td>
                            <td style="background: rgba(22,163,74,0.04); color: var(--le-success); font-weight: 700;">${escapeHtml(String(ch.new_value || '—'))}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              ` : `
                <p style="font-size: 0.85rem; color: var(--le-color-muted); margin-bottom: 16px;">
                  No conflicting field differences found. Technical specifications and pricing have been validated.
                </p>
              `}

              <!-- Multi-Item breakdown with technical blueprints & unit sale prices -->
              ${(order.items && order.items.length > 0) ? `
                <div style="margin-bottom: 16px;">
                  <h4 class="le-make-section-title" style="font-size: 0.95rem; margin-bottom: 8px;">Product Items &amp; Technical Drawings (${order.items.length})</h4>
                  <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${order.items.map(it => {
                      const rawDrawing = it.technical_drawing_url 
                        ? it.technical_drawing_url
                        : (Array.isArray(it.pdf_urls) && it.pdf_urls.length > 0 ? it.pdf_urls[0] : null);
                      const drawingUrl = rawDrawing ? resolveMediaUrl(rawDrawing) : null;
                      return `
                        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--le-color-bg-alt); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--le-color-border-subtle); flex-wrap: wrap; gap: 8px;">
                          <div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                              <strong style="color: var(--le-color-dark);">${escapeHtml(it.product_name)}</strong>
                              ${it.is_customized ? `<span class="le-make-badge-customized" style="font-size: 0.68rem; padding: 1px 6px;">Custom Size</span>` : ''}
                              <span style="font-weight: 700; background: #ffffff; padding: 1px 6px; border-radius: 10px; font-size: 0.75rem;">${it.quantity}x</span>
                            </div>
                            <div style="font-size: 0.78rem; color: var(--le-color-muted); margin-top: 2px;">
                              Dimensions: <span style="color: ${it.is_customized ? 'var(--le-accent)' : 'inherit'}; font-weight: ${it.is_customized ? '700' : '400'};">${escapeHtml(it.custom_dimensions || it.dimensions_text || it.size_label || 'Standard')}</span>
                              ${it.spec_name ? ` &bull; Spec: ${escapeHtml(it.spec_name)}` : ''}
                              ${it.color_name ? ` &bull; Color: ${escapeHtml(it.color_name)}` : ''}
                            </div>
                            ${it.designer_notes ? `<div style="font-size: 0.75rem; color: #6366f1; margin-top: 2px; font-style: italic;">Designer Note: ${escapeHtml(it.designer_notes)}</div>` : ''}
                          </div>
                          <div style="display: flex; align-items: center; gap: 10px;">
                            ${it.item_sale_price ? `<div style="text-align: right;"><div style="font-size: 0.72rem; color: var(--le-color-muted);">Unit Sale</div><strong style="color: var(--le-success); font-size: 0.88rem;">৳${Number(it.item_sale_price).toLocaleString()}</strong></div>` : ''}
                            ${drawingUrl ? `
                              <a href="${escapeHtml(drawingUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; color: var(--le-accent); font-weight: 700; font-size: 0.75rem; text-decoration: underline; background: rgba(255,106,0,0.08); padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(255,106,0,0.2);">
                                📐 Blueprint
                              </a>
                            ` : `<span style="color: var(--le-color-muted); font-size: 0.72rem; font-style: italic;">No blueprint</span>`}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- Pricing Summary -->
              <div class="le-make-subpanel" style="margin-bottom: 20px;">
                <div style="font-size: 0.95rem; font-weight: 700; color: var(--le-color-dark);">
                  Customer Sale Price: <strong style="color: var(--le-success);">${order.sale_price ? `৳${Number(order.sale_price).toLocaleString()}` : 'Awaiting Final Pricing'}</strong>
                </div>
              </div>

              <!-- Approval Action Buttons -->
              <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button class="le-make-btn le-make-btn-danger" onclick="window.LE_MAKE.handleRejectVersion(${order.id}, ${order.current_version})">
                  ✕ Request Revision
                </button>
                <button class="le-make-btn le-make-btn-success" onclick="window.LE_MAKE.handleApproveVersion(${order.id}, ${order.current_version})">
                  ✔ Approve Version v${order.current_version} &amp; Proceed
                </button>
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function resolveMediaUrl(url) {
    if (!url) return '';
    if (typeof url !== 'string') return url;
    let fullUrl = url.trim();
    if (fullUrl.includes('media-proxy')) {
      return fullUrl;
    }
    if (fullUrl.startsWith('data:') || fullUrl.startsWith('blob:')) {
      return fullUrl;
    }
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://') && !fullUrl.startsWith('/')) {
      fullUrl = 'https://storage.lenas.me/files/' + fullUrl.replace(/^\/+/, '');
    }
    if (fullUrl.includes('storage.lenas.me') || fullUrl.includes('lenas.me/files/') || fullUrl.includes('make-portal-files')) {
      const base = (apiUrl || '/wp-json/le-make/v1/').replace(/\/$/, '');
      const separator = base.includes('?') ? '&' : '?';
      return `${base}/media-proxy${separator}file=${encodeURIComponent(fullUrl)}`;
    }
    return fullUrl;
  }

  // ─── Login Screen View ─────────────────────────────────────────────────────
  function renderLoginView() {
    return `
      <div class="le-make-login-container">
        <div class="le-make-login-card">
          <div class="le-make-login-header">
            <div class="le-make-login-logo"><span>LE</span></div>
            <h2 class="le-make-login-title">Leading Edge Furniture Portal</h2>
          </div>

          ${state.loginForm.error ? `
            <div class="le-make-login-error">
              <span class="le-make-error-icon">⚠️</span>
              <span>${escapeHtml(state.loginForm.error)}</span>
            </div>
          ` : ''}

          <form onsubmit="window.LE_MAKE.handleLoginSubmit(event)" class="le-make-login-form">
            <div class="le-make-form-group">
              <label class="le-make-label">Username or Email Address</label>
              <input type="text" class="le-make-input" placeholder="Username or email address"
                value="${escapeHtml(state.loginForm.username)}"
                oninput="window.LE_MAKE.state.loginForm.username = this.value"
                required autofocus />
            </div>

            <div class="le-make-form-group">
              <label class="le-make-label">Password</label>
              <input type="password" class="le-make-input" placeholder="••••••••"
                value="${escapeHtml(state.loginForm.password)}"
                oninput="window.LE_MAKE.state.loginForm.password = this.value"
                required />
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--le-color-muted); cursor: pointer;">
                <input type="checkbox" ${state.loginForm.remember ? 'checked' : ''}
                  onchange="window.LE_MAKE.state.loginForm.remember = this.checked" />
                Remember this device
              </label>
            </div>

            <button type="submit" class="le-make-btn le-make-btn-primary" style="width: 100%; padding: 13px; font-size: 0.95rem; font-weight: 700;" ${state.loginForm.loading ? 'disabled' : ''}>
              ${state.loginForm.loading ? '⏳ Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    `;
  }

  // ─── Main Render Function ──────────────────────────────────────────────────
  function render() {
    const root = document.getElementById('le-make-sales-portal-app');
    if (!root) return;

    if (!state.isLoggedIn) {
      root.innerHTML = renderLoginView();
      return;
    }

    if (state.loading) {
      root.innerHTML = `
        <div class="le-make-loading-screen">
          <div class="le-make-spinner"></div>
          <p>Loading Portal...</p>
        </div>
      `;
      return;
    }

    let viewHtml = '';
    if (state.currentTab === 'dashboard') {
      viewHtml = renderDashboardView();
    } else if (state.currentTab === 'catalog') {
      viewHtml = renderCatalogView();
    } else if (state.currentTab === 'create_order') {
      viewHtml = renderCreateOrderView();
    } else if (state.currentTab === 'track_orders') {
      viewHtml = renderTrackOrdersView();
    }

    root.innerHTML = `
      ${renderNavbar()}
      ${viewHtml}
      ${renderDiffModal()}
      ${renderHistoryModal()}
    `;
  }

  // ─── Global Exposure & Initialization ──────────────────────────────────────
  window.LE_MAKE = {
    state,
    setTab,
    setStatusFilter: (s) => { state.statusFilter = s; render(); },
    handleCatalogSearch: (query) => {
      state.catalogSearch = query;
      fetchData();
    },
    handleProductCardClick,
    handleSelectProductAndOrder: (prodId) => {
      handleProductCardClick(prodId);
      setTab('create_order');
    },
    handleSpecChange,
    handleSizeChange: (szId) => {
      state.selectedSize = (state.selectedSpec?.sizes || []).find(s => s.id === szId) || null;
      render();
    },
    handleColorChange: (clId) => {
      state.selectedColor = (state.selectedSpec?.colors || []).find(c => c.id === clId) || null;
      render();
    },
    toggleCustomSize: () => {
      state.isCustomSize = !state.isCustomSize;
      render();
    },
    toggleCustomSpec,
    toggleCustomColor,
    toggleCustomItemMode: () => {
      state.isCustomItemMode = !state.isCustomItemMode;
      render();
    },
    handleItemFileSelected,
    removeItemAttachedFile,
    handleAddToCart,
    handleRemoveCartItem,
    handleUploadAttachment,
    handleRemoveAttachment,
    handleSubmitOrder,
    handleDeliveryDaysChange,
    handleDeliveryDateChange,
    // Order Attachments (Admin, Designer, Salesman)
    openOrderAttach,
    closeOrderAttach,
    handleOrderAttachFileSelected,
    handleOrderAttachSubmit,
    // Factory Manager Workbench
    openStageUpdate,
    closeStageUpdate,
    handleStagePhotoSelected,
    handleStageSubmit,
    // Notifications & Permissions
    toggleNotifDrawer,
    markNotificationRead,
    markAllNotificationsRead,
    requestNotificationPermission,
    retryNasConnection: async () => {
      state.loading = true;
      render();
      try {
        const res = await api('sync-check', 'POST');
        alert(`Connection Check:\n• Server Status: ${res.nas_online ? 'ONLINE' : 'OFFLINE'}\n• Orders Synced: ${res.synced_orders || 0}\n• Files Synced: ${res.synced_files || 0}`);
      } catch (e) {
        alert('Connection check failed: ' + e.message);
      }
      await fetchData();
    },
    openDiffModal,
    closeDiffModal: () => { state.diffModalOpen = false; render(); },
    openHistoryModal,
    closeHistoryModal: () => { state.historyModalOpen = false; render(); },
    handleApproveVersion,
    handleRejectVersion,
    handleLoginSubmit,
    handleLogout,
    render,
    fetchData,
  };

  // Mount
  async function init() {
    // 1. Immediately render to replace loading skeleton
    render();

    // 2. Check if configuration arrived late via delayed script
    const currentCfg = getConfig();
    if (currentCfg.nonce && !state.currentNonce) state.currentNonce = currentCfg.nonce;
    if (currentCfg.apiUrl) apiUrl = currentCfg.apiUrl;
    if (currentCfg.isLoggedIn && currentCfg.user && !state.isLoggedIn) {
      state.isLoggedIn = true;
      state.user = currentCfg.user;
      render();
    }

    // 3. Verify session via WordPress REST API /auth/me
    // This automatically authenticates any user with an active WordPress login session
    // (such as Administrator, Designer, or Salesperson) even if LiteSpeed served a cached guest page!
    try {
      const session = await api('auth/me');
      if (session && session.isLoggedIn && session.user) {
        state.isLoggedIn = true;
        state.user = session.user;
        if (session.nonce) state.currentNonce = session.nonce;
        state.loading = true;
        render();
        await fetchData();
        return;
      } else if (!state.isLoggedIn) {
        state.isLoggedIn = false;
        state.user = null;
        state.loading = false;
        render();
        return;
      }
    } catch (e) {
      console.warn('[LE-MAKE] Session verification notice:', e.message);
    }

    // 4. If already authenticated via initial config, load data
    if (state.isLoggedIn) {
      state.loading = true;
      render();
      await fetchData();
    } else {
      state.loading = false;
      render();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Fallback observer if LiteSpeed Cache executes delayed window.LE_MAKE_CONFIG later
  let pollCount = 0;
  const configPoll = setInterval(() => {
    pollCount++;
    if (window.LE_MAKE_CONFIG && !state.isLoggedIn && window.LE_MAKE_CONFIG.isLoggedIn) {
      clearInterval(configPoll);
      state.isLoggedIn = true;
      state.user = window.LE_MAKE_CONFIG.user;
      state.currentNonce = window.LE_MAKE_CONFIG.nonce || state.currentNonce;
      if (window.LE_MAKE_CONFIG.apiUrl) apiUrl = window.LE_MAKE_CONFIG.apiUrl;
      state.loading = true;
      render();
      fetchData();
    }
    if (pollCount > 20) clearInterval(configPoll);
  }, 500);

  setInterval(() => {
    if (state.isLoggedIn) {
      fetchData();
    }
  }, 15000); // 15s real-time notifications & order auto-refresh
})();
