import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';
import { useResponsive } from '../lib/responsive';
import { decryptObject, encryptObjectForDb } from '../lib/encryption';
import KeyboardAwareContainer from '../components/KeyboardAwareContainer';
import { User, Lock, Eye, EyeOff, Info, LogOut, Sun, Moon, Database, Settings as SettingsIcon, RefreshCw, Barcode, Download, ChevronRight } from 'lucide-react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';

type SettingsTab = 'profile' | 'system' | 'database' | 'about';

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const ui = useResponsive();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  
  const [profile, setProfile] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Database status
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  // Updates
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('*').eq('auth_id', user.id).single();
      const parsed = decryptObject(data || {});
      setProfile(parsed);
      setDisplayName(parsed?.full_name || '');
      checkDb();
    };
    load();
  }, []);

  const checkDb = async () => {
    setDbStatus('checking');
    try {
      const { error } = await supabase.from('users').select('id').limit(1);
      setDbStatus(error ? 'error' : 'connected');
    } catch { setDbStatus('error'); }
  };

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateAvailable(true);
        Alert.alert('Update Available', 'A new version is available. Would you like to download it?', [
          { text: 'Later' },
          { text: 'Download', onPress: fetchUpdate }
        ]);
      } else {
        Alert.alert('Up to Date', 'You are running the latest version.');
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not check for updates: ' + e.message);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const fetchUpdate = async () => {
    try {
      await Updates.fetchUpdateAsync();
      Alert.alert('Ready', 'Update downloaded. Restart the app to apply.', [
        { text: 'Restart', onPress: () => Updates.reloadAsync() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', 'Failed to fetch update: ' + e.message);
    }
  };

  const saveName = async () => {
    if (!displayName.trim()) return Alert.alert('Error', 'Name cannot be empty.');
    setSaving(true);
    const payload = encryptObjectForDb({ full_name: displayName.trim() });
    const { error } = await supabase.from('users').update(payload).eq('id', profile.id);
    setSaving(false);
    if (error) Alert.alert('Error', error.message); else Alert.alert('✅ Saved', 'Display name updated.');
  };

  const changePass = async () => {
    if (newPass !== confirmPass) return Alert.alert('Error', 'Passwords do not match.');
    if (newPass.length < 6) return Alert.alert('Error', 'Minimum 6 characters.');
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setSaving(false);
    if (error) Alert.alert('Error', error.message); else { Alert.alert('✅ Updated', 'Password changed.'); setNewPass(''); setConfirmPass(''); }
  };

  const logout = () => Alert.alert('Logout', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Logout', style: 'destructive', onPress: () => supabase.auth.signOut() },
  ]);

  const s = makeStyles(theme, ui);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}><Text style={s.title}>Settings</Text></View>

      {/* Tabs */}
      <View style={s.tabStrip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabScroll}>
          {[
            { id: 'profile', label: 'Profile', icon: <User size={ui.icon(18)} color={activeTab === 'profile' ? '#fff' : theme.textSecondary} /> },
            { id: 'system', label: 'System', icon: <SettingsIcon size={ui.icon(18)} color={activeTab === 'system' ? '#fff' : theme.textSecondary} /> },
            { id: 'database', label: 'Database', icon: <Database size={ui.icon(18)} color={activeTab === 'database' ? '#fff' : theme.textSecondary} /> },
            { id: 'about', label: 'About', icon: <Info size={ui.icon(18)} color={activeTab === 'about' ? '#fff' : theme.textSecondary} /> },
          ].map(tab => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id as SettingsTab)}
              style={[s.tab, activeTab === tab.id && s.tabActive]}
            >
              {tab.icon}
              <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <KeyboardAwareContainer>
        <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
          {activeTab === 'profile' && (
            <View>
              {profile && (
                <View style={s.profileHeader}>
                  <View style={[s.avatar, { backgroundColor: theme.accent }]}>
                    <Text style={s.avatarText}>{(profile.full_name || profile.username || '?')[0].toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={s.profileName}>{profile.full_name || profile.username}</Text>
                    <Text style={[s.profileRole, { color: theme.accent }]}>{profile.role?.toUpperCase()}</Text>
                  </View>
                </View>
              )}

              <View style={s.section}>
                <View style={s.sectionHead}><User color={theme.accent} size={ui.icon(18)} /><Text style={s.sectionTitle}>Display Name</Text></View>
                <TextInput style={s.input} value={displayName} onChangeText={setDisplayName}
                  placeholder="Your name..." placeholderTextColor={theme.textMuted} />
                <TouchableOpacity style={[s.btn, { backgroundColor: theme.accent }]} onPress={saveName} disabled={saving}>
                  <Text style={s.btnText}>{saving ? 'Saving...' : 'Save Name'}</Text>
                </TouchableOpacity>
              </View>

              <View style={s.section}>
                <View style={s.sectionHead}><Lock color={theme.purple} size={ui.icon(18)} /><Text style={s.sectionTitle}>Change Password</Text></View>
                <View style={s.passRow}>
                  <TextInput style={[s.input, { flex: 1 }]} value={newPass} onChangeText={setNewPass}
                    placeholder="New password" placeholderTextColor={theme.textMuted} secureTextEntry={!showNew} />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowNew(!showNew)}>
                    {showNew ? <EyeOff color={theme.textMuted} size={ui.icon(18)} /> : <Eye color={theme.textMuted} size={ui.icon(18)} />}
                  </TouchableOpacity>
                </View>
                <TextInput style={[s.input, { marginTop: 10 }]} value={confirmPass} onChangeText={setConfirmPass}
                  placeholder="Confirm new password" placeholderTextColor={theme.textMuted} secureTextEntry />
                <TouchableOpacity style={[s.btn, { backgroundColor: theme.purple }]} onPress={changePass} disabled={saving}>
                  <Text style={s.btnText}>Change Password</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === 'system' && (
            <View>
              {/* Appearance */}
              <View style={s.section}>
                <View style={s.sectionHead}><Sun color={theme.warning} size={ui.icon(18)} /><Text style={s.sectionTitle}>Appearance</Text></View>
                <TouchableOpacity style={s.row} onPress={toggleTheme}>
                  <View>
                    <Text style={s.rowTitle}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
                    <Text style={s.rowSub}>Switch between light and dark themes</Text>
                  </View>
                  <View style={[s.toggle, { backgroundColor: isDark ? theme.accent : theme.bgElevated }]}>
                    <View style={[s.toggleDot, isDark && s.toggleDotOn]} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Barcode settings simplified for mobile */}
              <View style={s.section}>
                <View style={s.sectionHead}><Barcode color={theme.accent} size={ui.icon(18)} /><Text style={s.sectionTitle}>Scanning</Text></View>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>Auto-Focus</Text>
                    <Text style={s.rowSub}>Enabled by default for better scanning</Text>
                  </View>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.success }} />
                </View>
              </View>
            </View>
          )}

          {activeTab === 'database' && (
            <View>
              <View style={s.section}>
                <View style={s.sectionHead}><Database color={theme.success} size={ui.icon(18)} /><Text style={s.sectionTitle}>Supabase Connection</Text></View>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>Health Check</Text>
                    <Text style={[s.rowSub, { color: dbStatus === 'connected' ? theme.success : dbStatus === 'error' ? theme.danger : theme.textMuted }]}>
                      {dbStatus === 'checking' ? 'Testing connection…' : dbStatus === 'connected' ? 'Connected to Cloud' : 'Connection Failed'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={checkDb} style={s.refreshBtn}>
                    <RefreshCw size={ui.icon(16)} color={theme.accent} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.section}>
                <View style={s.sectionHead}><LogOut color={theme.danger} size={ui.icon(18)} /><Text style={s.sectionTitle}>Session</Text></View>
                <TouchableOpacity style={[s.btn, { backgroundColor: theme.dangerLight, borderColor: theme.danger + '44', borderWidth: 1 }]} onPress={logout}>
                  <Text style={[s.btnText, { color: theme.danger }]}>Logout Session</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === 'about' && (
            <View>
              <View style={s.section}>
                <View style={s.sectionHead}><Info color={theme.accent} size={ui.icon(18)} /><Text style={s.sectionTitle}>Software Info</Text></View>
                {[
                  ['Application', 'LE-SOFT Staff'],
                  ['Version', Constants.expoConfig?.version || '1.2.5'],
                  ['Platform', Platform.OS === 'ios' ? 'iOS' : 'Android'],
                  ['Developer', 'Leading Edge'],
                ].map(([k, v]) => (
                  <View key={k} style={s.infoRow}>
                    <Text style={s.infoKey}>{k}</Text>
                    <Text style={s.infoVal}>{v}</Text>
                  </View>
                ))}
              </View>

              <View style={s.section}>
                <View style={s.sectionHead}><Download color={theme.purple} size={ui.icon(18)} /><Text style={s.sectionTitle}>Updates</Text></View>
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>Check for Updates</Text>
                    <Text style={s.rowSub}>Keep your app up to date</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={checkForUpdates} 
                    disabled={checkingUpdate}
                    style={[s.refreshBtn, { backgroundColor: theme.bgElevated }]}
                  >
                    {checkingUpdate ? <ActivityIndicator size="small" color={theme.accent} /> : <RefreshCw size={ui.icon(16)} color={theme.accent} />}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          <View style={{ height: ui.spacing(40) }} />
        </ScrollView>
      </KeyboardAwareContainer>
    </SafeAreaView>
  );
}

const makeStyles = (t: any, ui: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: ui.contentPadding, paddingTop: ui.spacing(10), paddingBottom: ui.spacing(8) },
  title: { color: t.textPrimary, fontSize: ui.font(24, 20, 30), fontWeight: '900' },
  
  tabStrip: { paddingHorizontal: ui.contentPadding, marginBottom: ui.spacing(8) },
  tabScroll: { gap: ui.spacing(8) },
  tab: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(6), backgroundColor: t.bgElevated, paddingVertical: ui.spacing(8), paddingHorizontal: ui.spacing(16), borderRadius: ui.radius(10), borderWidth: 1, borderColor: t.border },
  tabActive: { backgroundColor: t.accent, borderColor: t.accent },
  tabText: { color: t.textSecondary, fontWeight: '700', fontSize: ui.font(13) },
  tabTextActive: { color: '#fff' },

  content: { flex: 1 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(16), paddingHorizontal: ui.contentPadding, paddingVertical: ui.spacing(18) },
  avatar: { width: ui.scale(60), height: ui.scale(60), borderRadius: ui.radius(30), alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: ui.font(24, 20, 30), fontWeight: '900' },
  profileName: { color: t.textPrimary, fontSize: ui.font(18), fontWeight: '800' },
  profileRole: { fontSize: ui.font(12), fontWeight: '700', letterSpacing: 1.2, marginTop: ui.spacing(4) },

  section: { backgroundColor: t.bgCard, borderRadius: ui.radius(20), marginHorizontal: ui.contentPadding, marginBottom: ui.sectionGap, padding: ui.cardPadding, borderWidth: 1, borderColor: t.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(10), marginBottom: ui.spacing(16) },
  sectionTitle: { color: t.textPrimary, fontSize: ui.font(16), fontWeight: '800' },
  
  input: { minHeight: ui.controlHeight, backgroundColor: t.bgInput, borderRadius: ui.radius(14), paddingHorizontal: ui.spacing(14), paddingVertical: ui.spacing(12), color: t.textPrimary, borderWidth: 1, borderColor: t.border, fontSize: ui.font(16) },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: ui.spacing(8) },
  eyeBtn: { backgroundColor: t.bgInput, borderRadius: ui.radius(14), minWidth: ui.touchMin, minHeight: ui.controlHeight, padding: ui.spacing(12), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border },
  
  btn: { borderRadius: ui.radius(16), paddingVertical: ui.spacing(14), alignItems: 'center', marginTop: ui.spacing(12) },
  btnText: { color: '#fff', fontWeight: '800', fontSize: ui.font(16) },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: ui.spacing(4) },
  rowTitle: { color: t.textPrimary, fontSize: ui.font(15), fontWeight: '700' },
  rowSub: { color: t.textSecondary, fontSize: ui.font(12), marginTop: ui.spacing(2) },
  
  toggle: { width: ui.scale(48), height: ui.scale(26), borderRadius: ui.radius(13), padding: ui.spacing(2), justifyContent: 'center' },
  toggleDot: { width: ui.scale(22), height: ui.scale(22), borderRadius: ui.radius(11), backgroundColor: '#fff' },
  toggleDotOn: { alignSelf: 'flex-end' },

  refreshBtn: { width: ui.touchMin, height: ui.touchMin, borderRadius: ui.radius(20), backgroundColor: t.bgElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: ui.spacing(12), borderBottomWidth: 1, borderBottomColor: t.border },
  infoKey: { color: t.textSecondary, fontSize: ui.font(14) },
  infoVal: { color: t.textPrimary, fontWeight: '700', fontSize: ui.font(14) },
});
