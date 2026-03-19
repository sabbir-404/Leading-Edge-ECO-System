import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Image, TextInput, Animated, Keyboard, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, Search, Package, X, LogOut, ArrowRight, Activity, ShoppingBag, Menu } from 'lucide-react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Stats {
  todaySales: number; totalBills: number;
}

export default function DashboardScreen({ navigation }: any) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<Stats>({ todaySales: 0, totalBills: 0 });
  const [refreshing, setRefreshing] = useState(false);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  
  // Animation
  const searchAnim = useRef(new Animated.Value(0)).current;

  const fetchData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data: profile } = await supabase.from('users').select('*').eq('auth_id', authUser.id).single();
    setUser(profile);
    
    const today = new Date().toISOString().split('T')[0];
    const { data: bills } = await supabase.from('bills').select('grand_total').gte('created_at', today);
    const todaySales = (bills || []).reduce((s: number, b: any) => s + (b.grand_total || 0), 0);
    
    setStats({ todaySales, totalBills: (bills || []).length });
    
    const { data: products } = await supabase.from('products').select('*');
    if (products) setAllProducts(products);
  };

  useEffect(() => { fetchData(); }, []);
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true); await fetchData(); setRefreshing(false);
  }, []);

  const handleSearchFocus = () => {
    setIsSearching(true);
    Animated.timing(searchAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleSearchBlur = () => {
    if (searchQuery.length === 0) {
      Keyboard.dismiss();
      setIsSearching(false);
      Animated.timing(searchAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };
  
  const closeSearch = () => {
    setSearchQuery('');
    Keyboard.dismiss();
    setIsSearching(false);
    Animated.timing(searchAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (searchQuery.length > 0) {
      const q = searchQuery.toLowerCase();
      setSearchResults(allProducts.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) || 
        (p.sku && p.sku.toLowerCase().includes(q))
      ).slice(0, 20));
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, allProducts]);

  const s = makeStyles(theme);

  const headerTranslateY = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -200], // Push header up out of view
  });

  const searchTranslateY = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -165], // Hover to top
  });

  const searchWidth = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'], // Minor width expansion if needed, though padding is better
  });
  
  const backdropOpacity = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      
      {/* Background Overlay for search mode */}
      <Animated.View style={[s.searchBackdrop, { opacity: backdropOpacity }]} pointerEvents={isSearching ? 'auto' : 'none'} />

      <Animated.View style={{ flex: 1, transform: [{ translateY: headerTranslateY }] }}>
        
        {/* Top Header Profile Area */}
        <View style={s.topProfileArea}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={s.menuBtn}>
            <Menu color={theme.textPrimary} size={28} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('SettingsTab')} style={s.profileBtn}>
            <View style={[s.avatar, { backgroundColor: theme.accent + '22' }]}>
              <User color={theme.accent} size={22} />
            </View>
            <View>
              <Text style={s.greeting}>Good day,</Text>
              <Text style={s.name}>{user?.full_name || 'Loading...'}</Text>
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => supabase.auth.signOut()} style={s.logoutBtn}>
            <LogOut color={theme.danger} size={18} />
          </TouchableOpacity>
        </View>

        {/* Dashboard Summary (Hero) */}
        <View style={s.heroBox}>
          <Text style={s.heroLabel}>Today's Total Bills</Text>
          <Text style={s.heroAmount}>৳{stats.todaySales.toLocaleString()}</Text>
          <View style={s.heroSub}>
            <ShoppingBag color={theme.accent} size={14} />
            <Text style={s.heroSubText}>{stats.totalBills} Bills generated today</Text>
          </View>
        </View>

      </Animated.View>

      {/* Animated Search Bar Container */}
      <Animated.View style={[s.searchContainerWrapper, { transform: [{ translateY: searchTranslateY }] }]}>
        <View style={s.searchBar}>
          <Search color={isSearching ? theme.accent : theme.textMuted} size={20} />
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
              <X color={theme.textMuted} size={18} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* Content Below Search (Rest of Dashboard / Search Results) */}
      <View style={{ flex: 1, marginTop: isSearching ? -200 + insets.top + 70 : 10 }}>
        {isSearching ? (
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={searchResults}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={s.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.resultCard} onPress={() => { closeSearch(); /* Optional: navigate to details */ }}>
                <View style={[s.iconBox, { backgroundColor: theme.bgElevated }]}>
                  <Package color={theme.accent} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rName}>{item.name}</Text>
                  <Text style={s.rMeta}>{item.sku || 'N/A'}</Text>
                </View>
                <Text style={[s.rVal, { color: theme.success }]}>৳{item.selling_price}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              searchQuery.length > 0 ? (
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
                <Text style={s.sectionTitle}>Quick Overview</Text>
                <View style={s.placeholderCard}>
                  <Activity color={theme.textMuted} size={32} />
                  <Text style={s.placeText}>More dashboard metrics can go here.</Text>
                </View>
              </View>
            )}
          />
        )}
      </View>
      
    </View>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  searchBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.bg, zIndex: 10 },
  topProfileArea: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },
  menuBtn: { marginRight: 16, padding: 4 },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  greeting: { color: theme.textMuted, fontSize: 13 },
  name: { color: theme.textPrimary, fontSize: 18, fontWeight: '800' },
  logoutBtn: { padding: 8, backgroundColor: theme.bgCard, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  
  heroBox: { backgroundColor: theme.bgCard, marginHorizontal: 20, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  heroLabel: { color: theme.textMuted, fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  heroAmount: { color: theme.textPrimary, fontSize: 42, fontWeight: '900', letterSpacing: -1 },
  heroSub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: theme.bg, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', borderRadius: 8 },
  heroSubText: { color: theme.textSecondary, fontSize: 13, fontWeight: '500' },
  
  searchContainerWrapper: { paddingHorizontal: 20, zIndex: 20, marginTop: 20 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: 16, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  searchInput: { flex: 1, color: theme.textPrimary, fontSize: 16, marginLeft: 12, height: '100%' },
  clearBtn: { padding: 6 },
  
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },
  resultCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  rName: { color: theme.textPrimary, fontSize: 16, fontWeight: '700' },
  rMeta: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  rVal: { fontSize: 16, fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: 40 },

  dashScroll: { paddingHorizontal: 20, paddingBottom: 100 },
  sectionTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 10, marginBottom: 16 },
  placeholderCard: { backgroundColor: theme.bgCard, borderRadius: 20, padding: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed' },
  placeText: { color: theme.textMuted, fontSize: 14, fontWeight: '500', marginTop: 10 },
});
