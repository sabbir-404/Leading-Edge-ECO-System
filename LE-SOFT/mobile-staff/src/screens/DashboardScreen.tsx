import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, TextInput, Keyboard } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';
import { decryptObject } from '../lib/encryption';
import { useResponsive } from '../lib/responsive';
import { buildIlikeOr } from '../lib/queryUtils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Search, Package, X, LogOut, ShoppingBag, Menu, AlertTriangle, Users, CalendarDays, Truck, ReceiptText, TrendingUp } from 'lucide-react-native';
import { useDebounce } from 'use-debounce';

interface Stats {
  todaySalesAmount: number;
  todayBills: number;
  monthAvgSale: number;
  shippingOrders: number;
}

interface TileItem {
  id: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  onPress?: () => void;
}

const PUBLIC_HOLIDAYS: Array<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 2, day: 21, name: 'Language Martyrs Day' },
  { month: 3, day: 26, name: 'Independence Day' },
  { month: 4, day: 14, name: 'Pohela Boishakh' },
  { month: 5, day: 1, name: 'May Day' },
  { month: 8, day: 15, name: 'National Mourning Day' },
  { month: 12, day: 16, name: 'Victory Day' },
  { month: 12, day: 25, name: 'Christmas Day' },
];

const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekShort = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const formatDateLong = (date: Date) => date.toLocaleDateString('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function DashboardScreen({ navigation }: any) {
  const { theme } = useTheme();
  const ui = useResponsive();

  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<Stats>({ todaySalesAmount: 0, todayBills: 0, monthAvgSale: 0, shippingOrders: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingDB, setSearchingDB] = useState(false);

  const [totalCustomers, setTotalCustomers] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setToday(new Date());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of PUBLIC_HOLIDAYS) {
      map.set(`${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`, h.name);
    }
    return map;
  }, []);

  const todaysHoliday = useMemo(() => {
    const key = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return holidayMap.get(key) || '';
  }, [holidayMap, today]);

  const upcomingHolidays = useMemo(() => {
    return PUBLIC_HOLIDAYS
      .map((h) => {
        const thisYear = new Date(today.getFullYear(), h.month - 1, h.day);
        const nextDate = thisYear >= new Date(today.getFullYear(), today.getMonth(), today.getDate()) ? thisYear : new Date(today.getFullYear() + 1, h.month - 1, h.day);
        return { ...h, date: nextDate };
      })
      .sort((a, b) => +a.date - +b.date)
      .slice(0, 3)
      .map((h) => ({ label: `${h.day} ${monthShort[h.month - 1]}`, name: h.name }));
  }, [today]);

  const monthGrid = useMemo(() => {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ day: number | null; holiday?: string }> = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push({ day: null });
    for (let d = 1; d <= daysInMonth; d += 1) {
      const key = `${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, holiday: holidayMap.get(key) });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null });
    return cells;
  }, [today, holidayMap]);

  const fetchData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const { data: profile } = await supabase.from('users').select('*').eq('auth_id', authUser.id).single();
    setUser(decryptObject(profile || {}));

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: todayBillsData } = await supabase.from('bills').select('grand_total').gte('created_at', dayStart);
    const todayBills = todayBillsData || [];
    const todaySalesAmount = todayBills.reduce((sum: number, b: any) => sum + Number(b?.grand_total || 0), 0);

    const { data: monthBillsData } = await supabase.from('bills').select('grand_total').gte('created_at', monthStart);
    const monthBills = monthBillsData || [];
    const monthTotal = monthBills.reduce((sum: number, b: any) => sum + Number(b?.grand_total || 0), 0);
    const monthAvgSale = monthBills.length > 0 ? monthTotal / monthBills.length : 0;

    const { count: shippingCount } = await supabase.from('bill_shipping').select('id', { count: 'exact', head: true });

    setStats({
      todaySalesAmount,
      todayBills: todayBills.length,
      monthAvgSale,
      shippingOrders: shippingCount || 0,
    });

    const { count: cCount } = await supabase.from('billing_customers').select('*', { count: 'exact', head: true });
    setTotalCustomers(cCount || 0);

    const { count: sCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).lt('quantity', 5);
    setLowStockCount(sCount || 0);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const searchDB = async () => {
      if (!debouncedQuery) {
        setSearchResults([]);
        return;
      }
      setSearchingDB(true);
      
      // Use safe query builder instead of string interpolation
      const filter = buildIlikeOr(debouncedQuery, ['name', 'sku']);
      if (!filter) {
        setSearchResults([]);
        setSearchingDB(false);
        return;
      }

      const { data } = await supabase
        .from('products')
        .select('*')
        .or(filter)
        .limit(20);
      setSearchResults(data || []);
      setSearchingDB(false);
    };
    searchDB();
  }, [debouncedQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, []);

  const handleSearchFocus = () => setIsSearching(true);

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

  const tiles: TileItem[] = [
    {
      id: 'customers',
      label: 'Customers',
      value: String(totalCustomers),
      icon: <Users color={theme.accent} size={ui.icon(22)} />,
      accent: theme.accent + '22',
    },
    {
      id: 'low-stock',
      label: 'Low Stock',
      value: String(lowStockCount),
      icon: <AlertTriangle color={theme.danger} size={ui.icon(22)} />,
      accent: theme.danger + '22',
    },
    {
      id: 'today-bills',
      label: 'Bills Today',
      value: String(stats.todayBills),
      icon: <ReceiptText color={theme.warning} size={ui.icon(22)} />,
      accent: theme.warning + '22',
    },
    {
      id: 'today-sales',
      label: 'Sales Today',
      value: `৳${Math.round(stats.todaySalesAmount).toLocaleString()}`,
      icon: <ShoppingBag color={theme.success} size={ui.icon(22)} />,
      accent: theme.success + '22',
    },
    {
      id: 'avg-month',
      label: 'Avg Sale (Month)',
      value: `৳${Math.round(stats.monthAvgSale).toLocaleString()}`,
      icon: <TrendingUp color={theme.accent} size={ui.icon(22)} />,
      accent: theme.accent + '22',
    },
    {
      id: 'shipping',
      label: 'Orders on Shipping',
      value: String(stats.shippingOrders),
      icon: <Truck color={theme.textPrimary} size={ui.icon(22)} />,
      accent: theme.bgElevated,
      onPress: () => navigation.navigate('ShippingTab'),
    },
  ];

  const s = makeStyles(theme, ui);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
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

      <View style={{ flex: 1, marginTop: 10 }}>
        {isSearching ? (
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={searchResults}
            keyExtractor={(item) => item.id.toString()}
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
            keyExtractor={(i) => i.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.dashScroll}
            renderItem={() => (
              <View>
                <View style={s.calendarCard}>
                  <View style={s.calendarHead}>
                    <View style={s.calendarHeadLeft}>
                      <CalendarDays color={theme.accent} size={ui.icon(18)} />
                      <Text style={s.calendarTitle}>Calendar</Text>
                    </View>
                    <Text style={s.calendarMonth}>{monthShort[today.getMonth()]} {today.getFullYear()}</Text>
                  </View>

                  <Text style={s.todayText}>{formatDateLong(today)}</Text>
                  {!!todaysHoliday && <Text style={s.todayHoliday}>Today: {todaysHoliday}</Text>}

                  <View style={s.weekRow}>
                    {weekShort.map((w) => (
                      <Text key={w} style={s.weekCell}>{w}</Text>
                    ))}
                  </View>
                  <View style={s.daysGrid}>
                    {monthGrid.map((c, idx) => {
                      const isToday = c.day === today.getDate();
                      return (
                        <View key={`${idx}-${c.day || 'x'}`} style={[s.dayCell, isToday && s.dayCellToday, c.holiday && !isToday ? s.dayCellHoliday : null]}>
                          <Text style={[s.dayText, isToday && s.dayTextToday]}>{c.day || ''}</Text>
                        </View>
                      );
                    })}
                  </View>

                  <View style={s.holidayList}>
                    {upcomingHolidays.map((h) => (
                      <View key={`${h.label}-${h.name}`} style={s.holidayItem}>
                        <Text style={s.holidayDate}>{h.label}</Text>
                        <Text style={s.holidayName} numberOfLines={1}>{h.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <Text style={s.sectionTitle}>Overview & Metrics</Text>
                <View style={s.gridRow}>
                  {tiles.map((tile) => {
                    const Comp: any = tile.onPress ? TouchableOpacity : View;
                    return (
                      <Comp key={tile.id} style={[s.gridTile, tile.onPress ? s.gridTileAction : null]} onPress={tile.onPress}>
                        <View style={[s.tileIcon, { backgroundColor: tile.accent }]}>{tile.icon}</View>
                        <Text style={s.tileTitle}>{tile.label}</Text>
                        <Text style={s.tileValue} numberOfLines={1}>{tile.value}</Text>
                      </Comp>
                    );
                  })}
                </View>
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
  topProfileArea: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: ui.spacing(20), paddingTop: ui.spacing(12), paddingBottom: ui.spacing(16), gap: ui.spacing(12) },
  menuBtn: { minWidth: ui.touchMin, minHeight: ui.touchMin, marginRight: ui.spacing(8), padding: ui.spacing(8), borderRadius: ui.radius(12), justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(14), flexShrink: 1, paddingVertical: ui.spacing(8), paddingHorizontal: ui.spacing(12), borderRadius: ui.radius(14), backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.border },
  avatar: { width: ui.scale(48), height: ui.scale(48), borderRadius: ui.radius(24), alignItems: 'center', justifyContent: 'center' },
  greeting: { color: theme.textMuted, fontSize: ui.font(12), fontWeight: '600' },
  name: { color: theme.textPrimary, fontSize: ui.font(18, 16, 20), fontWeight: '900', marginTop: ui.spacing(2) },
  logoutBtn: { minWidth: ui.touchMin, minHeight: ui.touchMin, padding: ui.spacing(10), backgroundColor: theme.bgCard, borderRadius: ui.radius(12), borderWidth: 1, borderColor: theme.danger + '44', justifyContent: 'center', alignItems: 'center', marginLeft: 'auto' },

  searchContainerWrapper: { paddingHorizontal: ui.spacing(20), zIndex: 5, marginBottom: ui.spacing(8) },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: ui.radius(18), paddingHorizontal: ui.spacing(18), height: ui.scale(60), borderWidth: 1.5, borderColor: theme.border, gap: ui.spacing(12), shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  searchInput: { flex: 1, color: theme.textPrimary, fontSize: ui.font(16), height: '100%', fontWeight: '500' },
  clearBtn: { minWidth: ui.touchMin, minHeight: ui.touchMin, padding: ui.spacing(8), justifyContent: 'center', alignItems: 'center' },

  listContent: { paddingHorizontal: ui.spacing(20), paddingTop: ui.spacing(20), paddingBottom: ui.spacing(120) },
  resultCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgCard, borderRadius: ui.radius(18), padding: ui.spacing(16), marginBottom: ui.spacing(12), borderWidth: 1, borderColor: theme.border, gap: ui.spacing(14) },
  iconBox: { width: ui.scale(50), height: ui.scale(50), borderRadius: ui.radius(14), alignItems: 'center', justifyContent: 'center' },
  rName: { color: theme.textPrimary, fontSize: ui.font(16), fontWeight: '700' },
  rMeta: { color: theme.textMuted, fontSize: ui.font(13), marginTop: ui.spacing(4) },
  rVal: { fontSize: ui.font(15), fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: ui.spacing(60) },

  dashScroll: { paddingHorizontal: ui.spacing(20), paddingBottom: ui.spacing(110) },

  calendarCard: {
    backgroundColor: theme.bgCard,
    borderRadius: ui.radius(20),
    borderWidth: 1,
    borderColor: theme.border,
    padding: ui.cardPadding,
    marginBottom: ui.spacing(14),
  },
  calendarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(8) },
  calendarTitle: { color: theme.textPrimary, fontSize: ui.font(14), fontWeight: '800' },
  calendarMonth: { color: theme.textMuted, fontSize: ui.font(12), fontWeight: '700' },
  todayText: { color: theme.textPrimary, fontSize: ui.font(13), marginTop: ui.spacing(8), fontWeight: '600' },
  todayHoliday: { color: theme.success, fontSize: ui.font(12), marginTop: ui.spacing(4), fontWeight: '700' },

  weekRow: { flexDirection: 'row', marginTop: ui.spacing(10) },
  weekCell: { flex: 1, textAlign: 'center', color: theme.textMuted, fontSize: ui.font(11), fontWeight: '700' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: ui.spacing(6) },
  dayCell: { width: '14.2857%', alignItems: 'center', justifyContent: 'center', paddingVertical: ui.spacing(4), borderRadius: ui.radius(8) },
  dayCellToday: { backgroundColor: theme.accent + '2A' },
  dayCellHoliday: { backgroundColor: theme.warning + '1F' },
  dayText: { color: theme.textPrimary, fontSize: ui.font(11), fontWeight: '600' },
  dayTextToday: { color: theme.accent, fontWeight: '800' },

  holidayList: { marginTop: ui.spacing(10), gap: ui.spacing(6) },
  holidayItem: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(8) },
  holidayDate: { color: theme.accent, fontSize: ui.font(11), fontWeight: '800', minWidth: ui.scale(48) },
  holidayName: { color: theme.textMuted, fontSize: ui.font(11), flex: 1 },

  sectionTitle: { color: theme.textPrimary, fontSize: ui.font(18), fontWeight: '800', marginTop: ui.spacing(2), marginBottom: ui.spacing(12) },
  gridRow: { flexDirection: ui.isCompact ? 'column' : 'row', flexWrap: ui.isCompact ? 'nowrap' : 'wrap', gap: ui.spacing(10) },
  gridTile: { width: ui.isCompact ? '100%' : '48%', backgroundColor: theme.bgCard, borderRadius: ui.radius(16), padding: ui.cardPadding, borderWidth: 1, borderColor: theme.border },
  gridTileAction: { borderColor: theme.accent + '66' },
  tileIcon: { width: ui.scale(40), height: ui.scale(40), borderRadius: ui.radius(12), alignItems: 'center', justifyContent: 'center', marginBottom: ui.spacing(10) },
  tileTitle: { color: theme.textMuted, fontSize: ui.font(12), fontWeight: '600', marginBottom: ui.spacing(5) },
  tileValue: { color: theme.textPrimary, fontSize: ui.font(20, 18, 24), fontWeight: '800' },
});
