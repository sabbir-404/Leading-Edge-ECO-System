import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, FlatList, Modal } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { decryptRows, encryptObjectForDb } from '../../lib/encryption';
import { Calendar, Tag, Plus, Trash2, Check, Search, X } from 'lucide-react-native';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';

interface Entry {
  ledger_id: number;
  ledger_name: string;
  amount: string;
  type: 'Dr' | 'Cr';
}

export default function VoucherEntryScreen({ route, navigation }: any) {
  const { theme } = useTheme();
  const voucherType = route.params?.type || 'Receipt';
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState<Entry[]>([
    { ledger_id: 0, ledger_name: '', amount: '', type: 'Dr' },
    { ledger_id: 0, ledger_name: '', amount: '', type: 'Cr' }
  ]);
  const [narration, setNarration] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Ledger Search
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchIdx, setSearchIdx] = useState(-1);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const fetchLedgers = async () => {
      const { data } = await supabase.from('ledgers').select('id, name').order('name');
      setLedgers(decryptRows(data || []));
    };
    fetchLedgers();
  }, []);

  const addEntry = () => {
    setEntries([...entries, { ledger_id: 0, ledger_name: '', amount: '', type: entries[entries.length-1].type === 'Dr' ? 'Cr' : 'Dr' }]);
  };

  const removeEntry = (index: number) => {
    if (entries.length <= 2) return;
    setEntries(entries.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: keyof Entry, value: string) => {
    const newEntries = [...entries];
    (newEntries[index] as any)[field] = value;
    setEntries(newEntries);
  };

  const selectLedger = (ledger: any) => {
    updateEntry(searchIdx, 'ledger_id', ledger.id);
    updateEntry(searchIdx, 'ledger_name', ledger.name);
    setShowSearch(false);
    setQuery('');
  };

  const validateBalances = () => {
    const dr = entries.filter(e => e.type === 'Dr').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const cr = entries.filter(e => e.type === 'Cr').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    return Math.abs(dr - cr) < 0.01;
  };

  const handleSubmit = async () => {
    if (!validateBalances()) return Alert.alert('Unbalanced', 'Total Debit must equal Total Credit');
    if (entries.some(e => !e.ledger_id || !e.amount)) return Alert.alert('Error', 'Please fill all fields');

    setLoading(true);
    try {
      const vNum = `${voucherType[0]}${Date.now().toString().slice(-6)}`;
      
      const voucherPayload = encryptObjectForDb({
        voucher_type: voucherType,
        voucher_number: vNum,
        date,
        narration,
        total_amount: entries.filter(e => e.type === 'Dr').reduce((s, e) => s + parseFloat(e.amount), 0),
        company_id: 1
      });

      const { data: v, error: vErr } = await supabase.from('vouchers').insert(voucherPayload).select().single();

      if (vErr) throw vErr;

      const entriesToInsert = entries.map(e => ({
        voucher_id: v.id,
        ledger_id: e.ledger_id,
        amount: parseFloat(e.amount),
        type: e.type
      }));

      const { error: eErr } = await supabase.from('voucher_entries').insert(entriesToInsert);
      if (eErr) throw eErr;

      Alert.alert('Success', `${voucherType} saved successfully!`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredLedgers = ledgers.filter(l => l.name.toLowerCase().includes(query.toLowerCase()));
  const s = makeStyles(theme);

  return (
    <View style={s.root}>
      <KeyboardAwareContainer>
        <ScrollView style={s.form}>
          {/* Header Info */}
          <View style={s.row}>
            <View style={[s.inputGroup, { flex: 1 }]}>
              <Text style={s.label}>Voucher Date</Text>
              <View style={s.inputRow}>
                <Calendar size={16} color={theme.textMuted} />
                <TextInput style={s.input} value={date} onChangeText={setDate} />
              </View>
            </View>
            <View style={[s.inputGroup, { flex: 1, marginLeft: 12 }]}>
              <Text style={s.label}>Voucher Type</Text>
              <View style={[s.inputRow, { backgroundColor: theme.bgElevated }]}>
                <Tag size={16} color={theme.accent} />
                <Text style={[s.input, { color: theme.accent, fontWeight: '700' }]}>{voucherType}</Text>
              </View>
            </View>
          </View>

          {/* Entries */}
          <Text style={[s.label, { marginTop: 12, marginBottom: 8 }]}>Ledger Entries</Text>
          {entries.map((entry, i) => (
            <View key={i} style={s.entryCard}>
              <View style={s.entryHeader}>
                <TouchableOpacity 
                  style={[s.typeBtn, { backgroundColor: entry.type === 'Dr' ? theme.accent + '22' : theme.success + '22' }]}
                  onPress={() => updateEntry(i, 'type', entry.type === 'Dr' ? 'Cr' : 'Dr')}
                >
                  <Text style={[s.typeText, { color: entry.type === 'Dr' ? theme.accent : theme.success }]}>{entry.type}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeEntry(i)} style={s.removeBtn}>
                  <Trash2 size={16} color={theme.danger} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={s.ledgerPicker} 
                onPress={() => { setSearchIdx(i); setShowSearch(true); }}
              >
                <Text style={[s.ledgerText, !entry.ledger_name && { color: theme.textMuted }]}>
                  {entry.ledger_name || 'Select Ledger...'}
                </Text>
                <Search size={16} color={theme.textMuted} />
              </TouchableOpacity>

              <View style={s.amountRow}>
                <Text style={s.amountLabel}>Amount</Text>
                <TextInput 
                  style={s.amountInput} 
                  value={entry.amount} 
                  onChangeText={(v) => updateEntry(i, 'amount', v)}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={theme.textMuted}
                />
              </View>
            </View>
          ))}

          <TouchableOpacity style={s.addBtn} onPress={addEntry}>
            <Plus size={20} color={theme.textPrimary} />
            <Text style={s.addBtnText}>Add Entry Line</Text>
          </TouchableOpacity>

          {/* Narration */}
          <View style={[s.inputGroup, { marginTop: 20 }]}>
            <Text style={s.label}>Narration</Text>
            <TextInput 
              style={[s.input, s.textArea]} 
              value={narration} 
              onChangeText={setNarration}
              placeholder="Enter notes..."
              placeholderTextColor={theme.textMuted}
              multiline
            />
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAwareContainer>

      {/* Footer Save */}
      <View style={[s.footer, { paddingBottom: 30 }]}>
        <TouchableOpacity style={s.saveBtn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Check size={20} color="#fff" />
              <Text style={s.saveBtnText}>Save {voucherType}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Ledger Search Modal */}
      <Modal visible={showSearch} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Ledger</Text>
              <TouchableOpacity onPress={() => setShowSearch(false)}><X size={24} color={theme.textPrimary} /></TouchableOpacity>
            </View>
            <View style={s.searchBar}>
              <Search size={20} color={theme.textMuted} />
              <TextInput 
                style={s.searchInput} 
                value={query} 
                onChangeText={setQuery}
                placeholder="Search ledgers..."
                placeholderTextColor={theme.textMuted}
                autoFocus
              />
            </View>
            <FlatList
              data={filteredLedgers}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.ledgerItem} onPress={() => selectLedger(item)}>
                  <Text style={s.ledgerItemName}>{item.name}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border }} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (t: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  form: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  inputGroup: { marginBottom: 16 },
  label: { color: t.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgInput, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: t.border, height: 48, gap: 10 },
  input: { flex: 1, color: t.textPrimary, fontSize: 15 },
  entryCard: { backgroundColor: t.bgCard, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: t.border },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  typeText: { fontWeight: '800', fontSize: 13 },
  removeBtn: { padding: 4 },
  ledgerPicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgInput, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: t.border, marginBottom: 12 },
  ledgerText: { flex: 1, color: t.textPrimary, fontSize: 15, fontWeight: '600' },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amountLabel: { color: t.textSecondary, fontSize: 14 },
  amountInput: { color: t.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'right', flex: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: t.bgCard, borderRadius: 12, paddingVertical: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: t.border, gap: 8 },
  addBtnText: { color: t.textPrimary, fontWeight: '700' },
  textArea: { height: 80, padding: 12, textAlignVertical: 'top' },
  footer: { padding: 16, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.border },
  saveBtn: { backgroundColor: t.accent, borderRadius: 16, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: t.bgCard, borderRadius: 24, maxHeight: '80%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: t.textPrimary, fontSize: 20, fontWeight: '800' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgInput, borderRadius: 14, paddingHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: t.border, height: 50, gap: 10 },
  searchInput: { flex: 1, color: t.textPrimary, fontSize: 16 },
  ledgerItem: { paddingVertical: 16 },
  ledgerItemName: { color: t.textPrimary, fontSize: 16, fontWeight: '600' },
});
