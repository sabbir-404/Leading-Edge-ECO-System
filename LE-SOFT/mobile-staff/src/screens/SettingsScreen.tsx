import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';
import KeyboardAwareContainer from '../components/KeyboardAwareContainer';
import { User, Lock, Eye, EyeOff, Info, LogOut, Sun, Moon } from 'lucide-react-native';

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('*').eq('auth_id', user.id).single();
      setProfile(data); setDisplayName(data?.full_name || '');
    };
    load();
  }, []);

  const saveName = async () => {
    if (!displayName.trim()) return Alert.alert('Error', 'Name cannot be empty.');
    setSaving(true);
    const { error } = await supabase.from('users').update({ full_name: displayName }).eq('id', profile.id);
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

  const s = makeStyles(theme);

  return (
    <KeyboardAwareContainer>
      <View style={s.header}><Text style={s.title}>Settings</Text></View>

      {/* Profile Card */}
      {profile && (
        <View style={s.profileCard}>
          <View style={[s.avatar, { backgroundColor: theme.accent }]}>
            <Text style={s.avatarText}>{(profile.full_name || profile.username || '?')[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={s.profileName}>{profile.full_name || profile.username}</Text>
            <Text style={[s.profileRole, { color: theme.accent }]}>{profile.role?.toUpperCase()}</Text>
            <Text style={s.profileUser}>@{profile.username}</Text>
          </View>
        </View>
      )}

      {/* Theme Toggle */}
      <View style={s.section}>
        <View style={s.sectionHead}>{isDark ? <Moon color={theme.accent} size={18} /> : <Sun color={theme.warning} size={18} />}
          <Text style={s.sectionTitle}>Appearance</Text></View>
        <View style={s.themeRow}>
          <Text style={s.themeLabel}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
          <TouchableOpacity onPress={toggleTheme} style={[s.toggle, { backgroundColor: isDark ? theme.accent : theme.bgElevated }]}>
            <View style={[s.toggleDot, isDark && s.toggleDotOn]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Display Name */}
      <View style={s.section}>
        <View style={s.sectionHead}><User color={theme.accent} size={18} /><Text style={s.sectionTitle}>Display Name</Text></View>
        <TextInput style={s.input} value={displayName} onChangeText={setDisplayName}
          placeholder="Your name..." placeholderTextColor={theme.textMuted} returnKeyType="done" />
        <TouchableOpacity style={[s.btn, { backgroundColor: theme.accent }]} onPress={saveName} disabled={saving}>
          <Text style={s.btnText}>{saving ? 'Saving...' : 'Save Name'}</Text>
        </TouchableOpacity>
      </View>

      {/* Change Password */}
      <View style={s.section}>
        <View style={s.sectionHead}><Lock color={theme.purple} size={18} /><Text style={s.sectionTitle}>Change Password</Text></View>
        <View style={s.passRow}>
          <TextInput style={[s.input, { flex: 1 }]} value={newPass} onChangeText={setNewPass}
            placeholder="New password" placeholderTextColor={theme.textMuted} secureTextEntry={!showNew} returnKeyType="next" />
          <TouchableOpacity style={s.eyeBtn} onPress={() => setShowNew(!showNew)}>
            {showNew ? <EyeOff color={theme.textMuted} size={18} /> : <Eye color={theme.textMuted} size={18} />}
          </TouchableOpacity>
        </View>
        <TextInput style={[s.input, { marginTop: 10 }]} value={confirmPass} onChangeText={setConfirmPass}
          placeholder="Confirm new password" placeholderTextColor={theme.textMuted} secureTextEntry returnKeyType="done" onSubmitEditing={changePass} />
        <TouchableOpacity style={[s.btn, { backgroundColor: theme.purple }]} onPress={changePass} disabled={saving}>
          <Text style={s.btnText}>Change Password</Text>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={s.section}>
        <View style={s.sectionHead}><Info color={theme.textMuted} size={18} /><Text style={s.sectionTitle}>About</Text></View>
        {[['App', 'LE-SOFT Staff'], ['Version', '1.1.6']].map(([k, v]) => (
          <View key={k} style={s.infoRow}>
            <Text style={s.infoKey}>{k}</Text><Text style={s.infoVal}>{v}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={[s.logoutBtn, { backgroundColor: theme.dangerLight, borderColor: theme.danger + '66' }]} onPress={logout}>
        <LogOut color={theme.danger} size={18} />
        <Text style={[s.logoutText, { color: theme.danger }]}>Logout</Text>
      </TouchableOpacity>
    </KeyboardAwareContainer>
  );
}

const makeStyles = (t: any) => StyleSheet.create({
  header: { padding: 16, paddingTop: 20 },
  title: { color: t.textPrimary, fontSize: 22, fontWeight: '800' },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgCard, borderRadius: 18, margin: 16, padding: 16, borderWidth: 1, borderColor: t.border, gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  profileName: { color: t.textPrimary, fontSize: 16, fontWeight: '700' },
  profileRole: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  profileUser: { color: t.textMuted, fontSize: 13, marginTop: 2 },
  section: { backgroundColor: t.bgCard, borderRadius: 18, marginHorizontal: 16, marginBottom: 14, padding: 16, borderWidth: 1, borderColor: t.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { color: t.textPrimary, fontSize: 15, fontWeight: '700' },
  themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  themeLabel: { color: t.textSecondary, fontSize: 15 },
  toggle: { width: 52, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 },
  toggleDotOn: { alignSelf: 'flex-end' },
  input: { backgroundColor: t.bgInput, borderRadius: 12, padding: 12, color: t.textPrimary, borderWidth: 1, borderColor: t.border, fontSize: 15 },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { backgroundColor: t.bgInput, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: t.border },
  btn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border },
  infoKey: { color: t.textMuted, fontSize: 14 },
  infoVal: { color: t.textPrimary, fontWeight: '600', fontSize: 14 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginHorizontal: 16, borderRadius: 16, paddingVertical: 14, borderWidth: 1 },
  logoutText: { fontWeight: '800', fontSize: 16 },
});
