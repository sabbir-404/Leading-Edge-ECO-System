import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, RefreshControl, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Receipt, ChevronRight } from 'lucide-react-native';

import { decryptField } from '../../lib/encryption';

export default function BillHistoryScreen({ navigation }: any) {
  const [bills, setBills] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBills = async () => {
    const { data } = await supabase
      .from('bills')
      .select('id, invoice_number, grand_total, created_at, billing_customers(name, phone)')
      .order('created_at', { ascending: false })
      .limit(100);
      
    const decryptedData = (data || []).map(item => {
      if (item.billing_customers) {
        return {
          ...item,
          billing_customers: {
            ...(item.billing_customers as any),
            name: decryptField((item.billing_customers as any).name),
            phone: decryptField((item.billing_customers as any).phone)
          }
        };
      }
      return item;
    });

    setBills(decryptedData);
  };

  useEffect(() => { fetchBills(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await fetchBills(); setRefreshing(false);
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Bill History</Text>
      </View>
      <FlatList
        data={bills}
        keyExtractor={i => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={s.empty}>No bills found.</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.iconBox}>
              <Receipt color="#3b82f6" size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.invoice}>{item.invoice_number || `#${item.id}`}</Text>
              <Text style={s.customer}>{item.billing_customers?.name || 'Walk-in Customer'}</Text>
              <Text style={s.date}>{formatDate(item.created_at)}</Text>
            </View>
            <Text style={s.total}>৳{Number(item.grand_total || 0).toLocaleString()}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { padding: 16, paddingTop: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#222', gap: 12 },
  iconBox: { width: 44, height: 44, backgroundColor: '#1e3a5f', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  invoice: { color: '#fff', fontWeight: '700', fontSize: 15 },
  customer: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  date: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  total: { color: '#10b981', fontWeight: '800', fontSize: 16 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40, fontSize: 15 },
});
