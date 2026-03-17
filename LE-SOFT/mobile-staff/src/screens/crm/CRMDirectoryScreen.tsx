import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Linking, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';
import { Search, Phone, MessageSquare, User, ChevronRight } from 'lucide-react-native';

interface Customer {
  id: number;
  name: string;
  phone: string;
  created_at: string;
}

export default function CRMDirectoryScreen({ navigation }: any) {
  const { theme } = useTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('billing_customers')
      .select('*')
      .order('name');
    
    if (error) Alert.alert('Error', error.message);
    else setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.phone || '').includes(search)
  );

  const handleCall = (phone: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone: string) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const finalPhone = cleanPhone.startsWith('88') ? cleanPhone : `88${cleanPhone}`;
    Linking.openURL(`whatsapp://send?phone=${finalPhone}`);
  };

  const s = makeStyles(theme);

  return (
    <View style={s.root}>
      <View style={s.searchContainer}>
        <View style={s.searchBar}>
          <Search color={theme.textMuted} size={18} />
          <TextInput
            style={s.searchInput}
            placeholder="Search customers..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={s.card}
            onPress={() => navigation.navigate('CustomerLedger', { customerId: item.id, customerName: item.name })}
          >
            <View style={s.avatar}>
              <User color={theme.accent} size={22} />
            </View>
            <View style={s.info}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.phone}>{item.phone || 'No phone number'}</Text>
            </View>
            <View style={s.actions}>
              {item.phone && (
                <>
                  <TouchableOpacity onPress={() => handleCall(item.phone)} style={s.actionBtn}>
                    <Phone color={theme.success} size={18} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleWhatsApp(item.phone)} style={s.actionBtn}>
                    <MessageSquare color={theme.accent} size={18} />
                  </TouchableOpacity>
                </>
              )}
              <ChevronRight color={theme.textMuted} size={20} />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ color: theme.textMuted }}>{loading ? 'Loading...' : 'No customers found'}</Text>
          </View>
        }
        contentContainerStyle={{ padding: 16 }}
      />
    </View>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  searchContainer: { padding: 16, backgroundColor: theme.bgCard, borderBottomWidth: 1, borderBottomColor: theme.border },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, color: theme.textPrimary, paddingVertical: 12, marginLeft: 8, fontSize: 15 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  avatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.bgElevated, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginLeft: 14 },
  name: { color: theme.textPrimary, fontSize: 16, fontWeight: '700' },
  phone: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionBtn: { padding: 8, backgroundColor: theme.bgElevated, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
  empty: { alignItems: 'center', marginTop: 40 },
});
