import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';
import { Clock, CheckCircle, LogIn, LogOut } from 'lucide-react-native';

export default function AttendanceScreen() {
  const { theme } = useTheme();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single();
    if (!profile) return;
    const { data: emp } = await supabase.from('hrm_employees').select('id').eq('user_id', profile.id).maybeSingle();
    if (!emp) return;
    setEmployeeId(emp.id);
    const today = new Date().toISOString().split('T')[0];
    const { data: rec } = await supabase.from('hrm_attendance').select('*').eq('employee_id', emp.id).eq('date', today).maybeSingle();
    setTodayRecord(rec);
    const { data: hist } = await supabase.from('hrm_attendance').select('*').eq('employee_id', emp.id).order('date', { ascending: false }).limit(14);
    setHistory(hist || []);
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, []);

  const checkIn = async () => {
    if (!employeeId) return Alert.alert('Error', 'Employee profile not found.');
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toTimeString().slice(0, 8);
    const { error } = await supabase.from('hrm_attendance').upsert({ employee_id: employeeId, date: today, check_in: now, status: 'Present' }, { onConflict: 'employee_id,date' });
    setLoading(false);
    if (error) Alert.alert('Error', error.message); else { Alert.alert('✅ Checked In', `at ${now.slice(0,5)}`); fetchData(); }
  };

  const checkOut = async () => {
    if (!todayRecord) return;
    setLoading(true);
    const now = new Date().toTimeString().slice(0, 8);
    const { error } = await supabase.from('hrm_attendance').update({ check_out: now }).eq('id', todayRecord.id);
    setLoading(false);
    if (error) Alert.alert('Error', error.message); else { Alert.alert('✅ Checked Out', `at ${now.slice(0,5)}`); fetchData(); }
  };

  const statusColor = (st: string) => ({ Present: theme.success, Late: theme.warning, Absent: theme.danger, Leave: theme.purple }[st] || theme.textMuted);
  const s = makeStyles(theme);

  return (
    <KeyboardAwareContainer refreshing={refreshing} onRefresh={onRefresh}>
      <View style={s.header}>
        <Text style={s.title}>Attendance</Text>
        <Text style={s.date}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })}</Text>
      </View>

      <View style={s.card}>
        <View style={s.todayRow}>
          <View>
            <Text style={s.todayLabel}>Today's Status</Text>
            <Text style={[s.todayStatus, { color: statusColor(todayRecord?.status || '') }]}>
              {todayRecord?.status || 'Not Recorded'}
            </Text>
          </View>
          <Clock color={theme.accent} size={32} />
        </View>
        <View style={s.timeRow}>
          <View style={s.timeBox}>
            <Text style={s.timeLabel}>Check In</Text>
            <Text style={s.timeValue}>{todayRecord?.check_in?.slice(0, 5) || '--:--'}</Text>
          </View>
          <View style={s.timeBox}>
            <Text style={s.timeLabel}>Check Out</Text>
            <Text style={s.timeValue}>{todayRecord?.check_out?.slice(0, 5) || '--:--'}</Text>
          </View>
        </View>

        {!todayRecord?.check_in ? (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: theme.success }]} onPress={checkIn} disabled={loading}>
            <LogIn color="#fff" size={18} /><Text style={s.actionBtnText}>Check In Now</Text>
          </TouchableOpacity>
        ) : !todayRecord?.check_out ? (
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: theme.danger }]} onPress={checkOut} disabled={loading}>
            <LogOut color="#fff" size={18} /><Text style={s.actionBtnText}>Check Out</Text>
          </TouchableOpacity>
        ) : (
          <View style={[s.actionBtn, { backgroundColor: theme.successLight }]}>
            <CheckCircle color={theme.success} size={18} />
            <Text style={[s.actionBtnText, { color: theme.success }]}>Day Complete</Text>
          </View>
        )}
      </View>

      <Text style={s.sectionTitle}>Recent · 14 Days</Text>
      {history.map((r, i) => (
        <View key={i} style={s.histRow}>
          <Text style={s.histDate}>{r.date}</Text>
          <Text style={[s.histStatus, { color: statusColor(r.status) }]}>{r.status}</Text>
          <Text style={s.histTime}>{r.check_in?.slice(0,5) || '--'} → {r.check_out?.slice(0,5) || '--'}</Text>
        </View>
      ))}
    </KeyboardAwareContainer>
  );
}

const makeStyles = (t: any) => StyleSheet.create({
  header: { padding: 16, paddingTop: 20 },
  title: { color: t.textPrimary, fontSize: 22, fontWeight: '800' },
  date: { color: t.textMuted, fontSize: 13, marginTop: 2 },
  card: { backgroundColor: t.bgCard, borderRadius: 20, margin: 16, padding: 18, borderWidth: 1, borderColor: t.border },
  todayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  todayLabel: { color: t.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  todayStatus: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  timeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  timeBox: { flex: 1, backgroundColor: t.bgElevated, borderRadius: 12, padding: 12, alignItems: 'center' },
  timeLabel: { color: t.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  timeValue: { color: t.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  sectionTitle: { color: t.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border },
  histDate: { color: t.textSecondary, fontSize: 13, flex: 1 },
  histStatus: { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'center' },
  histTime: { color: t.textMuted, fontSize: 12, flex: 1, textAlign: 'right' },
});
