import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform, KeyboardAvoidingView, SafeAreaView, StyleSheet, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
      const { data: userRow } = await supabase.from('users').select('*, user_groups(name, permissions)').eq('auth_id', data.user.id).single();
      if (!userRow || !userRow.is_active) {
        await supabase.auth.signOut();
        Alert.alert('Access Denied', 'Your account is disabled or missing.');
      } else {
        // Save user info for chat and other modules
        await AsyncStorage.setItem('user_profile', JSON.stringify(userRow));
        onAuth(); 
      }
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
          <Image 
            source={isDark ? require('../../assets/logo-white.png') : require('../../assets/logo-black.png')} 
            style={s.logoImg} 
            resizeMode="contain"
          />
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
  themeBtn: { position: 'absolute', top: 24, right: 24, padding: 12, backgroundColor: theme.bgCard, borderRadius: 14, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  logo: { alignItems: 'center', marginBottom: 40 },
  logoImg: { width: 180, height: 60, marginBottom: 16 },
  tagline: { color: theme.textSecondary, fontSize: 13, marginTop: 6, fontWeight: '700', letterSpacing: 0.8 },
  card: { backgroundColor: theme.bgCard, borderRadius: 28, padding: 32, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  cardTitle: { color: theme.textPrimary, fontSize: 24, fontWeight: '900', marginBottom: 28, textAlign: 'center' },
  inputGroup: { marginBottom: 20 },
  label: { color: theme.textSecondary, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 2, borderWidth: 1.5, borderColor: theme.border, gap: 12, minHeight: 50 },
  input: { flex: 1, color: theme.textPrimary, fontSize: 16, paddingVertical: 14, fontWeight: '500' },
  btn: { backgroundColor: theme.accent, borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginTop: 16, shadowColor: theme.accent, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
});
