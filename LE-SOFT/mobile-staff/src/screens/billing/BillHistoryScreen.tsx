import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  StyleSheet,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import * as Print from 'expo-print';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useResponsive } from '../../lib/responsive';
import { decryptRows } from '../../lib/encryption';
import { CalendarDays, Printer, Receipt, Search, X } from 'lucide-react-native';

type AlteredFilter = 'All' | 'Altered' | 'Original';

interface BillRow {
  id: number;
  invoice_number?: string;
  grand_total?: number;
  subtotal?: number;
  discount_total?: number;
  created_at: string;
  updated_at?: string;
  billed_by?: string;
  payment_ref?: string;
  billing_customers?: {
    name?: string;
    phone?: string;
  };
}

interface BillItemRow {
  id: number;
  product_name?: string;
  sku?: string;
  quantity?: number;
  mrp?: number;
  discount_pct?: number;
  discount_amt?: number;
  price?: number;
}

const isAlteredBill = (bill: BillRow) => {
  if (!bill.updated_at || !bill.created_at) return false;
  return new Date(bill.updated_at).getTime() - new Date(bill.created_at).getTime() > 60 * 1000;
};

const toYmd = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function BillHistoryScreen() {
  const { theme } = useTheme();
  const ui = useResponsive();

  const [bills, setBills] = useState<BillRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [billedByFilter, setBilledByFilter] = useState<string>('All');
  const [alteredFilter, setAlteredFilter] = useState<AlteredFilter>('All');

  const [selectedBill, setSelectedBill] = useState<BillRow | null>(null);
  const [selectedItems, setSelectedItems] = useState<BillItemRow[]>([]);

  const fetchBills = useCallback(async () => {
    const { data, error } = await supabase
      .from('bills')
      .select('id, invoice_number, subtotal, discount_total, grand_total, created_at, updated_at, billed_by, payment_ref, billing_customers(name, phone)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      Alert.alert('Error', error.message || 'Failed to load bill history');
      return;
    }

    setBills(decryptRows((data || []) as any));
  }, []);

  useEffect(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    setFromDate(toYmd(weekAgo));
    setToDate(toYmd(now));
  }, []);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBills();
    setRefreshing(false);
  }, [fetchBills]);

  const billedByOptions = useMemo(() => {
    const values = new Set<string>();
    bills.forEach((b) => {
      if (b.billed_by) values.add(String(b.billed_by));
    });
    return ['All', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [bills]);

  const filteredBills = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const toTs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;

    return bills.filter((bill) => {
      const createdTs = bill.created_at ? new Date(bill.created_at).getTime() : 0;
      const dateOk = createdTs >= fromTs && createdTs <= toTs;

      const staffOk = billedByFilter === 'All' || String(bill.billed_by || '') === billedByFilter;

      const altered = isAlteredBill(bill);
      const alteredOk = alteredFilter === 'All' || (alteredFilter === 'Altered' ? altered : !altered);

      const hay = `${bill.invoice_number || ''} ${bill.billing_customers?.name || ''} ${bill.billing_customers?.phone || ''}`.toLowerCase();
      const searchOk = !q || hay.includes(q);

      return dateOk && staffOk && alteredOk && searchOk;
    });
  }, [bills, query, fromDate, toDate, billedByFilter, alteredFilter]);

  const formatDate = (iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    );
  };

  const openPreview = async (bill: BillRow) => {
    setSelectedBill(bill);
    setLoadingItems(true);
    const { data, error } = await supabase
      .from('bill_items')
      .select('id, product_name, sku, quantity, mrp, discount_pct, discount_amt, price')
      .eq('bill_id', bill.id)
      .order('id', { ascending: true });

    setLoadingItems(false);

    if (error) {
      Alert.alert('Error', error.message || 'Failed to load bill items');
      setSelectedItems([]);
      return;
    }

    setSelectedItems(decryptRows((data || []) as any));
  };

  const printBill = async () => {
    if (!selectedBill) return;

    try {
      const itemsHtml = selectedItems
        .map(
          (it) => `
            <tr>
              <td>${it.product_name || '-'}</td>
              <td>${it.sku || '-'}</td>
              <td style="text-align:right;">${Number(it.quantity || 0)}</td>
              <td style="text-align:right;">${Number(it.price || 0).toFixed(2)}</td>
            </tr>`
        )
        .join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; padding: 18px; color: #111; }
              .title { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
              .meta { font-size: 12px; color: #444; margin-bottom: 2px; }
              table { width: 100%; border-collapse: collapse; margin-top: 14px; }
              th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
              th { background: #f5f5f5; text-align: left; }
              .total { margin-top: 14px; font-size: 15px; font-weight: 700; text-align: right; }
            </style>
          </head>
          <body>
            <div class="title">Invoice ${selectedBill.invoice_number || `#${selectedBill.id}`}</div>
            <div class="meta">Date: ${formatDate(selectedBill.created_at)}</div>
            <div class="meta">Customer: ${selectedBill.billing_customers?.name || 'Walk-in Customer'}</div>
            <div class="meta">Billed By: ${selectedBill.billed_by || '-'}</div>
            <table>
              <thead>
                <tr><th>Product</th><th>SKU</th><th>Qty</th><th>Line Total</th></tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <div class="total">Grand Total: ৳${Number(selectedBill.grand_total || 0).toFixed(2)}</div>
          </body>
        </html>`;

      await Print.printAsync({ html });
    } catch (err: any) {
      Alert.alert('Print Failed', err?.message || 'Unable to print this invoice');
    }
  };

  const s = makeStyles(theme, ui);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Bill History</Text>
        <Text style={s.count}>{filteredBills.length} records</Text>
      </View>

      <View style={s.filterCard}>
        <View style={s.searchRow}>
          <Search color={theme.textMuted} size={ui.icon(16)} />
          <TextInput
            style={s.searchInput}
            placeholder="Search invoice, customer, phone"
            placeholderTextColor={theme.textMuted}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <X color={theme.textMuted} size={ui.icon(16)} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={s.dateRow}>
          <View style={s.dateInputWrap}>
            <CalendarDays color={theme.textMuted} size={ui.icon(14)} />
            <TextInput
              style={s.dateInput}
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="From YYYY-MM-DD"
              placeholderTextColor={theme.textMuted}
            />
          </View>
          <View style={s.dateInputWrap}>
            <CalendarDays color={theme.textMuted} size={ui.icon(14)} />
            <TextInput
              style={s.dateInput}
              value={toDate}
              onChangeText={setToDate}
              placeholder="To YYYY-MM-DD"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {billedByOptions.map((staff) => (
            <TouchableOpacity
              key={staff}
              onPress={() => setBilledByFilter(staff)}
              style={[s.chip, billedByFilter === staff && s.chipActive]}
            >
              <Text style={[s.chipText, billedByFilter === staff && s.chipTextActive]}>{staff === 'All' ? 'All Staff' : staff}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.chipRowStatic}>
          {(['All', 'Altered', 'Original'] as AlteredFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setAlteredFilter(f)}
              style={[s.chip, alteredFilter === f && s.chipActive]}
            >
              <Text style={[s.chipText, alteredFilter === f && s.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredBills}
        keyExtractor={(i) => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={s.listContent}
        ItemSeparatorComponent={() => <View style={{ height: ui.spacing(10) }} />}
        ListEmptyComponent={<Text style={s.empty}>No bills match your filters.</Text>}
        renderItem={({ item }) => {
          const altered = isAlteredBill(item);
          return (
            <TouchableOpacity style={s.card} onPress={() => openPreview(item)}>
              <View style={s.iconBox}>
                <Receipt color={theme.accent} size={ui.icon(20)} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.rowBetween}>
                  <Text style={s.invoice}>{item.invoice_number || `#${item.id}`}</Text>
                  {altered ? (
                    <View style={s.alteredBadge}><Text style={s.alteredText}>Altered</Text></View>
                  ) : null}
                </View>
                <Text style={s.meta}>{item.billing_customers?.name || 'Walk-in Customer'}</Text>
                <Text style={s.metaSm}>{formatDate(item.created_at)} · {item.billed_by || '-'}</Text>
              </View>
              <Text style={s.total}>৳{Math.round(Number(item.grand_total || 0)).toLocaleString()}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={!!selectedBill} transparent animationType="slide" onRequestClose={() => setSelectedBill(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <View>
                <Text style={s.modalTitle}>{selectedBill?.invoice_number || '-'}</Text>
                <Text style={s.metaSm}>{selectedBill ? formatDate(selectedBill.created_at) : '-'}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedBill(null)}>
                <X color={theme.textMuted} size={ui.icon(20)} />
              </TouchableOpacity>
            </View>

            <View style={s.summaryWrap}>
              <Text style={s.summaryLine}>Customer: {selectedBill?.billing_customers?.name || 'Walk-in Customer'}</Text>
              <Text style={s.summaryLine}>Phone: {selectedBill?.billing_customers?.phone || '-'}</Text>
              <Text style={s.summaryLine}>Billed By: {selectedBill?.billed_by || '-'}</Text>
              <Text style={s.summaryLine}>Payment Ref: {selectedBill?.payment_ref || '-'}</Text>
            </View>

            <Text style={s.sectionTitle}>Items</Text>
            <ScrollView style={{ maxHeight: ui.scale(260) }}>
              {loadingItems ? <Text style={s.metaSm}>Loading items...</Text> : null}
              {!loadingItems && selectedItems.length === 0 ? <Text style={s.metaSm}>No line items found.</Text> : null}
              {!loadingItems && selectedItems.map((it) => (
                <View key={it.id} style={s.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>{it.product_name || '-'}</Text>
                    <Text style={s.metaSm}>{it.sku || '-'} · Qty {Number(it.quantity || 0)}</Text>
                  </View>
                  <Text style={s.itemPrice}>৳{Number(it.price || 0).toFixed(2)}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={s.totalWrap}>
              <Text style={s.modalTotal}>Grand Total: ৳{Number(selectedBill?.grand_total || 0).toFixed(2)}</Text>
            </View>

            <TouchableOpacity style={s.printBtn} onPress={printBill}>
              <Printer color={theme.bg} size={ui.icon(16)} />
              <Text style={s.printText}>Reprint Invoice</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (theme: any, ui: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: {
    paddingHorizontal: ui.contentPadding,
    paddingTop: ui.spacing(8),
    paddingBottom: ui.spacing(8),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: theme.textPrimary, fontSize: ui.font(22, 18, 26), fontWeight: '800' },
  count: { color: theme.textMuted, fontSize: ui.font(12), fontWeight: '600' },

  filterCard: {
    marginHorizontal: ui.contentPadding,
    marginBottom: ui.spacing(10),
    padding: ui.cardPadding,
    borderRadius: ui.radius(14),
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgCard,
    gap: ui.spacing(8),
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spacing(8),
    minHeight: ui.controlHeight,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: ui.radius(10),
    paddingHorizontal: ui.spacing(10),
    backgroundColor: theme.bgInput,
  },
  searchInput: { flex: 1, color: theme.textPrimary, fontSize: ui.font(13), paddingVertical: ui.spacing(8) },

  dateRow: { flexDirection: ui.isCompact ? 'column' : 'row', gap: ui.spacing(8) },
  dateInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spacing(6),
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: ui.radius(10),
    paddingHorizontal: ui.spacing(10),
    minHeight: ui.controlHeight,
    backgroundColor: theme.bgInput,
  },
  dateInput: { flex: 1, color: theme.textPrimary, fontSize: ui.font(12), paddingVertical: ui.spacing(8) },

  chipRow: { gap: ui.spacing(8), paddingTop: ui.spacing(2) },
  chipRowStatic: { flexDirection: 'row', gap: ui.spacing(8), flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: ui.spacing(10),
    paddingVertical: ui.spacing(6),
    borderRadius: ui.radius(14),
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bg,
  },
  chipActive: { borderColor: theme.accent, backgroundColor: theme.accent + '1F' },
  chipText: { color: theme.textMuted, fontSize: ui.font(11), fontWeight: '700' },
  chipTextActive: { color: theme.accent },

  listContent: { paddingHorizontal: ui.contentPadding, paddingBottom: ui.spacing(26) },
  card: {
    backgroundColor: theme.bgCard,
    borderRadius: ui.radius(14),
    borderWidth: 1,
    borderColor: theme.border,
    padding: ui.cardPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spacing(10),
  },
  iconBox: {
    width: ui.scale(40),
    height: ui.scale(40),
    borderRadius: ui.radius(10),
    backgroundColor: theme.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.spacing(8) },
  invoice: { color: theme.textPrimary, fontWeight: '800', fontSize: ui.font(14) },
  meta: { color: theme.textSecondary, fontSize: ui.font(12), marginTop: ui.spacing(2) },
  metaSm: { color: theme.textMuted, fontSize: ui.font(11), marginTop: ui.spacing(2) },
  total: { color: theme.success, fontWeight: '800', fontSize: ui.font(14), marginLeft: ui.spacing(6) },
  alteredBadge: {
    borderWidth: 1,
    borderColor: theme.warning,
    backgroundColor: theme.warning + '18',
    borderRadius: ui.radius(10),
    paddingHorizontal: ui.spacing(7),
    paddingVertical: ui.spacing(3),
  },
  alteredText: { color: theme.warning, fontSize: ui.font(10), fontWeight: '800' },
  empty: { textAlign: 'center', color: theme.textMuted, marginTop: ui.spacing(40), fontSize: ui.font(14) },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: theme.bgCard,
    borderTopLeftRadius: ui.radius(22),
    borderTopRightRadius: ui.radius(22),
    padding: ui.contentPadding,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: theme.textPrimary, fontWeight: '800', fontSize: ui.font(18) },

  summaryWrap: {
    marginTop: ui.spacing(10),
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: ui.radius(10),
    backgroundColor: theme.bg,
    padding: ui.spacing(10),
  },
  summaryLine: { color: theme.textSecondary, fontSize: ui.font(12), marginBottom: ui.spacing(3) },

  sectionTitle: { color: theme.textPrimary, fontWeight: '700', fontSize: ui.font(13), marginTop: ui.spacing(12), marginBottom: ui.spacing(6) },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: ui.spacing(8),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    gap: ui.spacing(10),
  },
  itemName: { color: theme.textPrimary, fontSize: ui.font(12), fontWeight: '600' },
  itemPrice: { color: theme.textPrimary, fontSize: ui.font(12), fontWeight: '700' },

  totalWrap: { marginTop: ui.spacing(10), alignItems: 'flex-end' },
  modalTotal: { color: theme.success, fontWeight: '800', fontSize: ui.font(15) },

  printBtn: {
    marginTop: ui.spacing(12),
    minHeight: ui.controlHeight,
    borderRadius: ui.radius(10),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent,
    flexDirection: 'row',
    gap: ui.spacing(8),
  },
  printText: { color: theme.bg, fontWeight: '800', fontSize: ui.font(13) },
});
