import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';
import KeyboardAwareContainer from '../components/KeyboardAwareContainer';
import { CreditCard, Users, Search, Truck, LogOut, Briefcase, TrendingUp, ShoppingBag, Activity, BarChart2 } from 'lucide-react-native';

interface Stats {
  todaySales: number; totalBills: number; activeSessions: number; pendingOrders: number;
}

export default function DashboardScreen({ navigation }: any) {
  const { theme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<Stats>({ todaySales: 0, totalBills: 0, activeSessions: 0, pendingOrders: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data: profile } = await supabase.from('users').select('*').eq('auth_id', authUser.id).single();
    setUser(profile);
    const today = new Date().toISOString().split('T')[0];
    const { data: bills } = await supabase.from('bills').select('grand_total').gte('created_at', today);
    const todaySales = (bills || []).reduce((s: number, b: any) => s + (b.grand_total || 0), 0);
    const { count: activeSessions } = await supabase.from('active_sessions').select('id', { count: 'exact', head: true });
    const { count: pendingOrders } = await supabase.from('make_orders').select('id', { count: 'exact', head: true }).in('status', ['Placed', 'In Production']);
    setStats({ todaySales, totalBills: (bills || []).length, activeSessions: activeSessions || 0, pendingOrders: pendingOrders || 0 });
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const quickActions = [
    { title: 'Billing / POS', icon: <CreditCard color={theme.accent} size={26} />, bg: theme.accentLight, tab: 'BillingTab' },
    { title: 'HRM Actions', icon: <Users color={theme.success} size={26} />, bg: theme.successLight, tab: 'HRMTab' },
    { title: 'Stock Search', icon: <Search color={theme.warning} size={26} />, bg: theme.warningLight, tab: 'MoreTab', screen: 'Stock' },
    { title: 'Make / Track', icon: <Briefcase color={theme.purple} size={26} />, bg: theme.purpleLight, tab: 'MoreTab', screen: 'Make' },
    { title: 'Shipping', icon: <Truck color={theme.danger} size={26} />, bg: theme.dangerLight, tab: 'MoreTab', screen: 'Shipping' },
    { title: 'Reports', icon: <BarChart2 color="#06b6d4" size={26} />, bg: theme.isDark ? '#0b2d38' : '#e0f7fa', tab: 'MoreTab', screen: 'Reports' },
  ];

  const statCards = [
    { label: "Today's Sales", value: `৳${stats.todaySales.toLocaleString()}`, icon: <TrendingUp color={theme.success} size={16} />, color: theme.success },
    { label: 'Bills Today', value: stats.totalBills.toString(), icon: <ShoppingBag color={theme.accent} size={16} />, color: theme.accent },
    { label: 'Online Users', value: stats.activeSessions.toString(), icon: <Activity color={theme.warning} size={16} />, color: theme.warning },
    { label: 'Pending Orders', value: stats.pendingOrders.toString(), icon: <Briefcase color={theme.purple} size={16} />, color: theme.purple },
  ];

  const s = makeStyles(theme);

  return (
    <KeyboardAwareContainer refreshing={refreshing} onRefresh={onRefresh}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting()},</Text>
          <Text style={s.name}>{user?.full_name || 'Staff'}</Text>
          <Text style={s.role}>{user?.role?.toUpperCase() || 'STAFF'}</Text>
        </View>
        <TouchableOpacity onPress={() => supabase.auth.signOut()} style={s.logoutBtn}>
          <LogOut color={theme.danger} size={20} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={s.statsGrid}>
        {statCards.map((card, i) => (
          <View key={i} style={s.statCard}>
            <View style={[s.statIcon, { backgroundColor: card.color + '22' }]}>{card.icon}</View>
            <Text style={[s.statValue, { color: card.color }]}>{card.value}</Text>
            <Text style={s.statLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

      {/* Quick Actions */}
      <Text style={s.sectionTitle}>Quick Actions</Text>
      <View style={s.actionsGrid}>
        {quickActions.map((item, i) => (
          <TouchableOpacity key={i} style={s.actionCard}
            onPress={() => item.screen ? navigation.navigate(item.tab, { screen: item.screen }) : navigation.navigate(item.tab)}>
            <View style={[s.actionIcon, { backgroundColor: item.bg }]}>{item.icon}</View>
            <Text style={s.actionTitle}>{item.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </KeyboardAwareContainer>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 20 },
  greeting: { color: theme.textMuted, fontSize: 14 },
  name: { color: theme.textPrimary, fontSize: 24, fontWeight: '800' },
  role: { color: theme.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  logoutBtn: { padding: 10, backgroundColor: theme.bgCard, borderRadius: 50, borderWidth: 1, borderColor: theme.border },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 20 },
  statCard: { width: '48%', backgroundColor: theme.bgCard, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { color: theme.textMuted, fontSize: 11, marginTop: 3 },
  sectionTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: '800', paddingHorizontal: 16, marginBottom: 12 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16 },
  actionCard: { width: '48%', backgroundColor: theme.bgCard, borderRadius: 16, padding: 16, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border },
  actionIcon: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionTitle: { color: theme.textPrimary, fontWeight: '600', fontSize: 13, textAlign: 'center' },
});
