import 'react-native-gesture-handler';
import React from 'react';
import './global.css';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, TouchableOpacity, Text, Image, useWindowDimensions } from 'react-native';
import { Home, CreditCard, Users, Truck, Briefcase, Settings as SettingsIcon, Menu, LayoutGrid, Receipt, MessageSquare, Package, User as UserIcon, FileText } from 'lucide-react-native';
import { ThemeProvider, useTheme } from './src/lib/ThemeContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList, DrawerItem } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Billing
import BillingScreen from './src/screens/billing/BillingScreen';
import BillHistoryScreen from './src/screens/billing/BillHistoryScreen';

// HRM
import HRMScreen from './src/screens/hrm/HRMScreen';
import AttendanceScreen from './src/screens/hrm/AttendanceScreen';
import LeavesScreen from './src/screens/hrm/LeavesScreen';
import PayrollScreen from './src/screens/hrm/PayrollScreen';

// Accounting
import AccountingScreen from './src/screens/accounting/AccountingScreen';
import VoucherEntryScreen from './src/screens/accounting/VoucherEntryScreen';
import VoucherListScreen from './src/screens/accounting/VoucherListScreen';

// More Modules
import StockSearchScreen from './src/screens/stock/StockSearchScreen';
import MakeScreen from './src/screens/make/MakeScreen';
import ShippingScreen from './src/screens/shipping/ShippingScreen';
import ReportsScreen from './src/screens/reports/ReportsScreen';
import UsersScreen from './src/screens/users/UsersScreen';

// CRM
import CRMDirectoryScreen from './src/screens/crm/CRMDirectoryScreen';
import CustomerLedgerScreen from './src/screens/crm/CustomerLedgerScreen';

// Quotation
import QuotationListScreen from './src/screens/quotation/QuotationListScreen';
import QuotationCreateScreen from './src/screens/quotation/QuotationCreateScreen';

// Chat
import ChatListScreen from './src/screens/chat/ChatListScreen';
import ChatRoomScreen from './src/screens/chat/ChatRoomScreen';

const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();
const BillingStack = createNativeStackNavigator();
const HRMStack = createNativeStackNavigator();
const MakeStack = createNativeStackNavigator();
const ShippingStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();
const ChatStack = createNativeStackNavigator();

// Additional Modules for Drawer
const AccountingStack = createNativeStackNavigator();
const MoreStack = createNativeStackNavigator();

function AccountingStackNav() {
  const { theme } = useTheme();
  return (
    <AccountingStack.Navigator screenOptions={{ animation: 'fade', headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' }, headerShadowVisible: false }}>
      <AccountingStack.Screen name="AccountingMain" component={AccountingScreen} options={{ headerShown: false }} />
      <AccountingStack.Screen name="VoucherEntry" component={VoucherEntryScreen} options={({ route }: any) => ({ title: `${route.params?.type || 'Voucher'} Entry` })} />
      <AccountingStack.Screen name="VoucherList" component={VoucherListScreen} options={{ title: 'Voucher History' }} />
    </AccountingStack.Navigator>
  );
}

function CustomDrawerContent(props: any) {
  const { theme } = useTheme();
  const sessionUser = props.session?.user;
  const dbUser = props.dbUser;

  return (
    <DrawerContentScrollView {...props} style={{ backgroundColor: theme.bgCard }}>
      <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border, marginBottom: 10 }}>
        
        {/* LE-SOFT Logo */}
        <Image 
          source={theme.isDark ? require('./assets/logo-white.png') : require('./assets/logo-black.png')}
          style={{ width: 140, height: 40, resizeMode: 'contain', marginBottom: 20 }}
        />

        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: theme.accent + '33', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <UserIcon color={theme.accent} size={30} />
        </View>
        <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '800' }}>{dbUser?.full_name || 'Staff Member'}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>{sessionUser?.email || 'No email'}</Text>
        <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '700', marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{dbUser?.role || 'STAFF'}</Text>
      </View>
      
      <DrawerItem label="Dashboard" icon={({ color, size }) => <Home color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'HomeTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="Billing" icon={({ color, size }) => <CreditCard color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'BillingTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="HRM" icon={({ color, size }) => <Users color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'HRMTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="Production" icon={({ color, size }) => <Briefcase color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'MakeTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="Shipping" icon={({ color, size }) => <Truck color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'ShippingTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      
      <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 10 }} />
      
      <DrawerItem label="Accounting" icon={({ color, size }) => <Receipt color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'AccountingTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="CRM Directory" icon={({ color, size }) => <Users color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'CRMTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="Quotations" icon={({ color, size }) => <FileText color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'QuotationsTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="Stock Search" icon={({ color, size }) => <Package color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'StockTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="Messages" icon={({ color, size }) => <MessageSquare color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'ChatTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="Manage Users" icon={({ color, size }) => <SettingsIcon color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'UsersTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      <DrawerItem label="Settings" icon={({ color, size }) => <SettingsIcon color={color} size={size} />} onPress={() => props.navigation.navigate('MainTabs', { screen: 'SettingsTab' })} inactiveTintColor={theme.textPrimary} labelStyle={{ fontWeight: '700', fontSize: 15, marginLeft: -10 }} />
      
    </DrawerContentScrollView>
  );
}

function MainTabNavigator() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: theme.tabBar, 
          borderTopColor: theme.tabBarBorder, 
          borderTopWidth: 1, 
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6, 
          height: insets.bottom > 0 ? 60 + insets.bottom : 60 
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
      }}
    >
      <Tab.Screen name="HomeTab" component={DashboardScreen} options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tab.Screen name="BillingTab" component={BillingStackNav} options={{ title: 'Billing', tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} /> }} />
      <Tab.Screen name="HRMTab" component={HRMStackNav} options={{ title: 'HRM', tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tab.Screen name="MakeTab" component={MakeStackNav} options={{ title: 'MAKE', tabBarIcon: ({ color, size }) => <Briefcase color={color} size={size} /> }} />
      <Tab.Screen name="ShippingTab" component={ShippingStackNav} options={{ title: 'Shipping', tabBarIcon: ({ color, size }) => <Truck color={color} size={size} /> }} />
      <Tab.Screen name="SettingsTab" component={SettingsStackNav} options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} /> }} />
      
      {/* Hidden tabs so bottom bar is persistent across all nested app routes */}
      <Tab.Screen name="AccountingTab" component={AccountingStackNav} options={{ tabBarButton: () => null, title: 'Accounting' }} />
      <Tab.Screen name="CRMTab" component={CRMDirectoryScreen} options={{ tabBarButton: () => null, title: 'CRM Directory' }} />
      <Tab.Screen name="QuotationsTab" component={QuotationListScreen} options={{ tabBarButton: () => null, title: 'Quotations' }} />
      <Tab.Screen name="StockTab" component={StockSearchScreen} options={{ tabBarButton: () => null, title: 'Stock' }} />
      <Tab.Screen name="ChatTab" component={ChatStackNav} options={{ tabBarButton: () => null, title: 'Chat' }} />
      <Tab.Screen name="UsersTab" component={UsersScreen} options={{ tabBarButton: () => null, title: 'Users' }} />
    </Tab.Navigator>
  );
}

