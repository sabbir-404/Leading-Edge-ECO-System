import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, SafeAreaView } from 'react-native';
import { supabase } from '../lib/supabase';
import { CreditCard, Users, Search, Truck, LogOut, Briefcase } from 'lucide-react-native';

export default function DashboardScreen() {
  const [user, setUser] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('users').select('*').eq('auth_id', user.id).single();
      setUser(profile);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUser();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const menuItems = [
    { title: 'Billing / POS', icon: <CreditCard color="#3b82f6" size={32} />, bg: 'bg-blue-900/30' },
    { title: 'HRM Actions', icon: <Users color="#10b981" size={32} />, bg: 'bg-emerald-900/30' },
    { title: 'Stock Search', icon: <Search color="#f59e0b" size={32} />, bg: 'bg-amber-900/30' },
    { title: 'Make / Track', icon: <Briefcase color="#8b5cf6" size={32} />, bg: 'bg-purple-900/30' },
    { title: 'Shipping', icon: <Truck color="#ef4444" size={32} />, bg: 'bg-red-900/30' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView 
        className="flex-1 px-6 pt-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <Text className="text-gray-400 text-lg">Good Morning,</Text>
            <Text className="text-white text-3xl font-bold">{user?.full_name || 'Staff'}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} className="p-2 bg-gray-900 rounded-full border border-gray-800">
            <LogOut color="#ef4444" size={20} />
          </TouchableOpacity>
        </View>

        <View className="bg-gray-900 border border-gray-800 p-5 rounded-2xl mb-8">
          <Text className="text-gray-400 text-base mb-2">Today's Sales</Text>
          <Text className="text-white text-4xl font-black">৳0</Text>
          <Text className="text-emerald-500 mt-2 font-semibold">+0.0% vs yesterday</Text>
        </View>
        
        <Text className="text-white text-xl font-bold mb-4">Quick Actions</Text>
        
        <View className="flex-row flex-wrap justify-between">
          {menuItems.map((item, index) => (
            <TouchableOpacity 
              key={index} 
              className="w-[48%] bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4 items-center justify-center"
            >
              <View className={`p-4 rounded-full mb-3 ${item.bg}`}>
                {item.icon}
              </View>
              <Text className="text-white font-semibold text-base">{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <View className="h-10"></View>
      </ScrollView>
    </SafeAreaView>
  );
}
