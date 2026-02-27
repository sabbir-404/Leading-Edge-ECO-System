import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, SafeAreaView, Image } from 'react-native';
import { supabase } from '../lib/supabase';
import { ShoppingBag, ChevronRight, LogOut } from 'lucide-react-native';

export default function StorefrontScreen() {
  const [user, setUser] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
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

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView 
        className="flex-1 px-6 pt-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
      >
        <View className="flex-row justify-between items-center mb-8">
          <View>
            <Text className="text-gray-500 text-sm font-medium">Deliver to</Text>
            <Text className="text-black text-lg font-bold flex-row items-center">
              Dhaka, Bangladesh <ChevronRight size={16} color="#000" />
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout} className="p-2 bg-gray-50 rounded-full border border-gray-100">
            <LogOut color="#ef4444" size={20} />
          </TouchableOpacity>
        </View>

        <View className="bg-blue-600 p-6 rounded-3xl mb-8 relative overflow-hidden shadow-sm">
          <View className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500 rounded-full opacity-50"></View>
          <View className="absolute -left-10 -bottom-10 w-24 h-24 bg-blue-700 rounded-full opacity-50"></View>
          
          <Text className="text-white text-3xl font-black tracking-tight mb-2 z-10">Summer Sale</Text>
          <Text className="text-blue-100 mb-6 z-10 font-medium">Up to 50% off on premium corporate gifts and diaries.</Text>
          <TouchableOpacity className="bg-white px-6 py-3 rounded-xl self-start z-10 shadow-sm">
            <Text className="text-blue-600 font-bold">Shop Now</Text>
          </TouchableOpacity>
        </View>
        
        <View className="flex-row justify-between items-end mb-4">
          <Text className="text-black text-xl font-bold">New Arrivals</Text>
          <TouchableOpacity><Text className="text-blue-600 font-semibold">See All</Text></TouchableOpacity>
        </View>
        
        <View className="flex-row flex-wrap justify-between">
          {[1, 2, 3, 4].map((item, index) => (
            <TouchableOpacity 
              key={index} 
              className="w-[47%] bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-4"
            >
              <View className="h-32 bg-gray-200 rounded-xl mb-3 items-center justify-center">
                <ShoppingBag color="#9ca3af" size={32} />
              </View>
              <Text className="text-black font-semibold text-base mb-1" numberOfLines={1}>Premium Item {item}</Text>
              <Text className="text-blue-600 font-bold">৳ 1,250</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <View className="h-10"></View>
      </ScrollView>
    </SafeAreaView>
  );
}
