import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, SafeAreaView, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { TrendingUp, ShoppingBag, Package, DollarSign, Tag } from 'lucide-react-native';

export default function ReportsScreen() {
  const [stats, setStats] = useState({
    todaySales: 0, weekSales: 0, monthSales: 0,
    todayBills: 0, weekBills: 0, monthBills: 0,
    lowStockItems: 0, totalProducts: 0,
  });
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];

    const [todayRes, weekRes, monthRes] = await Promise.all([
      supabase.from('bills').select('grand_total').gte('created_at', today),
      supabase.from('bills').select('grand_total').gte('created_at', weekAgo),
      supabase.from('bills').select('grand_total').gte('created_at', monthAgo),
    ]);

    const sum = (arr: any[]) => arr.reduce((s, b) => s + (b.grand_total || 0), 0);

    const { count: lowStock } = await supabase.from('products').select('id', { count: 'exact', head: true }).lte('quantity', 10);
    const { count: totalProd } = await supabase.from('products').select('id', { count: 'exact', head: true });

    const { data: topItems } = await supabase.from('bill_items').select('product_name, quantity')
      .gte('created_at', monthAgo).order('quantity', { ascending: false }).limit(5);

    const [recentBills, recentVouchers] = await Promise.all([
      supabase.from('bills').select('id, invoice_number, grand_total, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('vouchers').select('id, voucher_number, voucher_type, total_amount, date').order('created_at', { ascending: false }).limit(5),
    ]);

    setStats({
      todaySales: sum(todayRes.data || []), weekSales: sum(weekRes.data || []), monthSales: sum(monthRes.data || []),
      todayBills: (todayRes.data || []).length, weekBills: (weekRes.data || []).length, monthBills: (monthRes.data || []).length,
      lowStockItems: lowStock || 0, totalProducts: totalProd || 0,
    });
    setTopProducts(topItems || []);
    setDayBook([...(recentBills.data || []).map(b => ({ ...b, type: 'Sale' })), ...(recentVouchers.data || []).map(v => ({ ...v, type: v.voucher_type }))]);
  };

  const [dayBook, setDayBook] = useState<any[]>([]);

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, []);

  const StatCard = ({ label, value, sub, icon, color }: any) => (
    <View style={[s.card, { borderTopWidth: 2, borderTopColor: color }]}>
      <View style={s.cardTop}>{icon}<Text style={s.cardLabel}>{label}</Text></View>
      <Text style={[s.cardValue, { color }]}>{value}</Text>
      {sub && <Text style={s.cardSub}>{sub}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}>
        <View style={s.header}><Text style={s.title}>Reports & Overview</Text></View>
        
        <Text style={s.section}>Sales Summary</Text>
        <View style={s.grid}>
          <StatCard label="Today" value={`৳${stats.todaySales.toLocaleString()}`} sub={`${stats.todayBills} bills`} icon={<TrendingUp color="#10b981" size={16} />} color="#10b981" />
          <StatCard label="This Week" value={`৳${stats.weekSales.toLocaleString()}`} sub={`${stats.weekBills} bills`} icon={<TrendingUp color="#3b82f6" size={16} />} color="#3b82f6" />
          <StatCard label="This Month" value={`৳${stats.monthSales.toLocaleString()}`} sub={`${stats.monthBills} bills`} icon={<TrendingUp color="#8b5cf6" size={16} />} color="#8b5cf6" />
        </View>

        <Text style={s.section}>Inventory</Text>
        <View style={s.grid}>
          <StatCard label="Total Products" value={stats.totalProducts.toString()} icon={<Package color="#f59e0b" size={16} />} color="#f59e0b" />
          <StatCard label="Low Stock (≤10)" value={stats.lowStockItems.toString()} icon={<Package color="#ef4444" size={16} />} color="#ef4444" />
        </View>

        {topProducts.length > 0 && (
          <>
            <Text style={s.section}>Top Items (30 Days)</Text>
            <View style={s.listCard}>
              {topProducts.map((p, i) => (
                <View key={i} style={s.topRow}>
                  <Text style={s.topRank}>#{i + 1}</Text>
                  <Text style={s.topName}>{p.product_name}</Text>
                  <Text style={s.topQty}>{p.quantity} sold</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={s.section}>Day Book (Recent Activities)</Text>
        <View style={s.listCard}>
          {dayBook.sort((a,b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime()).slice(0, 8).map((item, i) => (
            <View key={i} style={s.topRow}>
              <View style={[s.typeIcon, { backgroundColor: item.type === 'Sale' ? '#10b98122' : '#8b5cf622' }]}>
                {item.type === 'Sale' ? <DollarSign size={14} color="#10b981" /> : <Tag size={14} color="#8b5cf6" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.topName}>{item.invoice_number || item.voucher_number}</Text>
                <Text style={s.cardSub}>{item.type} · {new Date(item.created_at || item.date).toLocaleDateString()}</Text>
              </View>
              <Text style={[s.topQty, { color: '#fff' }]}>৳{(item.grand_total || item.total_amount || 0).toLocaleString()}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { padding: 16, paddingTop: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  section: { color: '#9ca3af', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: 16, marginBottom: 10, marginTop: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10 },
  card: { flex: 1, minWidth: '45%', backgroundColor: '#111', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#222' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardLabel: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  cardValue: { fontSize: 20, fontWeight: '800' },
  cardSub: { color: '#6b7280', fontSize: 11, marginTop: 4 },
  listCard: { marginHorizontal: 16, backgroundColor: '#111', borderRadius: 14, borderWidth: 1, borderColor: '#222', overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  topRank: { color: '#6b7280', fontSize: 13, width: 28 },
  topName: { color: '#fff', fontWeight: '600', flex: 1 },
  topQty: { color: '#10b981', fontWeight: '700', fontSize: 13 },
  typeIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
});
