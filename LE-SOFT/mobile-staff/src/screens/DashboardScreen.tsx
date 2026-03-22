import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, TextInput, Keyboard } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';
import { decryptObject } from '../lib/encryption';
import { useResponsive } from '../lib/responsive';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Search, Package, X, LogOut, Activity, ShoppingBag, Menu, AlertTriangle, Users } from 'lucide-react-native';
import { useDebounce } from 'use-debounce';

interface Stats {
  todaySales: number; totalBills: number;
}

export default function DashboardScreen({ navigation }: any) {
  const { theme } = useTheme();
  const ui = useResponsive();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<Stats>({ todaySales: 0, totalBills: 0 });
  const [refreshing, setRefreshing] = useState(false);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingDB, setSearchingDB] = useState(false);
  
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  const fetchData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data: profile } = await supabase.from('users').select('*').eq('auth_id', authUser.id).single();
    const parsedProfile = decryptObject(profile || {});
    setUser(parsedProfile);
    const role = String(parsedProfile?.role || '').toLowerCase();
    
    // Only load global sales if Admin or Owner (to protect sensitive financial data)
    if (role === 'admin' || role === 'owner') {
      const today = new Date().toISOString().split('T')[0];
      const { data: bills } = await supabase.from('bills').select('grand_total').gte('created_at', today);
      const todaySales = (bills || []).reduce((s: number, b: any) => s + (b.grand_total || 0), 0);
      setStats({ todaySales, totalBills: (bills || []).length });
    }

    // Load general summary tiles
    const { count: cCount } = await supabase.from('billing_customers').select('*', { count: 'exact', head: true });
    if (cCount) setTotalCustomers(cCount);

    const { count: sCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).lt('quantity', 5);
    if (sCount) setLowStockCount(sCount);
  };

  useEffect(() => { fetchData(); }, []);
  
  useEffect(() => {
    const searchDB = async () => {
      if (!debouncedQuery) {
        setSearchResults([]);
        return;
      }
      setSearchingDB(true);
      const { data } = await supabase
        .from('products')
        .select('*')
        .or(`name.ilike.%${debouncedQuery}%,sku.ilike.%${debouncedQuery}%`)
        .limit(20);
      setSearchResults(data || []);
      setSearchingDB(false);
    };
    searchDB();
  }, [debouncedQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await fetchData(); setRefreshing(false);
  }, []);

  const handleSearchFocus = () => {
    setIsSearching(true);
  };

  const handleSearchBlur = () => {
    if (searchQuery.length === 0) {
      Keyboard.dismiss();
      setIsSearching(false);
    }
  };
  
  const closeSearch = () => {
    setSearchQuery('');
    Keyboard.dismiss();
    setIsSearching(false);
  };

  const s = makeStyles(theme, ui);

  const isAdmin = ['admin', 'owner'].includes(String(user?.role || '').toLowerCase());

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={s.topProfileArea}>
        <TouchableOpacity onPress={() => navigation.openDrawer()} style={s.menuBtn}>
          <Menu color={theme.textPrimary} size={ui.icon(26)} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('SettingsTab')} style={s.profileBtn}>
          <View style={[s.avatar, { backgroundColor: theme.accent + '22' }]}>
            <User color={theme.accent} size={ui.icon(20)} />
          </View>
          <View>
            <Text style={s.greeting}>Good day,</Text>
            <Text style={s.name}>{user?.full_name || 'Loading...'}</Text>
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => supabase.auth.signOut()} style={s.logoutBtn}>
          <LogOut color={theme.danger} size={ui.icon(18)} />
        </TouchableOpacity>
      </View>

      {/* Admin Summary */}
      {isAdmin && !isSearching && (
        <View style={s.heroBox}>
          <Text style={s.heroLabel}>Today's Total Bills</Text>
          <Text style={s.heroAmount}>৳{stats.todaySales.toLocaleString()}</Text>
          <View style={s.heroSub}>
            <ShoppingBag color={theme.accent} size={ui.icon(14)} />
            <Text style={s.heroSubText}>{stats.totalBills} Bills generated today</Text>
          </View>
        </View>
      )}

      <View style={s.searchContainerWrapper}>
        <View style={s.searchBar}>
          <Search color={isSearching ? theme.accent : theme.textMuted} size={ui.icon(19)} />
          <TextInput
            style={s.searchInput}
            placeholder="Search stock, names, SKUs..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
          />
          {isSearching && (
            <TouchableOpacity onPress={closeSearch} style={s.clearBtn}>
              <X color={theme.textMuted} size={ui.icon(17)} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content Below Search */}
      <View style={{ flex: 1, marginTop: 10 }}>
        {isSearching ? (
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={searchResults}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={s.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.resultCard} onPress={() => { closeSearch(); }}>
                <View style={[s.iconBox, { backgroundColor: theme.bgElevated }]}>
                  <Package color={theme.accent} size={ui.icon(19)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rName}>{item.name}</Text>
                  <Text style={s.rMeta}>{item.sku || 'N/A'}</Text>
                </View>
                <Text style={[s.rVal, { color: theme.success }]}>৳{item.selling_price}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              searchingDB ? (
                <View style={s.empty}><Text style={{ color: theme.textMuted }}>Querying Database...</Text></View>
              ) : searchQuery.length > 0 ? (
                <View style={s.empty}><Text style={{ color: theme.textMuted }}>No stock found.</Text></View>
              ) : (
                <View style={s.empty}><Text style={{ color: theme.textMuted }}>Type above to search inventory.</Text></View>
              )
            }
          />
        ) : (
          <FlatList
            data={[{ id: 'dash' }]}
            keyExtractor={i => i.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.dashScroll}
            renderItem={() => (
              <View>
                <Text style={s.sectionTitle}>Overview & Metrics</Text>
                <View style={s.gridRow}>
                   <View style={s.gridTile}>
                     <View style={[s.tileIcon, { backgroundColor: theme.accent + '22' }]}><Users color={theme.accent} size={24} /></View>
                     <Text style={s.tileTitle}>Customers</Text>
                     <Text style={s.tileValue}>{totalCustomers}</Text>
                   </View>
                   <View style={s.gridTile}>
                     <View style={[s.tileIcon, { backgroundColor: theme.danger + '22' }]}><AlertTriangle color={theme.danger} size={24} /></View>
                     <Text style={s.tileTitle}>Low Stock</Text>
                     <Text style={s.tileValue}>{lowStockCount}</Text>
                   </View>
                </View>

                {isAdmin && (
                  <View style={[s.placeholderCard, { marginTop: 16 }]}>
                    <Activity color={theme.textMuted} size={ui.icon(30)} />
                    <Text style={s.placeText}>More advanced admin charts can go here later.</Text>
                  </View>
                )}
              </View>
            )}
          />
        )}
      </View>
      
    </SafeAreaView>
  );
}

