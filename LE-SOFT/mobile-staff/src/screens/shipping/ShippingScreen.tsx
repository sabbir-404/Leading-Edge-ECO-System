import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, SafeAreaView, RefreshControl, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Truck, X } from 'lucide-react-native';

export default function ShippingScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('bill_shipping')
      .select('*, bills(invoice_number, grand_total)')
      .order('created_at', { ascending: false })
      .limit(60);
    setOrders(data || []);
  };

  useEffect(() => { fetchOrders(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchOrders(); setRefreshing(false); }, []);

  const statusColor = (s: string) => ({
    Pending: '#f59e0b', Dispatched: '#3b82f6', Delivered: '#10b981', Cancelled: '#ef4444',
  }[s] || '#6b7280');

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Shipping</Text></View>
      <FlatList
        data={orders}
        keyExtractor={i => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={s.empty}>No shipping orders.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => setSelected(item)}>
            <View style={s.iconBox}><Truck color="#ef4444" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.recipient}>{item.ship_to_name}</Text>
              <Text style={s.meta}>{item.ship_to_address}</Text>
              {item.bills?.invoice_number && <Text style={s.invoice}>Invoice: {item.bills.invoice_number}</Text>}
            </View>
            <Text style={[s.status, { color: statusColor(item.status || 'Pending') }]}>{item.status || 'Pending'}</Text>
          </TouchableOpacity>
        )}
      />
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>{selected?.ship_to_name}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}><X color="#6b7280" size={22} /></TouchableOpacity>
            </View>
            <ScrollView>
              {[
                ['Status', selected?.status || 'Pending'],
                ['Recipient Phone', selected?.ship_to_phone],
                ['Delivery Address', selected?.ship_to_address],
                ['Sender', selected?.ship_from_name],
                ['Sender Address', selected?.ship_from_address],
                ['Shipping Charge', selected?.shipping_charge ? `৳${selected.shipping_charge}` : '৳0'],
                ['Invoice', selected?.bills?.invoice_number],
              ].map(([k, v]) => v ? (
                <View key={String(k)} style={s.detailRow}>
                  <Text style={s.detailKey}>{k}</Text>
                  <Text style={s.detailVal}>{String(v)}</Text>
                </View>
              ) : null)}
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
  iconBox: { width: 44, height: 44, backgroundColor: '#3b0f0f', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recipient: { color: '#fff', fontWeight: '700', fontSize: 14 },
  meta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  invoice: { color: '#3b82f6', fontSize: 12, marginTop: 2 },
  status: { fontWeight: '700', fontSize: 13, textAlign: 'right' },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '75%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', flex: 1, marginRight: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  detailKey: { color: '#6b7280', fontSize: 14 },
  detailVal: { color: '#fff', fontWeight: '600', fontSize: 14, maxWidth: '60%', textAlign: 'right' },
});
