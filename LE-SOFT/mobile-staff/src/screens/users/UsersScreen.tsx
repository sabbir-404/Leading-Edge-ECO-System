import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, Alert, RefreshControl, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Shield, ShieldOff, Wifi, WifiOff } from 'lucide-react-native';

export default function UsersScreen() {
  const [users, setUsers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [tab, setTab] = useState<'users' | 'sessions'>('sessions');
  const [refreshing, setRefreshing] = useState(false);
  const [myRole, setMyRole] = useState('');

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: me } = await supabase.from('users').select('role').eq('auth_id', user.id).single();
    setMyRole(me?.role || '');
    if (me?.role !== 'admin' && me?.role !== 'superadmin') return;

    const { data: allUsers } = await supabase.from('users').select('id, username, full_name, role, is_active').neq('role', 'superadmin').order('full_name');
    setUsers(allUsers || []);

    const { data: sesh } = await supabase.from('active_sessions').select('*, users(full_name, role)').order('last_active', { ascending: false });
    setSessions(sesh || []);
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

  if (myRole !== 'admin' && myRole !== 'superadmin') {
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={s.empty}>No active sessions.</Text>}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <Wifi color="#10b981" size={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.userName}>{item.users?.full_name || item.user_id}</Text>
                <Text style={s.meta}>{item.device_type || 'Unknown'} · {item.users?.role}</Text>
                <Text style={s.meta}>Last active: {new Date(item.last_active).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <TouchableOpacity style={s.kickBtn} onPress={() => kickSession(item.id, item.users?.full_name)}>
                <WifiOff color="#ef4444" size={16} />
              </TouchableOpacity>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={i => i.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={s.empty}>No users found.</Text>}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={[s.dot, { backgroundColor: item.is_active ? '#10b981' : '#ef4444' }]} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.userName}>{item.full_name || item.username}</Text>
                <Text style={s.meta}>{item.username} · {item.role}</Text>
              </View>
              <TouchableOpacity style={[s.toggleBtn, { backgroundColor: item.is_active ? '#7f1d1d' : '#166534' }]}
                onPress={() => toggleActive(item)}>
                {item.is_active ? <ShieldOff color="#ef4444" size={16} /> : <Shield color="#10b981" size={16} />}
                <Text style={{ color: item.is_active ? '#ef4444' : '#10b981', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { padding: 16, paddingTop: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#111', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#222' },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#1d4ed8' },
  tabText: { color: '#6b7280', fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#222' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  userName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  meta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  kickBtn: { backgroundColor: '#3b0f0f', borderRadius: 10, padding: 10 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccess: { color: '#6b7280', fontSize: 16 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 40 },
});
