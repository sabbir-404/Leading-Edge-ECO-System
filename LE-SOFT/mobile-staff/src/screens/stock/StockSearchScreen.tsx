import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, SafeAreaView, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Search, Package, X } from 'lucide-react-native';

export default function StockSearchScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('stock_items').select('*').order('name');
      setItems(data || []);
    };
    load();
  }, []);

  const filtered = query.length > 0
    ? items.filter(i =>
        i.name?.toLowerCase().includes(query.toLowerCase()) ||
        (i.sku || '').toLowerCase().includes(query.toLowerCase()) ||
        (i.category || '').toLowerCase().includes(query.toLowerCase())
      )
    : items.slice(0, 30);

  const stockColor = (qty: number) => {
    if (qty <= 0) return '#ef4444';
    if (qty <= 10) return '#f59e0b';
    return '#10b981';
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Stock Search</Text>
      </View>
      <View style={s.searchBox}>
        <Search color="#6b7280" size={18} />
        <TextInput
          style={s.searchInput} value={query} onChangeText={setQuery}
          placeholder="Search by name, SKU, or category..." placeholderTextColor="#555"
          autoFocus={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}><X color="#6b7280" size={18} /></TouchableOpacity>
        )}
      </View>
      <Text style={s.count}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</Text>
      <FlatList
        data={filtered}
        keyExtractor={i => i.id.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => setSelected(item)}>
            <View style={s.iconBox}><Package color="#f59e0b" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.sku}>SKU: {item.sku || 'N/A'}{item.category ? ` · ${item.category}` : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.qty, { color: stockColor(item.opening_stock || 0) }]}>
                {item.opening_stock || 0}
              </Text>
              <Text style={s.qtyLabel}>in stock</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Detail Modal */}
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{selected?.name}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}><X color="#6b7280" size={22} /></TouchableOpacity>
            </View>
            <ScrollView>
              {[
                ['SKU', selected?.sku || 'N/A'],
                ['Category', selected?.category || 'N/A'],
                ['Unit', selected?.unit || 'N/A'],
                ['Opening Stock', selected?.opening_stock ?? 0],
                ['Selling Price', selected?.selling_price ? `৳${selected.selling_price}` : 'N/A'],
                ['Purchase Price', selected?.purchase_price ? `৳${selected.purchase_price}` : 'N/A'],
              ].map(([k, v]) => (
                <View key={String(k)} style={s.detailRow}>
                  <Text style={s.detailKey}>{k}</Text>
                  <Text style={s.detailVal}>{String(v)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { padding: 16, paddingTop: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#222', gap: 10 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  count: { color: '#6b7280', fontSize: 12, paddingHorizontal: 16, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#222', gap: 12 },
  iconBox: { width: 42, height: 42, backgroundColor: '#3b2a0a', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontWeight: '600', fontSize: 14 },
  sku: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  qty: { fontSize: 18, fontWeight: '800' },
  qtyLabel: { color: '#6b7280', fontSize: 11 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', flex: 1, marginRight: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  detailKey: { color: '#6b7280', fontSize: 14 },
  detailVal: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
