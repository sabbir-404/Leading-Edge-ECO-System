import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, StyleSheet, Modal, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';
import { Search, Plus, Minus, Trash2, Save, User, X, Scan, Camera } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface Product { id: number; name: string; sku: string; selling_price: number; }
interface CartItem extends Product { quantity: number; discount_pct: number; }
interface PaymentMethod { id: number; name: string; }

export default function BillingScreen({ navigation }: any) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [billedBy, setBilledBy] = useState('Staff');
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // New Fields
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<number | null>(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingNote, setShippingNote] = useState('');
  const [installationCharge, setInstallationCharge] = useState('0');
  
  // Barcode Scanning
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: prodData } = await supabase.from('products').select('id, name, sku, selling_price').order('name');
      setProducts(prodData || []);
      
      const { data: pmData } = await supabase.from('payment_methods').select('id, name').eq('is_active', true);
      setPaymentMethods(pmData || []);
      if (pmData && pmData.length > 0) setSelectedMethod(pmData[0].id);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await supabase.from('users').select('full_name').eq('auth_id', user.id).single();
        setBilledBy(p?.full_name || 'Staff');
      }
    };
    load();
  }, []);

  const startScanning = async () => {
    if (!permission) {
      const res = await requestPermission();
      if (!res.granted) return Alert.alert('Permission denied', 'Camera access is required for scanning.');
    } else if (!permission.granted) {
      const res = await requestPermission();
      if (!res.granted) return Alert.alert('Permission denied', 'Camera access is required for scanning.');
    }
    setScanned(false);
    setIsScanning(true);
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(search.toLowerCase())
  ).slice(0, 15);

  const addToCart = (p: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...p, quantity: 1, discount_pct: 0 }];
    });
    setSearch(''); setShowDrop(false);
    setIsScanning(false);
  };

  const handleBarCodeScanned = ({ data }: any) => {
    if (scanned) return;
    setScanned(true);
    const prod = products.find(p => p.sku === data || p.name === data);
    if (prod) {
      addToCart(prod);
      Alert.alert('Success', `Added ${prod.name}`);
    } else {
      Alert.alert('Not Found', `Product with SKU/Barcode ${data} not found.`);
      setScanned(false);
    }
  };

  const updateQty = (id: number, delta: number) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const removeItem = (id: number) => setCart(prev => prev.filter(i => i.id !== id));
  
  const getSubtotal = () => cart.reduce((s, i) => s + i.selling_price * i.quantity, 0);
  const getDiscount = () => cart.reduce((s, i) => s + i.selling_price * i.quantity * (i.discount_pct / 100), 0);
  const getTotal = () => getSubtotal() - getDiscount() + parseFloat(installationCharge || '0');

  const saveBill = async () => {
    if (cart.length === 0) return Alert.alert('Error', 'Cart is empty');
    if (!customerName.trim()) return Alert.alert('Error', 'Enter customer name');
    setSaving(true);
    try {
      let custId: number | null = null;
      if (customerPhone) {
        const { data: ex } = await supabase.from('billing_customers').select('id').eq('phone', customerPhone).maybeSingle();
        if (ex) custId = ex.id;
      }
      if (!custId) {
        const { data: nc } = await supabase.from('billing_customers').insert({ name: customerName, phone: customerPhone || '' }).select('id').single();
        custId = nc?.id || null;
      }
      
      const subtotal = getSubtotal();
      const discountTotal = getDiscount();
      const grand = getTotal();
      
      const { data: bill, error } = await supabase.from('bills').insert({ 
        customer_id: custId, 
        billed_by: billedBy, 
        platform: 'mobile',
        subtotal, 
        discount_total: discountTotal, 
        grand_total: grand,
        payment_method_id: selectedMethod,
        payment_ref: paymentRef,
        shipping_address: shippingAddress,
        shipping_note: shippingNote,
        installation_charge: parseFloat(installationCharge || '0')
      }).select('id, invoice_number').single();
      
      if (error) throw error;
      await supabase.from('bill_items').insert(cart.map(i => ({ 
        bill_id: bill.id, 
        product_id: i.id, 
        product_name: i.name, 
        sku: i.sku || '', 
        quantity: i.quantity, 
        mrp: i.selling_price, 
        discount_pct: i.discount_pct, 
        discount_amt: i.selling_price * i.quantity * (i.discount_pct / 100), 
        price: i.selling_price * i.quantity * (1 - i.discount_pct / 100) 
      })));
      
      Alert.alert('✅ Bill Saved', `Invoice: ${bill.invoice_number}\nTotal: ৳${grand.toFixed(2)}`);
      setCart([]); setCustomerName(''); setCustomerPhone(''); setPaymentRef(''); setShippingAddress(''); setShippingNote(''); setInstallationCharge('0');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const s = makeStyles(theme);

  if (isScanning) {
    return (
      <View style={s.scannerRoot}>
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "code128", "code39", "upc_a"],
          }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={s.scannerOverlay}>
          <Text style={s.scannerTitle}>Scan Product Barcode</Text>
          <TouchableOpacity style={s.closeScanner} onPress={() => setIsScanning(false)}>
            <X color="#fff" size={24} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {/* Fixed Top Bar */}
      <View style={s.header}>
        <Text style={s.title}>Billing / POS</Text>
        <TouchableOpacity onPress={() => navigation.navigate('BillHistory')} style={s.outlineBtn}>
          <Text style={s.outlineBtnText}>History</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareContainer>
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* Customer */}
          <View style={[s.section, { padding: 12, marginBottom: 12 }]}>
            <Text style={[s.sectionLabel, { marginBottom: 8 }]}>Customer Details</Text>
            <View style={[s.inputRow, { paddingVertical: 2 }]}>
              <User color={theme.textMuted} size={16} />
              <TextInput style={[s.input, { paddingVertical: 8 }]} value={customerName} onChangeText={setCustomerName}
                placeholder="Customer Name *" placeholderTextColor={theme.textMuted} />
            </View>
            <View style={[s.inputRow, { marginTop: 6, paddingVertical: 2 }]}>
              <TextInput style={[s.input, { paddingVertical: 8 }]} value={customerPhone} onChangeText={setCustomerPhone}
                placeholder="Phone / Mobile" placeholderTextColor={theme.textMuted} keyboardType="phone-pad" />
            </View>
          </View>

          {/* Product Search */}
          <View style={[s.section, { padding: 12, marginBottom: 12 }]}>
            <Text style={[s.sectionLabel, { marginBottom: 8 }]}>Inventory</Text>
            <View style={s.searchRow}>
              <View style={[s.inputRow, { flex: 1 }]}>
                <Search color={theme.textMuted} size={16} />
                <TextInput style={s.input} value={search}
                  onChangeText={t => { setSearch(t); setShowDrop(t.length > 0); }}
                  placeholder="Items or SKU..." placeholderTextColor={theme.textMuted} />
              </View>
              <TouchableOpacity style={s.scanBtn} onPress={startScanning}>
                <Scan color={theme.accent} size={20} />
              </TouchableOpacity>
            </View>
            {showDrop && (
              <View style={s.dropdown}>
                {filtered.map(p => (
                  <TouchableOpacity key={p.id} style={s.dropItem} onPress={() => addToCart(p)}>
                    <Text style={s.dropName}>{p.name}</Text>
                    <Text style={[s.dropPrice, { color: theme.accent }]}>৳{p.selling_price}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Cart */}
          {cart.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Items Bag</Text>
              {cart.map(item => (
                <View key={item.id} style={s.cartItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cartName}>{item.name}</Text>
                    <Text style={s.cartMeta}>৳{item.selling_price} × {item.quantity}</Text>
                  </View>
                  <View style={s.qtyRow}>
                    <TouchableOpacity onPress={() => updateQty(item.id, -1)} style={s.qBtn}><Minus color={theme.textPrimary} size={14} /></TouchableOpacity>
                    <Text style={s.qtyText}>{item.quantity}</Text>
                    <TouchableOpacity onPress={() => updateQty(item.id, 1)} style={s.qBtn}><Plus color={theme.textPrimary} size={14} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => removeItem(item.id)} style={[s.qBtn, { backgroundColor: theme.dangerLight }]}><Trash2 color={theme.danger} size={14} /></TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Shipping & Payment */}
          <View style={[s.section, { padding: 12, marginBottom: 12 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[s.sectionLabel, { marginBottom: 0 }]}>Payment Setup</Text>
              <TouchableOpacity onPress={() => setShowAdvanced(!showAdvanced)}>
                <Text style={{ fontSize: 12, color: theme.accent, fontWeight: '600' }}>
                  {showAdvanced ? 'Hide Advanced' : 'Show Shipping & Extras'}
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={[s.pickerContainer, { marginBottom: 4 }]}>
              <Picker
                selectedValue={selectedMethod}
                onValueChange={(v) => setSelectedMethod(v)}
                style={{ color: theme.textPrimary, height: 44 }}
                dropdownIconColor={theme.textMuted}
              >
                {paymentMethods.map(m => <Picker.Item key={m.id} label={m.name} value={m.id} />)}
              </Picker>
            </View>
            
            {showAdvanced && (
              <View>
                <Text style={[s.fieldLabel, { marginTop: 12 }]}>Transaction Ref / Note</Text>
                <View style={[s.inputRow, { paddingVertical: 2 }]}>
                  <TextInput style={[s.input, { paddingVertical: 8 }]} value={paymentRef} onChangeText={setPaymentRef}
                    placeholder="Ref number or ID..." placeholderTextColor={theme.textMuted} />
                </View>

                <Text style={[s.fieldLabel, { marginTop: 12 }]}>Installation Charge (৳)</Text>
                <View style={[s.inputRow, { paddingVertical: 2 }]}>
                  <TextInput style={[s.input, { paddingVertical: 8 }]} value={installationCharge} onChangeText={setInstallationCharge}
                    keyboardType="numeric" placeholder="0.00" placeholderTextColor={theme.textMuted} />
                </View>

                <Text style={[s.fieldLabel, { marginTop: 12 }]}>Shipping Address</Text>
                <View style={[s.inputRow, { alignItems: 'flex-start', minHeight: 60, paddingVertical: 2 }]}>
                  <TextInput style={[s.input, { textAlignVertical: 'top', paddingVertical: 8 }]} value={shippingAddress} onChangeText={setShippingAddress}
                    placeholder="House, Area, City..." placeholderTextColor={theme.textMuted} multiline />
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAwareContainer>

      {/* Footer */}
      <View style={s.footer}>
        <View>
          <Text style={s.totalLabel}>Grand Total</Text>
          <Text style={[s.totalValue, { color: theme.success }]}>৳{getTotal().toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={[s.saveBtn, { backgroundColor: theme.success }, (saving || cart.length === 0) && { opacity: 0.5 }]}
          onPress={saveBill} disabled={saving || cart.length === 0}>
          {saving ? <ActivityIndicator color="#fff" /> : (
            <><Save color="#fff" size={17} /><Text style={s.saveBtnText}>Save Bill</Text></>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20 },
  title: { color: theme.textPrimary, fontSize: 22, fontWeight: '800' },
  outlineBtn: { backgroundColor: theme.bgCard, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.border },
  outlineBtnText: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  section: { backgroundColor: theme.bgCard, borderRadius: 16, marginHorizontal: 16, marginBottom: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  sectionLabel: { color: theme.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  fieldLabel: { color: theme.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border, gap: 8 },
  input: { flex: 1, color: theme.textPrimary, paddingVertical: 12, fontSize: 15 },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  scanBtn: { backgroundColor: theme.bgElevated, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.border },
  dropdown: { backgroundColor: theme.bgCard, borderRadius: 10, marginTop: 6, borderWidth: 1, borderColor: theme.border, maxHeight: 200 },
  dropItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  dropName: { color: theme.textPrimary, fontWeight: '500', flex: 1 },
  dropPrice: { fontWeight: '700' },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  cartName: { color: theme.textPrimary, fontWeight: '600', fontSize: 15 },
  cartMeta: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qBtn: { backgroundColor: theme.bgElevated, borderRadius: 8, padding: 8 },
  qtyText: { color: theme.textPrimary, fontWeight: '700', minWidth: 24, textAlign: 'center', fontSize: 16 },
  pickerContainer: { backgroundColor: theme.bgInput, borderRadius: 12, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: theme.bgCard, borderTopWidth: 1, borderTopColor: theme.border, paddingBottom: 30 },
  totalLabel: { color: theme.textMuted, fontSize: 13 },
  totalValue: { fontSize: 24, fontWeight: '900' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  scannerRoot: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 60, paddingHorizontal: 20, alignItems: 'center' },
  scannerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  closeScanner: { position: 'absolute', top: 55, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
});
