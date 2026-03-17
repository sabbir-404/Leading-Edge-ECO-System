import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { TrendingUp, TrendingDown, Receipt, Wallet } from 'lucide-react-native';

export default function CustomerLedgerScreen({ route }: any) {
  const { theme } = useTheme();
  const { customerId, customerName } = route.params;
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalBilled: 0, totalPaid: 0, balance: 0 });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Bills
        const { data: bills } = await supabase
          .from('bills')
          .select('id, invoice_number, grand_total, created_at')
          .eq('customer_id', customerId);
        
        // Fetch Payments (if table exists, otherwise assume from bills for now)
        // For now, let's treat bills as the primary ledger entries
        const entries = (bills || []).map(b => ({
          id: `bill-${b.id}`,
          type: 'Bill',
          description: `Invoice #${b.invoice_number}`,
          amount: b.grand_total,
          date: b.created_at,
          debit: b.grand_total,
          credit: 0
        }));

        setLedger(entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        
        const billed = entries.reduce((s, e) => s + e.debit, 0);
        const paid = entries.reduce((s, e) => s + e.credit, 0);
        setStats({ totalBilled: billed, totalPaid: paid, balance: billed - paid });
      } catch (e: any) {
        Alert.alert('Error', e.message);
      }
      setLoading(false);
    };

    fetchData();
  }, [customerId]);

  const s = makeStyles(theme);

  return (
    <View style={s.root}>
      {/* Stats Header */}
      <View style={s.statsContainer}>
        <View style={s.statBox}>
          <Text style={s.statLabel}>Billed</Text>
          <Text style={[s.statValue, { color: theme.danger }]}>৳{stats.totalBilled.toLocaleString()}</Text>
        </View>
        <View style={[s.statBox, s.statCenter]}>
          <Text style={s.statLabel}>Balance</Text>
          <Text style={[s.statValue, { color: theme.accent }]}>৳{stats.balance.toLocaleString()}</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statLabel}>Paid</Text>
          <Text style={[s.statValue, { color: theme.success }]}>৳{stats.totalPaid.toLocaleString()}</Text>
        </View>
      </View>

      <Text style={s.listTitle}>Transaction History</Text>
      
      {loading ? (
        <View style={s.loading}><ActivityIndicator color={theme.accent} /></View>
      ) : (
        <FlatList
          data={ledger}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={s.item}>
              <View style={[s.icon, { backgroundColor: item.debit > 0 ? theme.dangerLight : theme.successLight }]}>
                {item.debit > 0 ? <TrendingUp color={theme.danger} size={18} /> : <TrendingDown color={theme.success} size={18} />}
              </View>
              <View style={s.itemMain}>
                <Text style={s.itemDesc}>{item.description}</Text>
                <Text style={s.itemDate}>{new Date(item.date).toLocaleDateString()}</Text>
              </View>
              <View style={s.itemAmount}>
                <Text style={[s.amountText, { color: item.debit > 0 ? theme.danger : theme.success }]}>
                  {item.debit > 0 ? '-' : '+'} ৳{item.amount.toLocaleString()}
                </Text>
                <Text style={s.itemType}>{item.type}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={s.empty}>No transactions recorded</Text>}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </View>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  statsContainer: { flexDirection: 'row', backgroundColor: theme.bgCard, padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border },
  statBox: { flex: 1, alignItems: 'center' },
  statCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.border },
  statLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '800' },
  listTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: '800', paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemMain: { flex: 1, marginLeft: 14 },
  itemDesc: { color: theme.textPrimary, fontWeight: '600', fontSize: 14 },
  itemDate: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  itemAmount: { alignItems: 'flex-end' },
  amountText: { fontSize: 15, fontWeight: '700' },
  itemType: { color: theme.textSecondary, fontSize: 11, fontWeight: '600', marginTop: 2 },
  empty: { textAlign: 'center', color: theme.textMuted, marginTop: 40 },
});
