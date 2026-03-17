import React from 'react';
import './global.css';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { Home, CreditCard, Users, LayoutGrid, Receipt } from 'lucide-react-native';
import { ThemeProvider, useTheme } from './src/lib/ThemeContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

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

const Tab = createBottomTabNavigator();
const BillingStack = createNativeStackNavigator();
const HRMStack = createNativeStackNavigator();
const AccountingStack = createNativeStackNavigator();
const MoreStack = createNativeStackNavigator();

function BillingStackNav() {
  const { theme } = useTheme();
  return (
    <BillingStack.Navigator screenOptions={{ headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' } }}>
      <BillingStack.Screen name="BillingMain" component={BillingScreen} options={{ headerShown: false }} />
      <BillingStack.Screen name="BillHistory" component={BillHistoryScreen} options={{ title: 'Bill History' }} />
    </BillingStack.Navigator>
  );
}

function HRMStackNav() {
  const { theme } = useTheme();
  return (
    <HRMStack.Navigator screenOptions={{ headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' } }}>
      <HRMStack.Screen name="HRMHome" component={HRMScreen} options={{ headerShown: false }} />
      <HRMStack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <HRMStack.Screen name="Leaves" component={LeavesScreen} options={{ title: 'Leave Requests' }} />
      <HRMStack.Screen name="Payroll" component={PayrollScreen} options={{ title: 'My Payroll' }} />
    </HRMStack.Navigator>
  );
}

function AccountingStackNav() {
  const { theme } = useTheme();
  return (
    <AccountingStack.Navigator screenOptions={{ headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' }, headerShadowVisible: false }}>
      <AccountingStack.Screen name="AccountingMain" component={AccountingScreen} options={{ headerShown: false }} />
      <AccountingStack.Screen name="VoucherEntry" component={VoucherEntryScreen} options={({ route }: any) => ({ title: `${route.params?.type || 'Voucher'} Entry` })} />
      <AccountingStack.Screen name="VoucherList" component={VoucherListScreen} options={{ title: 'Voucher History' }} />
    </AccountingStack.Navigator>
  );
}

function MoreStackNav() {
  const { theme } = useTheme();
  return (
    <MoreStack.Navigator screenOptions={{ headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.textPrimary, headerTitleStyle: { fontWeight: '800' } }}>
      <MoreStack.Screen name="MoreHome" component={MoreHomeScreen} options={{ title: 'More' }} />
      <MoreStack.Screen name="Stock" component={StockSearchScreen} options={{ title: 'Stock Search' }} />
      <MoreStack.Screen name="Make" component={MakeScreen} options={{ title: 'Make / Production' }} />
      <MoreStack.Screen name="CRM" component={CRMDirectoryScreen} options={{ title: 'CRM Directory' }} />
      <MoreStack.Screen name="CustomerLedger" component={CustomerLedgerScreen} options={({ route }: any) => ({ title: route.params?.customerName || 'Ledger' })} />
      <MoreStack.Screen name="Quotations" component={QuotationListScreen} options={{ title: 'Quotations' }} />
      <MoreStack.Screen name="QuotationCreate" component={QuotationCreateScreen} options={{ title: 'New Quotation' }} />
      <MoreStack.Screen name="Shipping" component={ShippingScreen} options={{ title: 'Shipping' }} />
      <MoreStack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
      <MoreStack.Screen name="Users" component={UsersScreen} options={{ title: 'User Management' }} />
      <MoreStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </MoreStack.Navigator>
  );
}

const moreItems = [
  { label: 'Stock Search', screen: 'Stock', color: '#f59e0b' },
  { label: 'Make / Track', screen: 'Make', color: '#8b5cf6' },
  { label: 'CRM Directory', screen: 'CRM', color: '#10b981' },
  { label: 'Quotations', screen: 'Quotations', color: '#3b82f6' },
  { label: 'Shipping', screen: 'Shipping', color: '#ef4444' },
  { label: 'Reports', screen: 'Reports', color: '#06b6d4' },
  { label: 'Users (Admin)', screen: 'Users', color: '#6366f1' },
  { label: 'Settings', screen: 'Settings', color: '#6b7280' },
];

function MoreHomeScreen({ navigation }: any) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
      {moreItems.map((item) => (
        <TouchableOpacity
          key={item.screen}
          onPress={() => navigation.navigate(item.screen)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: theme.bgCard, borderRadius: 14, padding: 16,
            marginBottom: 10, borderWidth: 1, borderColor: theme.border,
          }}
        >
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginRight: 14 }} />
          <Text style={{ color: theme.textPrimary, fontWeight: '600', fontSize: 15, flex: 1 }}>{item.label}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 18 }}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
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
  const insets = useSafeAreaInsets();

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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer>
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
          <Tab.Screen
            name="HomeTab"
            component={DashboardScreen}
            options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
          />
          <Tab.Screen
            name="BillingTab"
            component={BillingStackNav}
            options={{ title: 'Billing', tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} /> }}
          />
          <Tab.Screen
            name="AccountingTab"
            component={AccountingStackNav}
            options={{ title: 'Accounts', tabBarIcon: ({ color, size }) => <Receipt color={color} size={size} /> }}
          />
          <Tab.Screen
            name="HRMTab"
            component={HRMStackNav}
            options={{ title: 'HRM', tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
          />
          <Tab.Screen
            name="MoreTab"
            component={MoreStackNav}
            options={{ title: 'More', tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </View>
  );
}
