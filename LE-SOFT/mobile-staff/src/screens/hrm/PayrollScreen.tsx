import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, SafeAreaView, RefreshControl, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { DollarSign } from 'lucide-react-native';

export default function PayrollScreen() {
  const [records, setRecords] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single();
    const { data: emp } = await supabase.from('hrm_employees').select('id, basic_salary').eq('user_id', profile?.id).maybeSingle();
    if (!emp) return;
    const { data } = await supabase.from('hrm_payroll').select('*').eq('employee_id', emp.id).order('month', { ascending: false });
    setRecords((data || []).map(r => ({ ...r, basic_salary: emp.basic_salary })));
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, []);

  const statusColor = (s: string) => ({ Paid: '#10b981', Pending: '#f59e0b', Held: '#ef4444' }[s] || '#6b7280');

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>My Payroll</Text>
      </View>
      <FlatList
        data={records}
        keyExtractor={i => i.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={s.empty}>No payroll records found.</Text>}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.iconBox}><DollarSign color="#10b981" size={22} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.month}>{item.month}</Text>
              <Text style={s.detail}>Basic: ৳{Number(item.basic_salary || 0).toLocaleString()}</Text>
              {item.bonus > 0 && <Text style={s.bonus}>+ Bonus ৳{Number(item.bonus).toLocaleString()}</Text>}
              {item.deductions > 0 && <Text style={s.deduct}>- Deductions ৳{Number(item.deductions).toLocaleString()}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.net}>৳{Number(item.net_salary || 0).toLocaleString()}</Text>
              <Text style={[s.status, { color: statusColor(item.payment_status) }]}>{item.payment_status}</Text>
            </View>
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
  iconBox: { width: 44, height: 44, backgroundColor: '#0f3229', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  month: { color: '#fff', fontWeight: '700', fontSize: 15 },
  detail: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  bonus: { color: '#10b981', fontSize: 12, marginTop: 2 },
  deduct: { color: '#ef4444', fontSize: 12, marginTop: 2 },
  net: { color: '#10b981', fontWeight: '800', fontSize: 18 },
  status: { fontWeight: '700', fontSize: 12, marginTop: 4 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40 },
});
