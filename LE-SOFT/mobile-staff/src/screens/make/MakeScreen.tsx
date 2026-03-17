import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, SafeAreaView, RefreshControl, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Briefcase, X, Check } from 'lucide-react-native';

export default function MakeScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('make_orders')
      .select('*, make_order_parts(*)')
      .order('created_at', { ascending: false })
      .limit(50);
    setOrders(data || []);
  };

  useEffect(() => { fetchOrders(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchOrders(); setRefreshing(false); }, []);

  const updateStatus = async (id: number, newStatus: string) => {
    const { error } = await supabase.from('make_orders').update({ status: newStatus }).eq('id', id);
    if (error) return Alert.alert('Error', error.message);
    setSelected((prev: any) => ({ ...prev, status: newStatus }));
    fetchOrders();
  };

  const statusColor = (s: string) => ({ Placed: '#3b82f6', 'In Production': '#f59e0b', Delivered: '#10b981', Cancelled: '#ef4444' }[s] || '#6b7280');

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Make / Production</Text></View>
      <FlatList
        data={orders}
        keyExtractor={i => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={s.empty}>No production orders.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => setSelected(item)}>
            <View style={s.iconBox}><Briefcase color="#8b5cf6" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.orderName}>{item.item_name || `Order #${item.id}`}</Text>
              <Text style={s.meta}>Qty: {item.quantity || 1}{item.customer_name ? ` · ${item.customer_name}` : ''}</Text>
              <Text style={s.meta}>{new Date(item.created_at).toLocaleDateString('en-GB')}</Text>
            </View>
            <View>
              <Text style={[s.status, { color: statusColor(item.status) }]}>{item.status}</Text>
              {item.delivery_date && <Text style={s.deliver}>Due: {item.delivery_date}</Text>}
            </View>
          </TouchableOpacity>
        )}
      />
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>{selected?.item_name || `Order #${selected?.id}`}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}><X color="#6b7280" size={22} /></TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={[s.status, { color: statusColor(selected?.status), marginBottom: 12 }]}>{selected?.status}</Text>
              {[['Customer', selected?.customer_name], ['Quantity', selected?.quantity], ['Delivery Date', selected?.delivery_date], ['Notes', selected?.notes]].map(([k, v]) => v ? (
                <View key={String(k)} style={s.detailRow}>
                  <Text style={s.detailKey}>{k}</Text>
                  <Text style={s.detailVal}>{String(v)}</Text>
                </View>
              ) : null)}
              {(selected?.make_order_parts || []).length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { marginTop: 16 }]}>Parts / Components</Text>
                  {selected.make_order_parts.map((p: any, i: number) => (
                    <View key={i} style={s.partRow}>
                      <Text style={s.partName}>{p.part_name}</Text>
                      <Text style={s.partMeta}>{p.material} · {p.dimensions}</Text>
                    </View>
                  ))}
                </>
              )}

              <Text style={[s.sectionLabel, { marginTop: 24 }]}>Update Status</Text>
              <View style={s.statusGrid}>
                {['Placed', 'In Production', 'Delivered', 'Cancelled'].map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[s.statusBtn, selected?.status === st && { backgroundColor: statusColor(st) }]}
                    onPress={() => updateStatus(selected.id, st)}
                  >
                    <Text style={[s.statusBtnText, selected?.status === st && { color: '#fff' }]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#222', gap: 12 },
  iconBox: { width: 44, height: 44, backgroundColor: '#2d1b6e', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  orderName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  meta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  status: { fontWeight: '700', fontSize: 13, textAlign: 'right' },
  deliver: { color: '#6b7280', fontSize: 11, marginTop: 2, textAlign: 'right' },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', flex: 1, marginRight: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  detailKey: { color: '#6b7280', fontSize: 14 },
  detailVal: { color: '#fff', fontWeight: '600', fontSize: 14, maxWidth: '60%', textAlign: 'right' },
  sectionLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  partRow: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, marginBottom: 6 },
  partName: { color: '#fff', fontWeight: '600' },
  partMeta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 40 },
  statusBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#333', minWidth: '48%' },
  statusBtnText: { color: '#9ca3af', fontWeight: '700', fontSize: 13, textAlign: 'center' },
});
