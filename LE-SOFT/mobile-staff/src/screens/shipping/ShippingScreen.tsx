import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, FlatList, SafeAreaView, RefreshControl, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useResponsive } from '../../lib/responsive';
import { Truck, X, Search, Filter } from 'lucide-react-native';

const STATUS_FILTERS = ['All', 'Pending', 'Dispatched', 'Delivered', 'Cancelled'] as const;
const DATE_FILTERS = ['All Time', 'Today', 'Last 7 Days'] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];
type DateFilter = (typeof DATE_FILTERS)[number];

export default function ShippingScreen({ route }: any) {
  const { theme } = useTheme();
  const ui = useResponsive();

  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('All Time');
  const [query, setQuery] = useState('');

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('bill_shipping')
      .select('*, bills(invoice_number, grand_total)')
      .order('created_at', { ascending: false })
      .limit(200);
    setOrders(data || []);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    const preset = route?.params?.presetStatus;
    if (preset && STATUS_FILTERS.includes(preset)) {
      setStatusFilter(preset);
    }
  }, [route?.params?.presetStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, []);

  const statusColor = (s: string) => ({
    Pending: theme.warning,
    Dispatched: theme.accent,
    Delivered: theme.success,
    Cancelled: theme.danger,
  }[s] || theme.textMuted);

  const filteredOrders = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

    return orders.filter((o) => {
      const statusOk = statusFilter === 'All' || String(o.status || 'Pending') === statusFilter;

      const createdAt = o.created_at ? new Date(o.created_at).getTime() : 0;
      const dateOk =
        dateFilter === 'All Time' ||
        (dateFilter === 'Today' && createdAt >= todayStart) ||
        (dateFilter === 'Last 7 Days' && createdAt >= weekStart);

      const q = query.trim().toLowerCase();
      const hay = `${o.ship_to_name || ''} ${o.ship_to_phone || ''} ${o.ship_to_address || ''} ${o.ship_from_name || ''} ${o.bills?.invoice_number || ''}`.toLowerCase();
      const queryOk = !q || hay.includes(q);

      return statusOk && dateOk && queryOk;
    });
  }, [orders, statusFilter, dateFilter, query]);

  const clearFilters = () => {
    setStatusFilter('All');
    setDateFilter('All Time');
    setQuery('');
  };

  const s = makeStyles(theme, ui);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Shipping</Text>
        <View style={s.headerMeta}>
          <Filter color={theme.textMuted} size={ui.icon(14)} />
          <Text style={s.headerMetaText}>{filteredOrders.length} / {orders.length}</Text>
        </View>
      </View>

      <View style={s.filterPanel}>
        <View style={s.searchRow}>
          <Search color={theme.textMuted} size={ui.icon(16)} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by recipient, phone, address, invoice..."
            placeholderTextColor={theme.textMuted}
          />
          {(query || statusFilter !== 'All' || dateFilter !== 'All Time') ? (
            <TouchableOpacity onPress={clearFilters} style={s.resetBtn}>
              <Text style={s.resetBtnText}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity key={f} style={[s.chip, statusFilter === f && s.chipActive]} onPress={() => setStatusFilter(f)}>
              <Text style={[s.chipText, statusFilter === f && s.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRowCompact}>
          {DATE_FILTERS.map((f) => (
            <TouchableOpacity key={f} style={[s.chipSmall, dateFilter === f && s.chipActive]} onPress={() => setDateFilter(f)}>
              <Text style={[s.chipTextSmall, dateFilter === f && s.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={(i) => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ padding: ui.contentPadding, paddingBottom: ui.spacing(28) }}
        ItemSeparatorComponent={() => <View style={{ height: ui.spacing(10) }} />}
        ListEmptyComponent={<Text style={s.empty}>No shipping orders for current filters.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => setSelected(item)}>
            <View style={s.iconBox}><Truck color={theme.danger} size={ui.icon(20)} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.recipient}>{item.ship_to_name}</Text>
              <Text style={s.meta} numberOfLines={1}>{item.ship_to_address}</Text>
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
  header: { paddingHorizontal: ui.contentPadding, paddingTop: ui.spacing(10), paddingBottom: ui.spacing(8), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.textPrimary, fontSize: ui.font(22, 18, 28), fontWeight: '800' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(5) },
  headerMetaText: { color: theme.textMuted, fontSize: ui.font(12), fontWeight: '700' },

  filterPanel: { paddingHorizontal: ui.contentPadding, marginBottom: ui.spacing(8) },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: ui.radius(12), borderWidth: 1, borderColor: theme.border, paddingHorizontal: ui.spacing(10), minHeight: ui.controlHeight, gap: ui.spacing(8) },
  searchInput: { flex: 1, color: theme.textPrimary, fontSize: ui.font(13), paddingVertical: ui.spacing(8) },
  resetBtn: { paddingHorizontal: ui.spacing(8), paddingVertical: ui.spacing(4), borderRadius: ui.radius(8), backgroundColor: theme.bgElevated },
  resetBtnText: { color: theme.accent, fontWeight: '700', fontSize: ui.font(11) },

  chipRow: { paddingTop: ui.spacing(8), gap: ui.spacing(8) },
  chipRowCompact: { paddingTop: ui.spacing(6), gap: ui.spacing(8) },
  chip: { paddingHorizontal: ui.spacing(12), paddingVertical: ui.spacing(8), borderRadius: ui.radius(18), borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bgCard },
  chipSmall: { paddingHorizontal: ui.spacing(10), paddingVertical: ui.spacing(6), borderRadius: ui.radius(16), borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bgCard },
  chipActive: { borderColor: theme.accent, backgroundColor: theme.accent + '1F' },
  chipText: { color: theme.textMuted, fontSize: ui.font(12), fontWeight: '700' },
  chipTextSmall: { color: theme.textMuted, fontSize: ui.font(11), fontWeight: '700' },
  chipTextActive: { color: theme.accent },

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
