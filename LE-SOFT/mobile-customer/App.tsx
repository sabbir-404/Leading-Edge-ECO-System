import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Store, ShoppingCart, ListOrdered, User } from 'lucide-react-native';

import { supabase } from './lib/supabase';
import AuthScreen from './screens/AuthScreen';
import StorefrontScreen from './screens/StorefrontScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const [session, setSession] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen onAuth={() => setSession(true)} />;
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#ffffff',
            borderTopColor: '#e5e7eb',
            paddingBottom: 5,
            paddingTop: 5,
            height: 60,
          },
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#9ca3af',
        }}
      >
        <Tab.Screen 
          name="Shop" 
          component={StorefrontScreen} 
          options={{ tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }}
        />
        <Tab.Screen 
          name="Cart" 
          component={StorefrontScreen} 
          options={{ tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} /> }}
        />
        <Tab.Screen 
          name="Orders" 
          component={StorefrontScreen} 
          options={{ tabBarIcon: ({ color, size }) => <ListOrdered color={color} size={size} /> }}
        />
        <Tab.Screen 
          name="Profile" 
          component={StorefrontScreen} 
          options={{ tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
