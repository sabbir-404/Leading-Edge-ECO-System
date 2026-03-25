import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { decryptField, decryptRows, encryptObjectForDb } from '../../lib/encryption';
import { useResponsive } from '../../lib/responsive';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';
import { Search, Plus, Minus, Trash2, Save, User, Scan, Percent, Tag } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface Product {
  id: number;
  name: string;
  sku: string;
  selling_price: number;
  quantity?: number | null;
  opening_stock?: number | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
}

interface CartItem extends Product {
  quantity: number;
  discount_pct: number;
  unit_price: number;
}

interface PaymentMethod {
  id: number;
  name: string;
}

const MAX_SEARCH_RESULTS = 20;

const toMoney = (value: string) => {
  const parsed = Number.parseFloat(value || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (num: number, min: number, max: number) => Math.max(min, Math.min(max, num));

const getStockQty = (item: Partial<Product>) => {
  if (typeof item?.quantity === 'number') return item.quantity;
  if (typeof item?.opening_stock === 'number') return item.opening_stock;
  return 0;
};

const toWordsUnder1000 = (num: number): string => {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  let n = Math.floor(num);
  const words: string[] = [];

  if (n >= 100) {
    words.push(`${units[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }

  if (n >= 20) {
    words.push(tens[Math.floor(n / 10)]);
    n %= 10;
  } else if (n >= 10) {
    words.push(teens[n - 10]);
    n = 0;
  }

  if (n > 0) words.push(units[n]);
  return words.filter(Boolean).join(' ');
};

const numberToWords = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) return 'Zero Taka Only';

  const taka = Math.floor(amount);
  const poisha = Math.round((amount - taka) * 100);

  const parts: string[] = [];
  const crore = Math.floor(taka / 10000000);
  const lakh = Math.floor((taka % 10000000) / 100000);
  const thousand = Math.floor((taka % 100000) / 1000);
  const hundredPart = taka % 1000;

  if (crore) parts.push(`${toWordsUnder1000(crore)} Crore`);
  if (lakh) parts.push(`${toWordsUnder1000(lakh)} Lakh`);
  if (thousand) parts.push(`${toWordsUnder1000(thousand)} Thousand`);
  if (hundredPart) parts.push(toWordsUnder1000(hundredPart));

  const takaWords = `${parts.join(' ').trim()} Taka`;
  if (!poisha) return `${takaWords} Only`;

  return `${takaWords} and ${toWordsUnder1000(poisha)} Poisha Only`;
};

export default function BillingScreen({ navigation }: any) {
  const { theme } = useTheme();
  const ui = useResponsive();
  const isUltraCompact = ui.isUltraCompact;
  const insets = useSafeAreaInsets();

  const barcodeInputRef = useRef<TextInput>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [showDrop, setShowDrop] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [returningCount, setReturningCount] = useState(0);
  const [customerLookupText, setCustomerLookupText] = useState('');
  const [showCustomerExtra, setShowCustomerExtra] = useState(false);

  const [billedBy, setBilledBy] = useState('Staff');
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<number | null>(null);
  const [paymentRef, setPaymentRef] = useState('');

  const [globalDiscountPct, setGlobalDiscountPct] = useState('0');
  const [manualAdjustment, setManualAdjustment] = useState('0');
  const [showPricingTools, setShowPricingTools] = useState(false);

  const [shipToName, setShipToName] = useState('');
  const [shipToPhone, setShipToPhone] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [shipFromName, setShipFromName] = useState('LE-SOFT');
  const [shipFromAddress, setShipFromAddress] = useState('');
  const [shippingCharge, setShippingCharge] = useState('0');

  const [installationCharge, setInstallationCharge] = useState('0');
  const [installationNote, setInstallationNote] = useState('');

  const [barcodeText, setBarcodeText] = useState('');
  const [showBarcodeQuickEntry, setShowBarcodeQuickEntry] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: prodData } = await supabase.from('products').select('*').order('name').limit(500);
      setProducts(decryptRows(prodData || []));

      const { data: pmData } = await supabase.from('payment_methods').select('id, name').eq('is_active', true);
      const methods = decryptRows(pmData || []);
      if (methods.length > 0) {
        setPaymentMethods(methods);
        setSelectedMethod(methods[0].id);
      } else {
        const fallback = [
          { id: -1, name: 'Cash' },
          { id: -2, name: 'Mobile Banking' },
          { id: -3, name: 'Card' },
        ];
        setPaymentMethods(fallback);
        setSelectedMethod(-1);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await supabase.from('users').select('full_name').eq('auth_id', user.id).single();
        setBilledBy(decryptField(p?.full_name) || 'Staff');
      }
    };
    load();
  }, []);

  useEffect(() => {
    const cleanPhone = customerPhone.trim();
    if (cleanPhone.length < 7) {
      setCustomerId(null);
      setReturningCount(0);
      setCustomerLookupText('');
      return;
    }

    const timeout = setTimeout(async () => {
      setCustomerLookupText('Checking customer...');

      const { data: found } = await supabase
        .from('billing_customers')
        .select('*')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (!found) {
        setCustomerId(null);
        setReturningCount(0);
        setCustomerLookupText('New customer');
        return;
      }

      const id = found.id as number;
      setCustomerId(id);

      const dbName = decryptField(found.name) || found.name || '';
      const dbPhone = decryptField(found.phone) || found.phone || '';
      const dbEmail = decryptField(found.email) || found.email || '';
      const dbAddress = decryptField(found.delivery_address) || decryptField(found.address) || found.delivery_address || found.address || '';

      if (dbName) setCustomerName(dbName);
      if (dbPhone) setCustomerPhone(dbPhone);
      if (dbEmail) setCustomerEmail(dbEmail);
      if (dbAddress) setDeliveryAddress(dbAddress);

      const { count } = await supabase.from('bills').select('id', { count: 'exact', head: true }).eq('customer_id', id);
      const historyCount = count || 0;
      setReturningCount(historyCount);
      setCustomerLookupText(
        historyCount > 0
          ? (ui.isUltraCompact ? `Returning • ${historyCount}` : `Returning customer • ${historyCount} bill${historyCount > 1 ? 's' : ''}`)
          : 'Customer found'
      );
    }, 250);

    return () => clearTimeout(timeout);
  }, [customerPhone]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
      .slice(0, MAX_SEARCH_RESULTS);
  }, [products, search]);

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.id === p.id);
      if (ex) {
        return prev.map((i) => (i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { ...p, quantity: 1, discount_pct: 0, unit_price: p.selling_price }];
    });
    setSearch('');
    setShowDrop(false);
    setBarcodeText('');
    setIsScanning(false);
  };

  const tryAddByBarcode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const prod = products.find((p) => (p.sku || '').toLowerCase() === code.toLowerCase() || p.name.toLowerCase() === code.toLowerCase());
    if (prod) {
      addToCart(prod);
      return;
    }
    Alert.alert('Not Found', `Product with SKU/Barcode ${code} not found.`);
  };

  const startScanning = async () => {
    if (!permission || !permission.granted) {
      const res = await requestPermission();
      if (!res.granted) return Alert.alert('Permission denied', 'Camera access is required for scanning.');
    }
    setScanned(false);
    setIsScanning(true);
  };

  const handleBarCodeScanned = ({ data }: any) => {
    if (scanned) return;
    setScanned(true);
    tryAddByBarcode(String(data));
    setIsScanning(false);
  };

  const updateQty = (id: number, delta: number) => {
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)));
  };

  const setQtyDirect = (id: number, input: string) => {
    const qty = Math.max(1, Number.parseInt(input.replace(/[^0-9]/g, '') || '1', 10));
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i)));
  };

  const removeItem = (id: number) => setCart((prev) => prev.filter((i) => i.id !== id));

  const setLineDiscountPct = (id: number, input: string) => {
    const pct = clamp(Number.parseFloat(input || '0') || 0, 0, 100);
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, discount_pct: pct, unit_price: Number((i.selling_price * (1 - pct / 100)).toFixed(2)) } : i)));
  };

  const setLineTargetTotal = (id: number, input: string) => {
    const value = toMoney(input);
    setCart((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const base = i.selling_price * i.quantity;
      const finalTotal = clamp(value, 0, base);
      const unit = i.quantity > 0 ? finalTotal / i.quantity : i.selling_price;
      const discountPct = base > 0 ? ((base - finalTotal) / base) * 100 : 0;
      return {
        ...i,
        unit_price: Number(unit.toFixed(2)),
        discount_pct: Number(discountPct.toFixed(2)),
      };
    }));
  };

  const applyGlobalDiscount = () => {
    const pct = clamp(Number.parseFloat(globalDiscountPct || '0') || 0, 0, 100);
    setCart((prev) => prev.map((i) => ({
      ...i,
      discount_pct: pct,
      unit_price: Number((i.selling_price * (1 - pct / 100)).toFixed(2)),
    })));
  };

  const lineBase = (i: CartItem) => i.selling_price * i.quantity;
  const lineFinal = (i: CartItem) => i.unit_price * i.quantity;
  const lineSavings = (i: CartItem) => Math.max(0, lineBase(i) - lineFinal(i));

  const subtotal = useMemo(() => cart.reduce((s, i) => s + lineBase(i), 0), [cart]);
  const lineDiscountTotal = useMemo(() => cart.reduce((s, i) => s + lineSavings(i), 0), [cart]);
  const cartFinalTotal = useMemo(() => cart.reduce((s, i) => s + lineFinal(i), 0), [cart]);

  const shippingChargeAmount = toMoney(shippingCharge);
  const installationChargeAmount = toMoney(installationCharge);

  const maxAdjustment = Math.min(50000, subtotal * 0.3);
  const manualAdjustmentAmount = clamp(toMoney(manualAdjustment), -maxAdjustment, maxAdjustment);

  const grand = Math.max(0, cartFinalTotal + shippingChargeAmount + installationChargeAmount + manualAdjustmentAmount);
  const grandInWords = numberToWords(grand);

  const invoicePreview = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = `${now.getMonth() + 1}`.padStart(2, '0');
    const d = `${now.getDate()}`.padStart(2, '0');
    return `INV-${y}${m}${d}-AUTO`;
  }, []);

  const saveBill = async () => {
    if (cart.length === 0) return Alert.alert('Error', 'Cart is empty');
    if (!customerName.trim()) return Alert.alert('Error', 'Enter customer name');
    if (!selectedMethod) return Alert.alert('Error', 'Select a payment method');

    setSaving(true);
    try {
      let custId: number | null = customerId;

      if (custId) {
        const updatePayload = encryptObjectForDb({
          name: customerName,
          phone: customerPhone || '',
          email: customerEmail || '',
          delivery_address: deliveryAddress || '',
        });
        const { error: updateError } = await supabase.from('billing_customers').update(updatePayload).eq('id', custId);
        if (updateError) {
          const fallbackPayload = encryptObjectForDb({ name: customerName, phone: customerPhone || '' });
          await supabase.from('billing_customers').update(fallbackPayload).eq('id', custId);
        }
      } else {
        const fullCustomerRow = encryptObjectForDb({
          name: customerName,
          phone: customerPhone || '',
          email: customerEmail || '',
          delivery_address: deliveryAddress || '',
        });

        const insertFull = await supabase.from('billing_customers').insert(fullCustomerRow).select('id').single();
        if (insertFull.error) {
          const fallbackRow = encryptObjectForDb({ name: customerName, phone: customerPhone || '' });
          const insertFallback = await supabase.from('billing_customers').insert(fallbackRow).select('id').single();
          if (insertFallback.error) throw insertFallback.error;
          custId = insertFallback.data?.id || null;
        } else {
          custId = insertFull.data?.id || null;
        }
      }

      const shippingNote = [
        shipToName ? `ShipTo: ${shipToName}` : '',
        shipToPhone ? `ShipToPhone: ${shipToPhone}` : '',
        shipToAddress ? `ShipToAddress: ${shipToAddress}` : '',
        shipFromName ? `ShipFrom: ${shipFromName}` : '',
        shipFromAddress ? `ShipFromAddress: ${shipFromAddress}` : '',
        installationNote ? `InstallationNote: ${installationNote}` : '',
      ].filter(Boolean).join(' | ');

      const baseBillPayload = encryptObjectForDb({
        customer_id: custId,
        billed_by: billedBy,
        platform: 'mobile',
        subtotal,
        discount_total: lineDiscountTotal,
        grand_total: grand,
        payment_method_id: selectedMethod,
        payment_ref: paymentRef,
        shipping_address: shipToAddress || deliveryAddress,
        shipping_note: shippingNote,
        installation_charge: installationChargeAmount,
      });

      const extendedBillPayload = encryptObjectForDb({
        ...baseBillPayload,
        shipping_charge: shippingChargeAmount,
        manual_adjustment: manualAdjustmentAmount,
        installation_note: installationNote,
      });

      let billInsert = await supabase.from('bills').insert(extendedBillPayload).select('id, invoice_number').single();
      if (billInsert.error) {
        billInsert = await supabase.from('bills').insert(baseBillPayload).select('id, invoice_number').single();
      }
      if (billInsert.error) throw billInsert.error;

      const bill = billInsert.data;

      const itemsPayload = cart.map((i) => {
        const base = lineBase(i);
        const final = lineFinal(i);
        const discountAmount = Math.max(0, base - final);
        return encryptObjectForDb({
          bill_id: bill.id,
          product_id: i.id,
          product_name: i.name,
          sku: i.sku || '',
          quantity: i.quantity,
          mrp: i.selling_price,
          discount_pct: i.discount_pct,
          discount_amt: discountAmount,
          price: final,
        });
      });

      const { error: itemsError } = await supabase.from('bill_items').insert(itemsPayload);
      if (itemsError) {
        await supabase.from('bills').delete().eq('id', bill.id);
        throw itemsError;
      }

      Alert.alert('Bill Saved', `Invoice: ${bill.invoice_number}\nTotal: ৳${grand.toFixed(2)}\n${grandInWords}`);

      setCart([]);
      setSearch('');
      setShowDrop(false);
      setGlobalDiscountPct('0');
      setManualAdjustment('0');

      setCustomerId(null);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setDeliveryAddress('');
      setReturningCount(0);
      setCustomerLookupText('');

      setPaymentRef('');
      setShippingCharge('0');
      setShipToName('');
      setShipToPhone('');
      setShipToAddress('');
      setShipFromAddress('');
      setInstallationCharge('0');
      setInstallationNote('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  const s = makeStyles(theme, ui, insets);

  if (isScanning) {
    return (
      <View style={s.scannerRoot}>
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'code128', 'code39', 'upc_a'] }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={s.scannerOverlay}>
          <Text style={s.scannerTitle}>Scan Product Barcode</Text>
          <TouchableOpacity style={s.closeScanner} onPress={() => setIsScanning(false)}>
            <Text style={s.closeScannerText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Billing / POS</Text>
          {!isUltraCompact && <Text style={s.invoicePreview}>Next Invoice: {invoicePreview}</Text>}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('BillHistory')} style={s.outlineBtn}>
          <Text style={s.outlineBtnText}>History</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareContainer>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionLabel}>Customer Details</Text>
              <TouchableOpacity onPress={() => setShowCustomerExtra((v) => !v)}>
                <Text style={s.showMoreText}>{showCustomerExtra ? 'Less' : 'More'}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.inputRow}>
              <User color={theme.textMuted} size={ui.icon(16)} />
              <TextInput
                style={s.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Customer Name *"
                placeholderTextColor={theme.textMuted}
              />
            </View>
            <View style={[s.inputRow, s.inputTopGap]}>
              <TextInput
                style={s.input}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="Phone / Mobile"
                placeholderTextColor={theme.textMuted}
                keyboardType="phone-pad"
              />
            </View>
            {!!customerLookupText && (
              <View style={s.customerTagRow}>
                <Tag color={returningCount > 0 ? theme.success : theme.textMuted} size={ui.icon(13)} />
                <Text style={[s.customerTag, { color: returningCount > 0 ? theme.success : theme.textMuted }]}>{customerLookupText}</Text>
              </View>
            )}
            {showCustomerExtra && (
              <>
                <View style={[s.inputRow, s.inputTopGap]}>
                  <TextInput
                    style={s.input}
                    value={customerEmail}
                    onChangeText={setCustomerEmail}
                    placeholder="Email (optional)"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={[s.inputRow, s.inputTopGap, s.textArea]}>
                  <TextInput
                    style={[s.input, s.textAreaInput]}
                    value={deliveryAddress}
                    onChangeText={setDeliveryAddress}
                    placeholder="Delivery Address"
                    placeholderTextColor={theme.textMuted}
                    multiline
                  />
                </View>
              </>
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionLabel}>Inventory</Text>
            <View style={s.searchRow}>
              <View style={[s.inputRow, { flex: 1 }]}>
                <Search color={theme.textMuted} size={ui.icon(16)} />
                <TextInput
                  style={s.input}
                  value={search}
                  onChangeText={(t) => {
                    setSearch(t);
                    setShowDrop(t.length > 0);
                  }}
                  onKeyPress={(e) => {
                    if ((e.nativeEvent.key || '').toUpperCase() === 'F2') barcodeInputRef.current?.focus();
                  }}
                  placeholder="Search by product name or SKU"
                  placeholderTextColor={theme.textMuted}
                />
              </View>
              <TouchableOpacity style={s.scanBtn} onPress={startScanning}>
                <Scan color={theme.accent} size={ui.icon(20)} />
              </TouchableOpacity>
            </View>

            <View style={[s.sectionHeaderRow, s.compactToggleRow]}>
              <Text style={s.helperText}>Barcode quick entry available</Text>
              <TouchableOpacity onPress={() => setShowBarcodeQuickEntry((v) => !v)}>
                <Text style={s.showMoreText}>{showBarcodeQuickEntry ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            {showBarcodeQuickEntry && (
              <View style={[s.inputRow, s.inputTopGap]}>
                <Text style={s.barcodeHint}>F2</Text>
                <TextInput
                  ref={barcodeInputRef}
                  style={s.input}
                  value={barcodeText}
                  onChangeText={setBarcodeText}
                  onSubmitEditing={() => tryAddByBarcode(barcodeText)}
                  placeholder="Barcode quick entry"
                  placeholderTextColor={theme.textMuted}
                  returnKeyType="done"
                />
                <TouchableOpacity style={s.inlineBtn} onPress={() => tryAddByBarcode(barcodeText)}>
                  <Text style={s.inlineBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {showDrop && filtered.length > 0 && (
              <View style={s.dropdown}>
                {filtered.map((p) => {
                  const stock = getStockQty(p);
                  return (
                    <TouchableOpacity key={p.id} style={s.dropItem} onPress={() => addToCart(p)}>
                      <View style={s.productThumbWrap}>
                        {p.thumbnail_url || p.image_url ? (
                          <Image source={{ uri: String(p.thumbnail_url || p.image_url) }} style={s.productThumb} />
                        ) : (
                          <View style={s.thumbFallback}>
                            <Text style={s.thumbFallbackText}>{(p.name || '?').slice(0, 1).toUpperCase()}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.dropName}>{p.name}</Text>
                        <Text style={s.dropMeta}>{isUltraCompact ? `Stock: ${stock}` : `SKU: ${p.sku || 'N/A'} • Stock: ${stock}`}</Text>
                      </View>
                      <Text style={[s.dropPrice, { color: theme.accent }]}>৳{p.selling_price}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {cart.length > 0 && (
            <View style={s.section}>
              <View style={s.sectionHeaderRow}>
                <Text style={s.sectionLabel}>Items Bag</Text>
                <View style={s.globalActions}>
                  <View style={s.smallInputWrap}>
                    <Percent color={theme.textMuted} size={ui.icon(13)} />
                    <TextInput
                      style={s.smallInput}
                      value={globalDiscountPct}
                      onChangeText={setGlobalDiscountPct}
                      keyboardType="decimal-pad"
                      placeholder="Global %"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                  <TouchableOpacity style={s.inlineBtn} onPress={applyGlobalDiscount}>
                    <Text style={s.inlineBtnText}>Apply</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.inlineBtn} onPress={() => setShowPricingTools((v) => !v)}>
                    <Text style={s.inlineBtnText}>{showPricingTools ? 'Basic' : 'Tools'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {cart.map((item) => {
                const base = lineBase(item);
                const final = lineFinal(item);
                const savings = lineSavings(item);
                return (
                  <View key={item.id} style={s.cartItem}>
                    <View style={s.cartTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cartName}>{item.name}</Text>
                        <Text style={s.cartMeta}>{isUltraCompact ? `MRP ৳${item.selling_price.toFixed(2)} | Save ৳${savings.toFixed(2)}` : `MRP ৳${item.selling_price.toFixed(2)} • Savings ৳${savings.toFixed(2)}`}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeItem(item.id)} style={[s.qBtn, { backgroundColor: theme.dangerLight }]}>
                        <Trash2 color={theme.danger} size={ui.icon(14)} />
                      </TouchableOpacity>
                    </View>

                    <View style={s.qtyRow}>
                      <TouchableOpacity onPress={() => updateQty(item.id, -1)} style={s.qBtn}>
                        <Minus color={theme.textPrimary} size={ui.icon(14)} />
                      </TouchableOpacity>
                      <TextInput
                        style={s.qtyInput}
                        value={String(item.quantity)}
                        onChangeText={(v) => setQtyDirect(item.id, v)}
                        keyboardType="number-pad"
                      />
                      <TouchableOpacity onPress={() => updateQty(item.id, 1)} style={s.qBtn}>
                        <Plus color={theme.textPrimary} size={ui.icon(14)} />
                      </TouchableOpacity>
                      <View style={s.lineTotalBox}>
                        <Text style={s.lineTotalText}>৳{final.toFixed(2)}</Text>
                      </View>
                    </View>

                    {showPricingTools && (
                      <View style={s.priceControlRow}>
                        <View style={s.smallInputWrapWide}>
                          <Text style={s.inputLabel}>Disc %</Text>
                          <TextInput
                            style={s.smallInput}
                            keyboardType="decimal-pad"
                            value={item.discount_pct.toString()}
                            onChangeText={(v) => setLineDiscountPct(item.id, v)}
                          />
                        </View>
                        <View style={s.smallInputWrapWide}>
                          <Text style={s.inputLabel}>Target Total ৳</Text>
                          <TextInput
                            style={s.smallInput}
                            keyboardType="decimal-pad"
                            value={final.toFixed(2)}
                            onChangeText={(v) => setLineTargetTotal(item.id, v)}
                          />
                        </View>
                      </View>
                    )}

                    {!isUltraCompact && <Text style={s.cartMeta}>Base ৳{base.toFixed(2)} → Final ৳{final.toFixed(2)}</Text>}
                  </View>
                );
              })}
            </View>
          )}

          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionLabel}>Payment, Charges & Shipping</Text>
              <TouchableOpacity onPress={() => setShowAdvanced(!showAdvanced)}>
                <Text style={s.showMoreText}>{showAdvanced ? 'Hide' : 'Show More'}</Text>
              </TouchableOpacity>
            </View>

            <View style={s.pickerContainer}>
              <Picker
                selectedValue={selectedMethod}
                onValueChange={(v) => setSelectedMethod(v)}
                style={{ color: theme.textPrimary, height: ui.controlHeight }}
                dropdownIconColor={theme.textMuted}
              >
                {paymentMethods.map((m) => <Picker.Item key={m.id} label={m.name} value={m.id} />)}
              </Picker>
            </View>

            <View style={[s.inputRow, s.inputTopGap]}>
              <TextInput
                style={s.input}
                value={paymentRef}
                onChangeText={setPaymentRef}
                placeholder="Transaction ID / Reference"
                placeholderTextColor={theme.textMuted}
              />
            </View>

            <View style={s.splitRow}>
              <View style={s.splitCol}>
                <Text style={s.fieldLabel}>Shipping Charge (৳)</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    value={shippingCharge}
                    onChangeText={setShippingCharge}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>
              <View style={s.splitCol}>
                <Text style={s.fieldLabel}>Manual +/- (৳)</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    value={manualAdjustment}
                    onChangeText={setManualAdjustment}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>
            </View>

            <View style={s.splitRow}>
              <View style={s.splitCol}>
                <Text style={s.fieldLabel}>Installation Charge (৳)</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    value={installationCharge}
                    onChangeText={setInstallationCharge}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>
              <View style={s.splitCol}>
                <Text style={s.fieldLabel}>Ship To Phone</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    value={shipToPhone}
                    onChangeText={setShipToPhone}
                    keyboardType="phone-pad"
                    placeholder="01XXXXXXXXX"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
              </View>
            </View>

            {showAdvanced && (
              <View>
                <Text style={[s.fieldLabel, s.inputTopGap]}>Ship To Name</Text>
                <View style={s.inputRow}>
                  <TextInput style={s.input} value={shipToName} onChangeText={setShipToName} placeholder="Recipient name" placeholderTextColor={theme.textMuted} />
                </View>

                <Text style={[s.fieldLabel, s.inputTopGap]}>Ship To Address</Text>
                <View style={[s.inputRow, s.textArea]}>
                  <TextInput style={[s.input, s.textAreaInput]} value={shipToAddress} onChangeText={setShipToAddress} placeholder="Full destination address" placeholderTextColor={theme.textMuted} multiline />
                </View>

                <Text style={[s.fieldLabel, s.inputTopGap]}>Ship From Name</Text>
                <View style={s.inputRow}>
                  <TextInput style={s.input} value={shipFromName} onChangeText={setShipFromName} placeholder="Sender name" placeholderTextColor={theme.textMuted} />
                </View>

                <Text style={[s.fieldLabel, s.inputTopGap]}>Ship From Address</Text>
                <View style={[s.inputRow, s.textArea]}>
                  <TextInput style={[s.input, s.textAreaInput]} value={shipFromAddress} onChangeText={setShipFromAddress} placeholder="Sender address" placeholderTextColor={theme.textMuted} multiline />
                </View>

                <Text style={[s.fieldLabel, s.inputTopGap]}>Installation Notes</Text>
                <View style={[s.inputRow, s.textArea]}>
                  <TextInput style={[s.input, s.textAreaInput]} value={installationNote} onChangeText={setInstallationNote} placeholder="Service/installation notes" placeholderTextColor={theme.textMuted} multiline />
                </View>
              </View>
            )}
          </View>

          <View style={s.summarySection}>
            <View style={s.summaryRow}><Text style={s.summaryKey}>Subtotal</Text><Text style={s.summaryVal}>৳{subtotal.toFixed(2)}</Text></View>
            <View style={s.summaryRow}><Text style={s.summaryKey}>Item Savings</Text><Text style={s.summaryVal}>- ৳{lineDiscountTotal.toFixed(2)}</Text></View>
            <View style={s.summaryRow}><Text style={s.summaryKey}>Shipping</Text><Text style={s.summaryVal}>+ ৳{shippingChargeAmount.toFixed(2)}</Text></View>
            <View style={s.summaryRow}><Text style={s.summaryKey}>Installation</Text><Text style={s.summaryVal}>+ ৳{installationChargeAmount.toFixed(2)}</Text></View>
            <View style={s.summaryRow}><Text style={s.summaryKey}>Manual Adjustment</Text><Text style={s.summaryVal}>{manualAdjustmentAmount >= 0 ? '+' : '-'} ৳{Math.abs(manualAdjustmentAmount).toFixed(2)}</Text></View>
            <View style={[s.summaryRow, s.summaryTotalRow]}><Text style={s.summaryTotalKey}>Grand Total</Text><Text style={s.summaryTotalVal}>৳{grand.toFixed(2)}</Text></View>
            {!isUltraCompact && <Text style={s.wordsText}>{grandInWords}</Text>}
          </View>
        </ScrollView>
      </KeyboardAwareContainer>

      <View style={s.footer}>
        <View>
          <Text style={s.totalLabel}>Payable</Text>
          <Text style={[s.totalValue, { color: theme.success }]}>৳{grand.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[s.saveBtn, { backgroundColor: theme.success }, (saving || cart.length === 0) && { opacity: 0.5 }]}
          onPress={saveBill}
          disabled={saving || cart.length === 0}
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Save color="#fff" size={ui.icon(17)} />
              <Text style={s.saveBtnText}>Save Bill</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (theme: any, ui: any, insets: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: ui.contentPadding,
    paddingTop: ui.spacing(12),
    paddingBottom: ui.spacing(8),
  },
  title: { color: theme.textPrimary, fontSize: ui.font(22, 18, 26), fontWeight: '800' },
  invoicePreview: { color: theme.textMuted, fontSize: ui.font(11), marginTop: ui.spacing(2) },
  outlineBtn: {
    backgroundColor: theme.bgCard,
    borderRadius: ui.radius(10),
    paddingVertical: ui.spacing(7),
    paddingHorizontal: ui.spacing(14),
    borderWidth: 1,
    borderColor: theme.border,
  },
  outlineBtnText: { color: theme.accent, fontWeight: '700', fontSize: ui.font(13) },

  scrollContent: { paddingBottom: ui.sectionGap },
  section: {
    backgroundColor: theme.bgCard,
    borderRadius: ui.radius(16),
    marginHorizontal: ui.contentPadding,
    marginBottom: ui.sectionGap,
    padding: ui.cardPadding,
    borderWidth: 1,
    borderColor: theme.border,
  },
  summarySection: {
    backgroundColor: theme.bgCard,
    borderRadius: ui.radius(16),
    marginHorizontal: ui.contentPadding,
    marginBottom: ui.sectionGap,
    padding: ui.cardPadding,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sectionLabel: {
    color: theme.textSecondary,
    fontSize: ui.isUltraCompact ? ui.font(10) : ui.font(11),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: ui.isUltraCompact ? 0.5 : 1,
    marginBottom: ui.spacing(10),
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: ui.spacing(8) },
  showMoreText: { color: theme.accent, fontSize: ui.font(12), fontWeight: '700' },
  helperText: { color: theme.textMuted, fontSize: ui.font(11), fontWeight: '600' },
  compactToggleRow: { marginTop: ui.spacing(6), marginBottom: ui.spacing(2) },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ui.controlHeight,
    backgroundColor: theme.bgInput,
    borderRadius: ui.radius(12),
    paddingHorizontal: ui.isUltraCompact ? ui.spacing(10) : ui.spacing(12),
    borderWidth: 1,
    borderColor: theme.border,
    gap: ui.spacing(8),
  },
  input: { flex: 1, color: theme.textPrimary, paddingVertical: ui.spacing(10), fontSize: ui.font(14) },
  inputTopGap: { marginTop: ui.spacing(8) },
  textArea: { minHeight: ui.scale(72), alignItems: 'flex-start' },
  textAreaInput: { textAlignVertical: 'top' },
  fieldLabel: { color: theme.textSecondary, fontSize: ui.font(12), fontWeight: '600', marginBottom: ui.spacing(4) },

  customerTagRow: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(6), marginTop: ui.spacing(8) },
  customerTag: { fontSize: ui.font(12), fontWeight: '700' },

  searchRow: { flexDirection: 'row', gap: ui.isUltraCompact ? ui.spacing(6) : ui.spacing(10), alignItems: 'center' },
  scanBtn: {
    backgroundColor: theme.bgElevated,
    borderRadius: ui.radius(12),
    minWidth: ui.touchMin,
    minHeight: ui.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ui.spacing(10),
    borderWidth: 1,
    borderColor: theme.border,
  },
  barcodeHint: {
    color: theme.accent,
    fontWeight: '800',
    fontSize: ui.font(11),
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: ui.radius(6),
    paddingHorizontal: ui.spacing(6),
    paddingVertical: ui.spacing(2),
  },
  inlineBtn: {
    backgroundColor: theme.accent + '22',
    borderRadius: ui.radius(8),
    paddingHorizontal: ui.spacing(10),
    paddingVertical: ui.spacing(6),
    borderWidth: 1,
    borderColor: theme.accent + '66',
  },
  inlineBtnText: { color: theme.accent, fontSize: ui.font(12), fontWeight: '700' },

  dropdown: {
    backgroundColor: theme.bgCard,
    borderRadius: ui.radius(10),
    marginTop: ui.isUltraCompact ? ui.spacing(6) : ui.spacing(8),
    borderWidth: 1,
    borderColor: theme.border,
    maxHeight: ui.scale(260),
  },
  dropItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spacing(10),
    padding: ui.isUltraCompact ? ui.spacing(8) : ui.spacing(10),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  productThumbWrap: { width: ui.isUltraCompact ? ui.scale(30) : ui.scale(34), height: ui.isUltraCompact ? ui.scale(30) : ui.scale(34) },
  productThumb: { width: '100%', height: '100%', borderRadius: ui.radius(8), backgroundColor: theme.bgElevated },
  thumbFallback: { width: '100%', height: '100%', borderRadius: ui.radius(8), backgroundColor: theme.bgElevated, alignItems: 'center', justifyContent: 'center' },
  thumbFallbackText: { color: theme.textSecondary, fontSize: ui.font(12), fontWeight: '800' },
  dropName: { color: theme.textPrimary, fontWeight: '600', fontSize: ui.isUltraCompact ? ui.font(12) : ui.font(13) },
  dropMeta: { color: theme.textMuted, fontSize: ui.isUltraCompact ? ui.font(10) : ui.font(11), marginTop: ui.spacing(1) },
  dropPrice: { fontWeight: '700', fontSize: ui.font(13) },

  cartItem: { paddingVertical: ui.compactRowPadding, borderBottomWidth: 1, borderBottomColor: theme.border },
  cartTopRow: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(8) },
  cartName: { color: theme.textPrimary, fontWeight: '700', fontSize: ui.font(14) },
  cartMeta: { color: theme.textMuted, fontSize: ui.font(12), marginTop: ui.spacing(2) },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: ui.compactRowGap, marginTop: ui.isUltraCompact ? ui.spacing(6) : ui.spacing(8) },
  qBtn: {
    backgroundColor: theme.bgElevated,
    borderRadius: ui.radius(8),
    minWidth: ui.touchMin,
    minHeight: ui.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ui.compactDetailPadding,
  },
  qtyInput: {
    minWidth: ui.isUltraCompact ? ui.scale(40) : ui.scale(46),
    textAlign: 'center',
    color: theme.textPrimary,
    fontWeight: '700',
    backgroundColor: theme.bgInput,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: ui.radius(8),
    paddingVertical: ui.spacing(8),
    paddingHorizontal: ui.spacing(8),
    fontSize: ui.font(14),
  },
  lineTotalBox: {
    marginLeft: 'auto',
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: ui.radius(8),
    paddingHorizontal: ui.spacing(10),
    paddingVertical: ui.spacing(8),
  },
  lineTotalText: { color: theme.textPrimary, fontSize: ui.font(13), fontWeight: '700' },

  priceControlRow: { flexDirection: 'row', gap: ui.isUltraCompact ? ui.spacing(6) : ui.spacing(8), marginTop: ui.isUltraCompact ? ui.spacing(6) : ui.spacing(8) },
  smallInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spacing(6),
    backgroundColor: theme.bgInput,
    borderRadius: ui.radius(8),
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: ui.spacing(8),
  },
  smallInputWrapWide: {
    flex: 1,
    backgroundColor: theme.bgInput,
    borderRadius: ui.radius(8),
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: ui.spacing(8),
    paddingVertical: ui.spacing(4),
  },
  smallInput: { color: theme.textPrimary, fontSize: ui.font(12), paddingVertical: ui.spacing(6), minWidth: ui.scale(48) },
  inputLabel: { color: theme.textMuted, fontSize: ui.font(10), fontWeight: '700', textTransform: 'uppercase' },
  globalActions: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(8) },

  pickerContainer: {
    backgroundColor: theme.bgInput,
    borderRadius: ui.radius(12),
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },

  splitRow: { flexDirection: ui.isUltraCompact ? 'column' : 'row', gap: ui.spacing(8), marginTop: ui.spacing(10) },
  splitCol: { flex: 1 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: ui.spacing(4) },
  summaryKey: { color: theme.textSecondary, fontSize: ui.font(13) },
  summaryVal: { color: theme.textPrimary, fontSize: ui.font(13), fontWeight: '600' },
  summaryTotalRow: { borderTopWidth: 1, borderTopColor: theme.border, marginTop: ui.spacing(6), paddingTop: ui.spacing(8) },
  summaryTotalKey: { color: theme.textPrimary, fontSize: ui.font(14), fontWeight: '800' },
  summaryTotalVal: { color: theme.success, fontSize: ui.font(16), fontWeight: '900' },
  wordsText: { color: theme.textMuted, fontSize: ui.font(11), marginTop: ui.spacing(8), lineHeight: ui.font(16) },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: ui.contentPadding,
    paddingTop: ui.spacing(14),
    backgroundColor: theme.bgCard,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingBottom: (insets.bottom > 0 ? insets.bottom : ui.spacing(10)) + ui.spacing(8),
  },
  totalLabel: { color: theme.textMuted, fontSize: ui.font(13) },
  totalValue: { fontSize: ui.font(24, 20, 30), fontWeight: '900' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spacing(8),
    borderRadius: ui.radius(14),
    paddingVertical: ui.isUltraCompact ? ui.spacing(12) : ui.spacing(14),
    paddingHorizontal: ui.isUltraCompact ? ui.spacing(18) : ui.spacing(24),
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: ui.font(16) },

  scannerRoot: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: ui.spacing(60),
    paddingHorizontal: ui.spacing(20),
    alignItems: 'center',
  },
  scannerTitle: {
    color: '#fff',
    fontSize: ui.font(18),
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  closeScanner: {
    marginTop: ui.spacing(16),
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: ui.radius(20),
    paddingHorizontal: ui.spacing(14),
    paddingVertical: ui.spacing(8),
  },
  closeScannerText: { color: '#fff', fontSize: ui.font(13), fontWeight: '700' },
});
