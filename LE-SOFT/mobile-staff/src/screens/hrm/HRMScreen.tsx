import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Clock, FileText, DollarSign, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';

export default function HRMScreen({ navigation }: any) {
  const { theme } = useTheme();
  const actions = [
    { title: 'Attendance', subtitle: 'Check in & out, view history', icon: <Clock color={theme.accent} size={24} />, bg: theme.accentLight, screen: 'Attendance' },
    { title: 'Leave Requests', subtitle: 'Apply for and track leaves', icon: <FileText color={theme.purple} size={24} />, bg: theme.purpleLight, screen: 'Leaves' },
    { title: 'My Payroll', subtitle: 'View salary and payslips', icon: <DollarSign color={theme.success} size={24} />, bg: theme.successLight, screen: 'Payroll' },
  ];

  const s = makeStyles(theme);
  return (
    <KeyboardAwareContainer>
      <View style={s.header}>
        <Text style={s.title}>HRM</Text>
        <Text style={s.subtitle}>Human Resource Management</Text>
      </View>
      <View style={s.list}>
        {actions.map((a, i) => (
          <TouchableOpacity key={i} style={s.card} onPress={() => navigation.navigate(a.screen)}>
            <View style={[s.iconBox, { backgroundColor: a.bg }]}>{a.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{a.title}</Text>
              <Text style={s.cardSub}>{a.subtitle}</Text>
            </View>
            <ChevronRight color={theme.textMuted} size={20} />
          </TouchableOpacity>
        ))}
      </View>
    </KeyboardAwareContainer>
  );
}

const makeStyles = (t: any) => StyleSheet.create({
  header: { padding: 16, paddingTop: 20, marginBottom: 8 },
  title: { color: t.textPrimary, fontSize: 26, fontWeight: '800' },
  subtitle: { color: t.textMuted, fontSize: 13, marginTop: 2 },
  list: { paddingHorizontal: 16, gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: t.border, gap: 14 },
  iconBox: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: t.textPrimary, fontWeight: '700', fontSize: 16 },
  cardSub: { color: t.textMuted, fontSize: 13, marginTop: 2 },
});
