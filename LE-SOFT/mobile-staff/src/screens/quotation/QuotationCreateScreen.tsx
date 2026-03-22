import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { encryptObjectForDb } from '../../lib/encryption';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';
import { Save, Plus, Trash2, User, Building, MapPin, Phone, Mail } from 'lucide-react-native';

interface QuoteItem {
  sl_no: number;
  specification: string;
  unit: string;
  quantity: number;
  rate: number;
}

export default function QuotationCreateScreen({ navigation }: any) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);

  // Customer State
  const [companyName, setCompanyName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Totals State
  const [fitting, setFitting] = useState('0');
  const [delivery, setDelivery] = useState('0');
  const [discount, setDiscount] = useState('0');

  // Items
  const [items, setItems] = useState<QuoteItem[]>([{ sl_no: 1, specification: '', unit: 'pcs', quantity: 1, rate: 0 }]);

  const addItem = () => {
    setItems([...items, { sl_no: items.length + 1, specification: '', unit: 'pcs', quantity: 1, rate: 0 }]);
  };

  const updateItem = (index: number, field: keyof QuoteItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index).map((it, i) => ({ ...it, sl_no: i + 1 })));
  };

  const getSubtotal = () => items.reduce((sum, it) => sum + (it.quantity * it.rate), 0);
  const getGrandTotal = () => getSubtotal() + parseFloat(fitting || '0') + parseFloat(delivery || '0') - parseFloat(discount || '0');

  const saveQuote = async () => {
    if (!customerName && !companyName) return Alert.alert('Error', 'Please enter customer or company name');
    setLoading(true);
    try {
      const quotePayload = encryptObjectForDb({
        company_name: companyName,
        customer_name: customerName,
        customer_address: address,
        customer_mobile: phone,
        customer_email: email,
        fitting_charge: parseFloat(fitting || '0'),
        delivery_charge: parseFloat(delivery || '0'),
        discount: parseFloat(discount || '0'),
        grand_total: getGrandTotal(),
        status: 'Draft'
      });

      const { data: quote, error } = await supabase.from('quotations').insert(quotePayload).select('id, quote_number').single();

      if (error) throw error;

      const itemPayload = items.map((it) => encryptObjectForDb({
        quotation_id: quote.id,
        sl_no: it.sl_no,
        specification: it.specification,
        unit: it.unit,
        quantity: it.quantity,
        rate: it.rate
      }));

      const { error: itemsError } = await supabase.from('quotation_items').insert(itemPayload);

      if (itemsError) {
        await supabase.from('quotations').delete().eq('id', quote.id);
        throw itemsError;
      }

      Alert.alert('Success', `Quotation ${quote.quote_number} created!`);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  const s = makeStyles(theme);

  return (
    <View style={s.root}>
      <KeyboardAwareContainer>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
          {/* Customer Section */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Customer Information</Text>
            <View style={s.inputRow}><Building size={16} color={theme.textMuted} /><TextInput style={s.input} placeholder="Company Name" value={companyName} onChangeText={setCompanyName} placeholderTextColor={theme.textMuted} /></View>
            <View style={[s.inputRow, { marginTop: 10 }]}><User size={16} color={theme.textMuted} /><TextInput style={s.input} placeholder="Contact Person *" value={customerName} onChangeText={setCustomerName} placeholderTextColor={theme.textMuted} /></View>
            <View style={[s.inputRow, { marginTop: 10 }]}><Phone size={16} color={theme.textMuted} /><TextInput style={s.input} placeholder="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={theme.textMuted} /></View>
            <View style={[s.inputRow, { marginTop: 10 }]}><MapPin size={16} color={theme.textMuted} /><TextInput style={s.input} placeholder="Address" value={address} onChangeText={setAddress} placeholderTextColor={theme.textMuted} /></View>
          </View>

          {/* Items Section */}
          <Text style={s.sectionTitle}>Items & Specifications</Text>
          {items.map((it, idx) => (
            <View key={idx} style={s.itemCard}>
              <View style={s.itemHeader}>
                <Text style={s.itemNo}>Item #{it.sl_no}</Text>
                <TouchableOpacity onPress={() => removeItem(idx)}><Trash2 size={18} color={theme.danger} /></TouchableOpacity>
              </View>
              <TextInput 
                style={[s.input, s.specInput]} 
                placeholder="Specifications..." 
                value={it.specification} 
                onChangeText={t => updateItem(idx, 'specification', t)}
                multiline placeholderTextColor={theme.textMuted}
              />
              <View style={s.itemRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={s.miniLabel}>Unit</Text>
                  <TextInput style={s.input} value={it.unit} onChangeText={t => updateItem(idx, 'unit', t)} placeholder="pcs" placeholderTextColor={theme.textMuted} />
                </View>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={s.miniLabel}>Qty</Text>
                  <TextInput style={s.input} value={it.quantity.toString()} onChangeText={t => updateItem(idx, 'quantity', parseFloat(t) || 0)} keyboardType="numeric" placeholderTextColor={theme.textMuted} />
                </View>
                <View style={{ flex: 1.5 }}>
                  <Text style={s.miniLabel}>Rate (৳)</Text>
                  <TextInput style={s.input} value={it.rate.toString()} onChangeText={t => updateItem(idx, 'rate', parseFloat(t) || 0)} keyboardType="numeric" placeholderTextColor={theme.textMuted} />
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity style={s.addBtn} onPress={addItem}>
            <Plus size={20} color={theme.accent} />
            <Text style={s.addBtnText}>Add Another Item</Text>
          </TouchableOpacity>

          {/* Charges Section */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Charges & Discounts</Text>
            <View style={s.chargeRow}>
              <Text style={s.chargeLabel}>Fitting Charge</Text>
              <TextInput style={s.chargeInput} value={fitting} onChangeText={setFitting} keyboardType="numeric" />
            </View>
            <View style={s.chargeRow}>
              <Text style={s.chargeLabel}>Delivery Charge</Text>
              <TextInput style={s.chargeInput} value={delivery} onChangeText={setDelivery} keyboardType="numeric" />
            </View>
            <View style={s.chargeRow}>
              <Text style={s.chargeLabel}>Discount</Text>
              <TextInput style={s.chargeInput} value={discount} onChangeText={setDiscount} keyboardType="numeric" />
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAwareContainer>

      {/* Footer */}
      <View style={s.footer}>
        <View>
          <Text style={s.totalLabel}>Grand Total</Text>
          <Text style={s.totalValue}>৳{getGrandTotal().toLocaleString()}</Text>
        </View>
        <TouchableOpacity style={s.saveBtn} onPress={saveQuote} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Save color="#fff" size={20} />}
          <Text style={s.saveBtnText}>Save Quote</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  section: { backgroundColor: theme.bgCard, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
  sectionLabel: { color: theme.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  sectionTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border, gap: 8 },
  input: { flex: 1, color: theme.textPrimary, paddingVertical: 10, fontSize: 14 },
  itemCard: { backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  itemNo: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  specInput: { backgroundColor: theme.bgInput, borderRadius: 10, minHeight: 60, textAlignVertical: 'top', paddingHorizontal: 12, marginTop: 4 },
  itemRow: { flexDirection: 'row', marginTop: 10 },
  miniLabel: { color: theme.textMuted, fontSize: 10, fontWeight: '600', marginBottom: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.accent, borderStyle: 'dotted', gap: 8, marginBottom: 20 },
  addBtnText: { color: theme.accent, fontWeight: '700' },
  chargeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  chargeLabel: { color: theme.textSecondary, fontWeight: '600' },
  chargeInput: { backgroundColor: theme.bgInput, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, color: theme.textPrimary, width: 80, textAlign: 'right', borderWidth: 1, borderColor: theme.border },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: theme.bgCard, borderTopWidth: 1, borderTopColor: theme.border, paddingBottom: 30 },
  totalLabel: { color: theme.textMuted, fontSize: 13 },
  totalValue: { color: theme.textPrimary, fontSize: 24, fontWeight: '900' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accent, gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
