import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import { StatusBar } from 'expo-status-bar';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator 
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0f172a' }
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        {/* <Stack.Screen name="Catalog" component={CatalogScreen} /> */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
