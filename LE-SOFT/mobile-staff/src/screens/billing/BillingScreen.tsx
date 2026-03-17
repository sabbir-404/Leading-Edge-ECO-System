import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';
import { Search, Plus, Minus, Trash2, Save, User, X } from 'lucide-react-native';

interface Product { id: number; name: string; sku: string; selling_price: number; }
interface CartItem extends Product { quantity: number; discount_pct: number; }

export default function BillingScreen({ navigation }: any) {
  const { theme } = useTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [billedBy, setBilledBy] = useState('Staff');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('stock_items').select('id, name, sku, selling_price').order('name');
      setProducts(data || []);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await supabase.from('users').select('full_name').eq('auth_id', user.id).single();
        setBilledBy(p?.full_name || 'Staff');
      }
    };
    load();
  }, []);

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
  };

  const updateQty = (id: number, delta: number) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const removeItem = (id: number) => setCart(prev => prev.filter(i => i.id !== id));
  const getTotal = () => cart.reduce((s, i) => s + i.selling_price * i.quantity * (1 - i.discount_pct / 100), 0);

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
      const subtotal = cart.reduce((s, i) => s + i.selling_price * i.quantity, 0);
      const discountTotal = cart.reduce((s, i) => s + i.selling_price * i.quantity * (i.discount_pct / 100), 0);
      const grand = subtotal - discountTotal;
      const { data: bill, error } = await supabase.from('bills').insert({ customer_id: custId, billed_by: billedBy, subtotal, discount_total: discountTotal, grand_total: grand }).select('id, invoice_number').single();
      if (error) throw error;
      await supabase.from('bill_items').insert(cart.map(i => ({ bill_id: bill.id, product_id: i.id, product_name: i.name, sku: i.sku || '', quantity: i.quantity, mrp: i.selling_price, discount_pct: i.discount_pct, discount_amt: i.selling_price * i.quantity * (i.discount_pct / 100), price: i.selling_price * i.quantity * (1 - i.discount_pct / 100) })));
      Alert.alert('✅ Bill Saved', `Invoice: ${bill.invoice_number}\nTotal: ৳${grand.toFixed(2)}`);
      setCart([]); setCustomerName(''); setCustomerPhone('');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const s = makeStyles(theme);

  return (
    <View style={s.root}>
      <KeyboardAwareContainer>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Billing / POS</Text>
          <TouchableOpacity onPress={() => navigation.navigate('BillHistory')} style={s.outlineBtn}>
            <Text style={s.outlineBtnText}>History</Text>
          </TouchableOpacity>
        </View>

        {/* Customer */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Customer Details</Text>
          <Text style={s.fieldLabel}>Name *</Text>
          <View style={s.inputRow}>
            <User color={theme.textMuted} size={16} />
            <TextInput style={s.input} value={customerName} onChangeText={setCustomerName}
              placeholder="Customer name..." placeholderTextColor={theme.textMuted} returnKeyType="next" />
          </View>
          <Text style={[s.fieldLabel, { marginTop: 10 }]}>Phone</Text>
          <View style={s.inputRow}>
            <TextInput style={s.input} value={customerPhone} onChangeText={setCustomerPhone}
              placeholder="+880..." placeholderTextColor={theme.textMuted} keyboardType="phone-pad" />
          </View>
        </View>

        {/* Product Search */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Add Product</Text>
          <View style={s.inputRow}>
            <Search color={theme.textMuted} size={16} />
            <TextInput style={s.input} value={search}
              onChangeText={t => { setSearch(t); setShowDrop(t.length > 0); }}
              placeholder="Search name or SKU..." placeholderTextColor={theme.textMuted} returnKeyType="search" />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => { setSearch(''); setShowDrop(false); }}><X color={theme.textMuted} size={16} /></TouchableOpacity>
            )}
          </View>
          {showDrop && (
            <View style={s.dropdown}>
              {filtered.length === 0
                ? <Text style={s.emptyDrop}>No products found</Text>
                : filtered.map(p => (
                  <TouchableOpacity key={p.id} style={s.dropItem} onPress={() => addToCart(p)}>
                    <Text style={s.dropName}>{p.name}</Text>
                    <Text style={[s.dropPrice, { color: theme.accent }]}>৳{p.selling_price}</Text>
                  </TouchableOpacity>
                ))
              }
            </View>
          )}
        </View>

        {/* Cart */}
        {cart.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Cart · {cart.length} item{cart.length > 1 ? 's' : ''}</Text>
            {cart.map(item => (
              <View key={item.id} style={s.cartItem}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cartName}>{item.name}</Text>
                  <Text style={s.cartMeta}>৳{item.selling_price} × {item.quantity} = ৳{(item.selling_price * item.quantity).toFixed(2)}</Text>
                </View>
                <View style={s.qtyRow}>
                  <TouchableOpacity onPress={() => updateQty(item.id, -1)} style={[s.qBtn, { backgroundColor: theme.bgElevated }]}><Minus color={theme.textPrimary} size={13} /></TouchableOpacity>
                  <Text style={s.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity onPress={() => updateQty(item.id, 1)} style={[s.qBtn, { backgroundColor: theme.bgElevated }]}><Plus color={theme.textPrimary} size={13} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => removeItem(item.id)} style={[s.qBtn, { backgroundColor: theme.dangerLight }]}><Trash2 color={theme.danger} size={13} /></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
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
    </View>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20 },
  title: { color: theme.textPrimary, fontSize: 22, fontWeight: '800' },
  outlineBtn: { backgroundColor: theme.bgCard, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.border },
  outlineBtnText: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  section: { backgroundColor: theme.bgCard, borderRadius: 16, marginHorizontal: 16, marginBottom: 12, padding: 16, borderWidth: 1, borderColor: theme.border },
  sectionLabel: { color: theme.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  fieldLabel: { color: theme.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border, gap: 8 },
  input: { flex: 1, color: theme.textPrimary, paddingVertical: 11, fontSize: 15 },
  dropdown: { backgroundColor: theme.bgCard, borderRadius: 10, marginTop: 6, borderWidth: 1, borderColor: theme.border, maxHeight: 200, overflow: 'hidden' },
  dropItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  dropName: { color: theme.textPrimary, fontWeight: '500', flex: 1 },
  dropPrice: { fontWeight: '700' },
  emptyDrop: { color: theme.textMuted, textAlign: 'center', padding: 12 },
  cartItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  cartName: { color: theme.textPrimary, fontWeight: '600', fontSize: 14 },
  cartMeta: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  qBtn: { borderRadius: 8, padding: 6 },
  qtyText: { color: theme.textPrimary, fontWeight: '700', minWidth: 22, textAlign: 'center', fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: theme.bgCard, borderTopWidth: 1, borderTopColor: theme.border },
  totalLabel: { color: theme.textMuted, fontSize: 12 },
  totalValue: { fontSize: 22, fontWeight: '800' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
