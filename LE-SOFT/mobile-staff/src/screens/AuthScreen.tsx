import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Lock, User } from 'lucide-react-native';

export default function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please enter email and password');
    setLoading(true);

    const emailToUse = email.includes('@') ? email.trim() : `${email.trim()}@lesoft.local`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Login Failed', error.message);
    } else if (data.user) {
      // Verify they are active in the users table
      const { data: userRow } = await supabase.from('users').select('is_active').eq('auth_id', data.user.id).single();
      if (!userRow || userRow.is_active === 0) {
        await supabase.auth.signOut();
        Alert.alert('Access Denied', 'Your account is disabled or missing.');
      } else {
        onAuth();
      }
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-center px-6"
      >
        <View className="items-center mb-12">
          {/* We will rely on Lucide generic icon here or import the actual logo later */}
          <Text className="text-white text-3xl font-bold mt-4 tracking-wider">LE<Text className="text-blue-500">SOFT</Text></Text>
          <Text className="text-gray-400 mt-2">Internal Staff Portal</Text>
        </View>

        <View className="space-y-4">
          <View className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex-row items-center">
            <User size={20} color="#6b7280" />
            <TextInput 
              className="flex-1 text-white ml-3 text-base"
              placeholder="Username or Email"
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex-row items-center">
            <Lock size={20} color="#6b7280" />
            <TextInput 
              className="flex-1 text-white ml-3 text-base"
              placeholder="Password"
              placeholderTextColor="#6b7280"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </View>

        <TouchableOpacity 
          className={`bg-blue-600 rounded-xl py-4 items-center mt-8 ${loading ? 'opacity-70' : ''}`}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-lg">Sign In</Text>
          )}
        </TouchableOpacity>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
