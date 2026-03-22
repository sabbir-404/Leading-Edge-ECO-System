import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { Receipt, CreditCard, BookOpen, List as ListIcon } from 'lucide-react-native';

export default function AccountingScreen({ navigation }: any) {
  const { theme } = useTheme();

  const MENU_ITEMS = [
    {
      title: 'Vouchers',
      items: [
        { label: 'Receipt Voucher', icon: <Receipt color={theme.success} size={24} />, screen: 'VoucherEntry', params: { type: 'Receipt' }, bg: theme.successLight },
        { label: 'Payment Voucher', icon: <CreditCard color={theme.danger} size={24} />, screen: 'VoucherEntry', params: { type: 'Payment' }, bg: theme.dangerLight },
        { label: 'Journal Voucher', icon: <BookOpen color={theme.purple} size={24} />, screen: 'VoucherEntry', params: { type: 'Journal' }, bg: theme.purpleLight },
        { label: 'All Vouchers', icon: <ListIcon color={theme.accent} size={24} />, screen: 'VoucherList', bg: theme.accentLight },
      ]
    }
  ];

  const s = makeStyles(theme);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Text style={s.title}>Accounting</Text>
        <Text style={s.subtitle}>Financial Records & Vouchers</Text>
      </View>

      {MENU_ITEMS.map((section, idx) => (
        <View key={idx} style={s.section}>
          <Text style={s.sectionTitle}>{section.title}</Text>
          <View style={s.grid}>
            {section.items.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={s.card}
                onPress={() => navigation.navigate(item.screen, item.params)}
              >
                <View style={[s.iconBox, { backgroundColor: item.bg }]}>
                  {item.icon}
                </View>
                <Text style={s.cardLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (t: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  content: { padding: 20 },
  header: { marginBottom: 24, paddingTop: 10 },
  title: { color: t.textPrimary, fontSize: 26, fontWeight: '900' },
  subtitle: { color: t.textMuted, fontSize: 14, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { color: t.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '48%',
    backgroundColor: t.bgCard,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: t.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  cardLabel: { color: t.textPrimary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
