import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';
import { Search, Plus, FileText, ChevronRight, Filter } from 'lucide-react-native';

interface Quotation {
  id: number;
  quote_number: string;
  quote_date: string;
  company_name: string;
  grand_total: number;
  status: string;
}

export default function QuotationListScreen({ navigation }: any) {
  const { theme } = useTheme();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchQuotations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quotations')
      .select('id, quote_number, quote_date, company_name, grand_total, status')
      .order('created_at', { ascending: false });
    
    if (error) Alert.alert('Error', error.message);
    else setQuotations(data || []);
    setLoading(false);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchQuotations();
    });
    return unsubscribe;
  }, [navigation]);

  const filtered = quotations.filter(q => 
    q.quote_number.toLowerCase().includes(search.toLowerCase()) || 
    (q.company_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Accepted': return theme.success;
      case 'Rejected': return theme.danger;
      case 'Sent': return theme.accent;
      default: return theme.textSecondary;
    }
  };

  const s = makeStyles(theme);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={s.searchBar}>
          <Search color={theme.textMuted} size={18} />
          <TextInput
            style={s.searchInput}
            placeholder="Search quotes..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={s.filterBtn}>
          <Filter color={theme.textPrimary} size={18} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={s.card}
            onPress={() => Alert.alert('Info', 'View details coming soon')}
          >
            <View style={s.cardBody}>
              <View style={s.quoteHead}>
                <View style={s.iconBg}>
                  <FileText color={theme.accent} size={20} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.quoteNumber}>{item.quote_number}</Text>
                  <Text style={s.quoteDate}>{new Date(item.quote_date).toLocaleDateString()}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: getStatusColor(item.status) + '22' }]}>
                  <Text style={[s.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
                </View>
              </View>
              
              <View style={s.cardFooter}>
                <Text style={s.companyName}>{item.company_name || 'Individual Customer'}</Text>
                <Text style={s.totalAmount}>৳{item.grand_total.toLocaleString()}</Text>
              </View>
            </View>
            <ChevronRight color={theme.textMuted} size={18} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            {loading ? <ActivityIndicator color={theme.accent} /> : <Text style={{ color: theme.textMuted }}>No quotations found</Text>}
          </View>
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      />

      <TouchableOpacity 
        style={s.fab}
        onPress={() => navigation.navigate('QuotationCreate')}
      >
        <Plus color="#fff" size={24} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: theme.bgCard, borderBottomWidth: 1, borderBottomColor: theme.border },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, color: theme.textPrimary, paddingVertical: 10, marginLeft: 8, fontSize: 14 },
  filterBtn: { backgroundColor: theme.bgElevated, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: theme.border, justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  cardBody: { flex: 1 },
  quoteHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconBg: { width: 40, height: 40, borderRadius: 10, backgroundColor: theme.bgElevated, alignItems: 'center', justifyContent: 'center' },
  quoteNumber: { color: theme.textPrimary, fontSize: 15, fontWeight: '700' },
  quoteDate: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  companyName: { color: theme.textSecondary, fontSize: 13, fontWeight: '600', flex: 1 },
  totalAmount: { color: theme.textPrimary, fontSize: 16, fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: 40 },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
});