function BillingStackNav() {
  const { theme } = useTheme();
  return (
    <BillingStack.Navigator screenOptions={{ animation: 'fade', headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' } }}>
      <BillingStack.Screen name="BillingMain" component={BillingScreen} options={{ headerShown: false }} />
      <BillingStack.Screen name="BillHistory" component={BillHistoryScreen} options={{ title: 'Bill History' }} />
    </BillingStack.Navigator>
  );
}

function HRMStackNav() {
  const { theme } = useTheme();
  return (
    <HRMStack.Navigator screenOptions={{ animation: 'fade', headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' } }}>
      <HRMStack.Screen name="HRMHome" component={HRMScreen} options={{ headerShown: false }} />
      <HRMStack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <HRMStack.Screen name="Leaves" component={LeavesScreen} options={{ title: 'Leave Requests' }} />
      <HRMStack.Screen name="Payroll" component={PayrollScreen} options={{ title: 'My Payroll' }} />
    </HRMStack.Navigator>
  );
}

function MakeStackNav() {
  const { theme } = useTheme();
  return (
    <MakeStack.Navigator screenOptions={{ animation: 'fade', headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' } }}>
      <MakeStack.Screen name="MakeMain" component={MakeScreen} options={{ title: 'Make / Production' }} />
    </MakeStack.Navigator>
  );
}

function ShippingStackNav() {
  const { theme } = useTheme();
  return (
    <ShippingStack.Navigator screenOptions={{ animation: 'fade', headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' } }}>
      <ShippingStack.Screen name="ShippingMain" component={ShippingScreen} options={{ title: 'Shipping' }} />
    </ShippingStack.Navigator>
  );
}

function SettingsStackNav() {
  const { theme } = useTheme();
  return (
    <SettingsStack.Navigator screenOptions={{ animation: 'fade', headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' } }}>
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} options={{ title: 'Settings' }} />
    </SettingsStack.Navigator>
  );
}

function ChatStackNav() {
  const { theme } = useTheme();
  return (
    <ChatStack.Navigator screenOptions={{ animation: 'fade', headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' }, headerShadowVisible: false }}>
      <ChatStack.Screen name="ChatListMain" component={ChatListScreen} options={{ headerShown: false }} />
      <ChatStack.Screen name="ChatRoom" component={ChatRoomScreen} options={{ headerShown: false }} />
    </ChatStack.Navigator>
  );
}



export default function App() {
  const [session, setSession] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner session={session} loading={loading} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppInner({ session, loading }: { session: any; loading: boolean }) {
  const { theme, isDark } = useTheme();
  const [dbUser, setDbUser] = React.useState<any>(null);
  const { width } = useWindowDimensions();

  React.useEffect(() => {
    if (session?.user) {
      supabase.from('users').select('*').eq('auth_id', session.user.id).single()
        .then(({ data }) => setDbUser(data));
    }
  }, [session]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!session) return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AuthScreen onAuth={() => {}} />
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <NavigationContainer>
          <Drawer.Navigator
            drawerContent={(props) => <CustomDrawerContent {...props} session={session} dbUser={dbUser} />}
            screenOptions={{
              headerShown: false,
              drawerType: width >= 768 ? 'permanent' : 'front',
              drawerStyle: { backgroundColor: theme.bgCard, width: 280 },
              drawerActiveBackgroundColor: theme.accent + '22',
              drawerActiveTintColor: theme.accent,
              drawerInactiveTintColor: theme.textPrimary,
            }}
          >
            <Drawer.Screen 
              name="MainTabs" 
              component={MainTabNavigator} 
            />
          </Drawer.Navigator>
        </NavigationContainer>
      </View>
    </GestureHandlerRootView>
  );
}
