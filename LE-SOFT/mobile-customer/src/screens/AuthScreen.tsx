import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { Mail, Lock } from 'lucide-react-native';

export default function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please enter email and password');
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) Alert.alert('Sign Up Failed', error.message);
      else {
        Alert.alert('Success', 'Check your email to confirm your account.');
        setIsSignUp(false);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
         Alert.alert('Login Failed', error.message);
      } else if (data.user) {
         onAuth();
      }
    }
    setLoading(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-center px-6">
        
        <View className="items-center mb-12">
          <Text className="text-black text-4xl font-black mt-4 tracking-tighter">LE<Text className="text-blue-600">STORE</Text></Text>
          <Text className="text-gray-500 mt-2 font-medium">Welcome to Leading Edge</Text>
        </View>

        <View className="space-y-4">
          <View className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex-row items-center">
            <Mail size={20} color="#9ca3af" />
            <TextInput 
              className="flex-1 text-black ml-3 text-base"
              placeholder="Email Address"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex-row items-center">
            <Lock size={20} color="#9ca3af" />
            <TextInput 
              className="flex-1 text-black ml-3 text-base"
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </View>

        <TouchableOpacity 
          className={`bg-blue-600 rounded-xl py-4 items-center mt-8 shadow-sm ${loading ? 'opacity-70' : ''}`}
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-lg">{isSignUp ? 'Create Account' : 'Sign In'}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} className="mt-6 items-center">
          <Text className="text-blue-600 font-medium">
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
