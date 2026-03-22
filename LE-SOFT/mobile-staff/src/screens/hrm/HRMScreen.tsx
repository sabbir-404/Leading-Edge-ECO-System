import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Clock, FileText, DollarSign, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useResponsive } from '../../lib/responsive';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HRMScreen({ navigation }: any) {
  const { theme } = useTheme();
  const ui = useResponsive();
  const actions = [
    { title: 'Attendance', subtitle: 'Check in & out, view history', icon: <Clock color={theme.accent} size={ui.icon(24)} />, bg: theme.accentLight, screen: 'Attendance' },
    { title: 'Leave Requests', subtitle: 'Apply for and track leaves', icon: <FileText color={theme.purple} size={ui.icon(24)} />, bg: theme.purpleLight, screen: 'Leaves' },
    { title: 'My Payroll', subtitle: 'View salary and payslips', icon: <DollarSign color={theme.success} size={ui.icon(24)} />, bg: theme.successLight, screen: 'Payroll' },
  ];

  const s = makeStyles(theme, ui);
  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
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
              <ChevronRight color={theme.textMuted} size={ui.icon(20)} />
            </TouchableOpacity>
          ))}
        </View>
      </KeyboardAwareContainer>
    </SafeAreaView>
  );
}

const makeStyles = (t: any, ui: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: ui.contentPadding, paddingTop: ui.spacing(10), paddingBottom: ui.spacing(8), marginBottom: ui.spacing(8) },
  title: { color: t.textPrimary, fontSize: ui.font(26, 22, 32), fontWeight: '800' },
  subtitle: { color: t.textMuted, fontSize: ui.font(13), marginTop: ui.spacing(2) },
  list: { paddingHorizontal: ui.contentPadding, gap: ui.spacing(12) },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgCard, borderRadius: ui.radius(16), padding: ui.cardPadding, minHeight: ui.scale(78), borderWidth: 1, borderColor: t.border, gap: ui.spacing(14) },
  iconBox: { width: ui.scale(50), height: ui.scale(50), borderRadius: ui.radius(14), alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: t.textPrimary, fontWeight: '700', fontSize: ui.font(16) },
  cardSub: { color: t.textMuted, fontSize: ui.font(13), marginTop: ui.spacing(2) },
});
