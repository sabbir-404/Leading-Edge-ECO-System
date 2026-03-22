import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, SafeAreaView, RefreshControl, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useResponsive } from '../../lib/responsive';
import { Truck, X } from 'lucide-react-native';

export default function ShippingScreen() {
  const { theme } = useTheme();
  const ui = useResponsive();
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
    Pending: theme.warning, Dispatched: theme.accent, Delivered: theme.success, Cancelled: theme.danger,
  }[s] || theme.textMuted);

  const s = makeStyles(theme, ui);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>Shipping</Text></View>
      <FlatList
        data={orders}
        keyExtractor={i => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ padding: ui.contentPadding, paddingBottom: ui.spacing(28) }}
        ItemSeparatorComponent={() => <View style={{ height: ui.spacing(10) }} />}
        ListEmptyComponent={<Text style={s.empty}>No shipping orders.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => setSelected(item)}>
            <View style={s.iconBox}><Truck color={theme.danger} size={ui.icon(20)} /></View>
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
              <TouchableOpacity onPress={() => setSelected(null)}><X color={theme.textMuted} size={ui.icon(22)} /></TouchableOpacity>
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

const makeStyles = (theme: any, ui: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: ui.contentPadding, paddingTop: ui.spacing(10), paddingBottom: ui.spacing(8) },
  title: { color: theme.textPrimary, fontSize: ui.font(22, 18, 28), fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgCard, borderRadius: ui.radius(14), padding: ui.cardPadding, minHeight: ui.isUltraCompact ? ui.scale(70) : ui.scale(76), borderWidth: 1, borderColor: theme.border, gap: ui.compactRowGap },
  iconBox: { width: ui.scale(44), height: ui.scale(44), backgroundColor: theme.dangerLight, borderRadius: ui.radius(12), alignItems: 'center', justifyContent: 'center' },
  recipient: { color: theme.textPrimary, fontWeight: '700', fontSize: ui.font(14) },
  meta: { color: theme.textMuted, fontSize: ui.font(12), marginTop: ui.spacing(1) },
  invoice: { color: theme.accent, fontSize: ui.font(12), marginTop: ui.spacing(1) },
  status: { fontWeight: '700', fontSize: ui.font(13), textAlign: 'right' },
  empty: { color: theme.textMuted, textAlign: 'center', marginTop: ui.spacing(40), fontSize: ui.font(14) },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modal: { backgroundColor: theme.bgCard, borderTopLeftRadius: ui.radius(24), borderTopRightRadius: ui.radius(24), padding: ui.contentPadding, maxHeight: '75%', borderWidth: 1, borderColor: theme.border },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: ui.spacing(12) },
  modalTitle: { color: theme.textPrimary, fontSize: ui.font(18), fontWeight: '800', flex: 1, marginRight: ui.spacing(10) },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: ui.compactDetailPadding, borderBottomWidth: 1, borderBottomColor: theme.border },
  detailKey: { color: theme.textMuted, fontSize: ui.font(13), flex: 1 },
  detailVal: { color: theme.textPrimary, fontWeight: '600', fontSize: ui.font(13), maxWidth: '55%', textAlign: 'right' },
});
