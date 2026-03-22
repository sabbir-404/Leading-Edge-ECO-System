import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, Alert, RefreshControl, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useResponsive } from '../../lib/responsive';
import { decryptObject, decryptRows } from '../../lib/encryption';
import { Shield, ShieldOff, Wifi, WifiOff } from 'lucide-react-native';

export default function UsersScreen() {
  const { theme } = useTheme();
  const ui = useResponsive();
  const [users, setUsers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [tab, setTab] = useState<'users' | 'sessions'>('sessions');
  const [refreshing, setRefreshing] = useState(false);
  const [myRole, setMyRole] = useState('');

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: me } = await supabase.from('users').select('role').eq('auth_id', user.id).single();
    const role = (decryptObject(me || {})?.role || '').toLowerCase();
    setMyRole(role);
    if (role !== 'admin' && role !== 'superadmin') return;

    const { data: allUsers } = await supabase.from('users').select('id, username, full_name, role, is_active').neq('role', 'superadmin').order('full_name');
    setUsers(decryptRows(allUsers || []));

    const { data: sesh } = await supabase.from('active_sessions').select('*, users(full_name, role)').order('last_active', { ascending: false });
    setSessions(decryptRows(sesh || []));
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, []);

  const toggleActive = async (u: any) => {
    const newVal = !u.is_active;
    const { error } = await supabase.from('users').update({ is_active: newVal }).eq('id', u.id);
    if (error) return Alert.alert('Error', error.message);
    if (!newVal) {
      // Also kick active session
      await supabase.from('active_sessions').delete().eq('user_id', u.id);
    }
    Alert.alert('Updated', `${u.full_name} is now ${newVal ? 'Active' : 'Blocked'}.`);
    fetchData();
  };

  const kickSession = async (sessionId: number, name: string) => {
    await supabase.from('active_sessions').delete().eq('id', sessionId);
    Alert.alert('Kicked', `${name}'s session ended.`);
    fetchData();
  };

  const s = makeStyles(theme, ui);

  if (myRole && myRole !== 'admin' && myRole !== 'superadmin') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><Text style={s.noAccess}>Admin access required.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.title}>User Management</Text></View>
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'sessions' && s.tabActive]} onPress={() => setTab('sessions')}>
          <Text style={[s.tabText, tab === 'sessions' && s.tabTextActive]}>Active Sessions ({sessions.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'users' && s.tabActive]} onPress={() => setTab('users')}>
          <Text style={[s.tabText, tab === 'users' && s.tabTextActive]}>All Users ({users.length})</Text>
        </TouchableOpacity>
      </View>

      {tab === 'sessions' ? (
        <FlatList
          data={sessions}
          keyExtractor={i => i.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          contentContainerStyle={{ padding: ui.contentPadding, paddingBottom: ui.spacing(30) }}
          ListEmptyComponent={<Text style={s.empty}>No active sessions.</Text>}
          ItemSeparatorComponent={() => <View style={{ height: ui.spacing(10) }} />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <Wifi color={theme.success} size={ui.icon(20)} />
              <View style={{ flex: 1, marginLeft: ui.spacing(12) }}>
                <Text style={s.userName}>{item.users?.full_name || item.user_id}</Text>
                <Text style={s.meta}>{item.device_type || 'Unknown'} · {item.users?.role}</Text>
                <Text style={s.meta}>Last active: {new Date(item.last_active).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <TouchableOpacity style={s.kickBtn} onPress={() => kickSession(item.id, item.users?.full_name)}>
                <WifiOff color={theme.danger} size={ui.icon(16)} />
              </TouchableOpacity>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={i => i.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          contentContainerStyle={{ padding: ui.contentPadding, paddingBottom: ui.spacing(30) }}
          ListEmptyComponent={<Text style={s.empty}>No users found.</Text>}
          ItemSeparatorComponent={() => <View style={{ height: ui.spacing(10) }} />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={[s.dot, { backgroundColor: item.is_active ? theme.success : theme.danger }]} />
              <View style={{ flex: 1, marginLeft: ui.spacing(12) }}>
                <Text style={s.userName}>{item.full_name || item.username}</Text>
                <Text style={s.meta}>{item.username} · {item.role}</Text>
              </View>
              <TouchableOpacity style={[s.toggleBtn, { backgroundColor: item.is_active ? theme.dangerLight : theme.successLight }]}
                onPress={() => toggleActive(item)}>
                {item.is_active ? <ShieldOff color={theme.danger} size={ui.icon(16)} /> : <Shield color={theme.success} size={ui.icon(16)} />}
                <Text style={{ color: item.is_active ? theme.danger : theme.success, fontSize: ui.font(12), fontWeight: '700', marginLeft: ui.spacing(4) }}>
                  {item.is_active ? 'Block' : 'Unblock'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (theme: any, ui: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: ui.contentPadding, paddingTop: ui.spacing(10), paddingBottom: ui.spacing(8) },
  title: { color: theme.textPrimary, fontSize: ui.font(22, 18, 28), fontWeight: '800' },
  tabs: { flexDirection: 'row', marginHorizontal: ui.contentPadding, marginBottom: ui.spacing(8), backgroundColor: theme.bgCard, borderRadius: ui.radius(12), padding: ui.spacing(4), borderWidth: 1, borderColor: theme.border },
  tab: { flex: 1, minHeight: ui.controlHeight, paddingVertical: ui.spacing(8), alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius(10) },
  tabActive: { backgroundColor: theme.accent },
  tabText: { color: theme.textMuted, fontWeight: '600', fontSize: ui.font(13), textAlign: 'center' },
  tabTextActive: { color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgCard, borderRadius: ui.radius(14), padding: ui.cardPadding, minHeight: ui.isUltraCompact ? ui.scale(68) : ui.scale(74), borderWidth: 1, borderColor: theme.border, gap: ui.compactRowGap },
  dot: { width: ui.scale(10), height: ui.scale(10), borderRadius: ui.radius(5) },
  userName: { color: theme.textPrimary, fontWeight: '700', fontSize: ui.font(14) },
  meta: { color: theme.textMuted, fontSize: ui.font(12), marginTop: ui.spacing(1) },
  kickBtn: { backgroundColor: theme.dangerLight, borderRadius: ui.radius(10), minWidth: ui.touchMin, minHeight: ui.touchMin, alignItems: 'center', justifyContent: 'center', padding: ui.compactDetailPadding },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', minHeight: ui.touchMin, borderRadius: ui.radius(10), paddingVertical: ui.compactDetailPadding, paddingHorizontal: ui.spacing(10) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccess: { color: theme.textMuted, fontSize: ui.font(16) },
  empty: { color: theme.textMuted, textAlign: 'center', marginTop: ui.spacing(40), fontSize: ui.font(14) },
});