const makeStyles = (theme: any, ui: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  topProfileArea: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: ui.spacing(20), paddingTop: ui.spacing(10), paddingBottom: ui.spacing(12) },
  menuBtn: { marginRight: ui.spacing(16), padding: ui.spacing(4) },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(12), flexShrink: 1 },
  avatar: { width: ui.scale(44), height: ui.scale(44), borderRadius: ui.radius(22), alignItems: 'center', justifyContent: 'center' },
  greeting: { color: theme.textMuted, fontSize: ui.font(13) },
  name: { color: theme.textPrimary, fontSize: ui.font(22, 16, 24), fontWeight: '800' },
  logoutBtn: { padding: ui.spacing(8), backgroundColor: theme.bgCard, borderRadius: ui.radius(12), borderWidth: 1, borderColor: theme.border },
  
  heroBox: { backgroundColor: theme.bgCard, marginHorizontal: ui.spacing(20), borderRadius: ui.radius(24), padding: ui.spacing(22), borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  heroLabel: { color: theme.textMuted, fontSize: ui.font(13), fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: ui.spacing(8) },
  heroAmount: { color: theme.textPrimary, fontSize: ui.font(36, 28, 44), fontWeight: '900', letterSpacing: -1 },
  heroSub: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(6), marginTop: ui.spacing(12), backgroundColor: theme.bg, paddingHorizontal: ui.spacing(10), paddingVertical: ui.spacing(6), alignSelf: 'flex-start', borderRadius: ui.radius(8) },
  heroSubText: { color: theme.textSecondary, fontSize: ui.font(12), fontWeight: '500' },
  
  searchContainerWrapper: { paddingHorizontal: ui.spacing(20), zIndex: 5, marginTop: ui.spacing(12) },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: ui.radius(16), paddingHorizontal: ui.spacing(16), height: ui.scale(56), borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  searchInput: { flex: 1, color: theme.textPrimary, fontSize: ui.font(16), marginLeft: ui.spacing(12), height: '100%' },
  clearBtn: { padding: ui.spacing(6) },
  
  listContent: { paddingHorizontal: ui.spacing(20), paddingTop: ui.spacing(18), paddingBottom: ui.spacing(110) },
  resultCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgCard, borderRadius: ui.radius(16), padding: ui.spacing(14), marginBottom: ui.spacing(10), borderWidth: 1, borderColor: theme.border },
  iconBox: { width: ui.scale(44), height: ui.scale(44), borderRadius: ui.radius(12), alignItems: 'center', justifyContent: 'center', marginRight: ui.spacing(14) },
  rName: { color: theme.textPrimary, fontSize: ui.font(16), fontWeight: '700' },
  rMeta: { color: theme.textMuted, fontSize: ui.font(12), marginTop: ui.spacing(2) },
  rVal: { fontSize: ui.font(15), fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: ui.spacing(40) },

  dashScroll: { paddingHorizontal: ui.spacing(20), paddingBottom: ui.spacing(110) },
  sectionTitle: { color: theme.textPrimary, fontSize: ui.font(18), fontWeight: '800', marginTop: ui.spacing(10), marginBottom: ui.spacing(16) },
  placeholderCard: { backgroundColor: theme.bgCard, borderRadius: ui.radius(20), padding: ui.spacing(30), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed' },
  placeText: { color: theme.textMuted, fontSize: ui.font(14), fontWeight: '500', marginTop: ui.spacing(10), textAlign: 'center' },

  gridRow: { flexDirection: ui.isCompact ? 'column' : 'row', gap: ui.spacing(12) },
  gridTile: { flex: 1, backgroundColor: theme.bgCard, borderRadius: ui.radius(20), padding: ui.spacing(20), borderWidth: 1, borderColor: theme.border },
  tileIcon: { width: ui.scale(44), height: ui.scale(44), borderRadius: ui.radius(12), alignItems: 'center', justifyContent: 'center', marginBottom: ui.spacing(16) },
  tileTitle: { color: theme.textMuted, fontSize: ui.font(14), fontWeight: '600', marginBottom: ui.spacing(6) },
  tileValue: { color: theme.textPrimary, fontSize: ui.font(30, 24, 34), fontWeight: '800' },
});
