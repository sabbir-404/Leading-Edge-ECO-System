import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform, KeyboardAvoidingView, SafeAreaView, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/ThemeContext';
import { Lock, User, Sun, Moon } from 'lucide-react-native';

export default function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please enter username and password');
    setLoading(true);
    const emailToUse = email.includes('@') ? email.trim() : `${email.trim()}@lesoft.local`;
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailToUse, password });
    setLoading(false);
    if (error) return Alert.alert('Login Failed', error.message);
    if (data.user) {
      const { data: userRow } = await supabase.from('users').select('is_active').eq('auth_id', data.user.id).single();
      if (!userRow || !userRow.is_active) {
        await supabase.auth.signOut();
        Alert.alert('Access Denied', 'Your account is disabled or missing.');
      } else { onAuth(); }
    }
  };

  const s = makeStyles(theme);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
        {/* Theme Toggle */}
        <TouchableOpacity style={s.themeBtn} onPress={toggleTheme}>
          {isDark ? <Sun color={theme.warning} size={20} /> : <Moon color={theme.accent} size={20} />}
        </TouchableOpacity>

        <View style={s.logo}>
          <View style={s.logoIcon}>
            <Text style={s.logoText}>LE</Text>
          </View>
          <Text style={s.appName}>LE<Text style={{ color: theme.accent }}>SOFT</Text></Text>
          <Text style={s.tagline}>Internal Staff Portal</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Sign In</Text>

          <View style={s.inputGroup}>
            <Text style={s.label}>Username or Email</Text>
            <View style={s.inputRow}>
              <User color={theme.textMuted} size={18} />
              <TextInput
                style={s.input} value={email} onChangeText={setEmail}
                placeholder="Enter username..." placeholderTextColor={theme.textMuted}
                autoCapitalize="none" autoCorrect={false}
              />
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>Password</Text>
            <View style={s.inputRow}>
              <Lock color={theme.textMuted} size={18} />
              <TextInput
                style={s.input} value={password} onChangeText={setPassword}
                placeholder="Enter password..." placeholderTextColor={theme.textMuted}
                secureTextEntry returnKeyType="done" onSubmitEditing={handleLogin}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[s.btn, loading && { opacity: 0.7 }]}
            onPress={handleLogin} disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  kav: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  themeBtn: { position: 'absolute', top: 16, right: 0, padding: 10, backgroundColor: theme.bgCard, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  logo: { alignItems: 'center', marginBottom: 32 },
  logoIcon: { width: 72, height: 72, backgroundColor: theme.accent, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: theme.accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  logoText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  appName: { fontSize: 28, fontWeight: '900', color: theme.textPrimary, letterSpacing: 1 },
  tagline: { color: theme.textMuted, fontSize: 14, marginTop: 4 },
  card: { backgroundColor: theme.bgCard, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } },
  cardTitle: { color: theme.textPrimary, fontSize: 20, fontWeight: '800', marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  label: { color: theme.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: theme.border, gap: 10 },
  input: { flex: 1, color: theme.textPrimary, fontSize: 15, paddingVertical: 12 },
  btn: { backgroundColor: theme.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
