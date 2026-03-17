import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { Receipt, FileText, ChevronRight, Calendar } from 'lucide-react-native';

export default function VoucherListScreen({ navigation }: any) {
  const { theme } = useTheme();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchVouchers = async () => {
    const { data } = await supabase
      .from('vouchers')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    setVouchers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchVouchers(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchVouchers(); setRefreshing(false); }, []);

  const s = makeStyles(theme);

  if (loading) return <View style={s.center}><ActivityIndicator color={theme.accent} /></View>;

  return (
    <View style={s.root}>
      <FlatList
        data={vouchers}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={s.empty}>No vouchers found.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={s.card}
            onPress={() => {}} // Could add detail view later
          >
            <View style={[s.iconBox, { backgroundColor: item.voucher_type === 'Receipt' ? theme.successLight : item.voucher_type === 'Payment' ? theme.dangerLight : theme.purpleLight }]}>
              <Receipt size={20} color={item.voucher_type === 'Receipt' ? theme.success : item.voucher_type === 'Payment' ? theme.danger : theme.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.row}>
                <Text style={s.vNum}>{item.voucher_number}</Text>
                <Text style={s.vType}>{item.voucher_type}</Text>
              </View>
              <View style={s.row}>
                <View style={s.dateBox}>
                  <Calendar size={12} color={theme.textMuted} />
                  <Text style={s.vDate}>{item.date}</Text>
                </View>
                <Text style={s.vAmount}>৳{item.total_amount?.toLocaleString()}</Text>
              </View>
              {item.narration && <Text style={s.vNarration} numberOfLines={1}>{item.narration}</Text>}
            </View>
            <ChevronRight size={18} color={theme.textMuted} />
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </View>
  );
}

const makeStyles = (t: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: t.border, gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  vNum: { color: t.textPrimary, fontSize: 13, fontWeight: '800' },
  vType: { color: t.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vDate: { color: t.textSecondary, fontSize: 12 },
  vAmount: { color: t.textPrimary, fontSize: 15, fontWeight: '800' },
  vNarration: { color: t.textMuted, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  empty: { color: t.textMuted, textAlign: 'center', marginTop: 40 },
});
