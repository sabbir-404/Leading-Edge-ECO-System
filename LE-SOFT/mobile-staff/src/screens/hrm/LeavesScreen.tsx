import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, Modal, StyleSheet, SafeAreaView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import KeyboardAwareContainer from '../../components/KeyboardAwareContainer';
import { Plus, X } from 'lucide-react-native';

export default function LeavesScreen() {
  const { theme } = useTheme();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ leave_type: 'Casual', from_date: '', to_date: '', reason: '' });

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single();
    const { data: emp } = await supabase.from('hrm_employees').select('id').eq('user_id', profile?.id).maybeSingle();
    if (emp) {
      setEmployeeId(emp.id);
      const { data } = await supabase.from('hrm_leaves').select('*').eq('employee_id', emp.id).order('created_at', { ascending: false });
      setLeaves(data || []);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, []);

  const handleSubmit = async () => {
    if (!form.from_date || !form.to_date) return Alert.alert('Error', 'Enter both dates');
    if (!employeeId) return Alert.alert('Error', 'Employee profile not found.');
    const { error } = await supabase.from('hrm_leaves').insert({ ...form, employee_id: employeeId, status: 'Pending' });
    if (error) return Alert.alert('Error', error.message);
    setShowModal(false);
    setForm({ leave_type: 'Casual', from_date: '', to_date: '', reason: '' });
    Alert.alert('✅ Submitted', 'Leave request pending approval.'); fetchData();
  };

  const statusColor = (st: string) => ({ Approved: theme.success, Rejected: theme.danger, Pending: theme.warning }[st] || theme.textMuted);
  const types = ['Casual', 'Sick', 'Annual', 'Maternity', 'Other'];
  const s = makeStyles(theme);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.listHeader}>
        <Text style={s.title}>Leave Requests</Text>
        <TouchableOpacity onPress={() => setShowModal(true)} style={[s.addBtn, { backgroundColor: theme.accent }]}>
          <Plus color="#fff" size={18} /><Text style={s.addBtnText}>Apply</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={leaves}
        keyExtractor={i => i.id.toString()}
        onRefresh={onRefresh} refreshing={refreshing}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={s.empty}>No leave requests yet.</Text>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.leaveType}>{item.leave_type} Leave</Text>
              <Text style={s.dates}>{item.from_date} → {item.to_date}</Text>
              {item.reason ? <Text style={s.reason}>{item.reason}</Text> : null}
            </View>
            <Text style={[s.status, { color: statusColor(item.status) }]}>{item.status}</Text>
          </View>
        )}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.overlay}>
          <KeyboardAwareContainer contentStyle={{ paddingHorizontal: 0 }}>
            <View style={[s.modal, { backgroundColor: theme.bgCard }]}>
              <View style={s.modalHead}>
                <Text style={s.modalTitle}>Apply for Leave</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}><X color={theme.textMuted} size={22} /></TouchableOpacity>
              </View>
              <Text style={s.fieldLabel}>Leave Type</Text>
              <View style={s.typesRow}>
                {types.map(t => (
                  <TouchableOpacity key={t} onPress={() => setForm(f => ({ ...f, leave_type: t }))}
                    style={[s.typeBtn, form.leave_type === t && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                    <Text style={[s.typeTxt, form.leave_type === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.fieldLabel}>From (YYYY-MM-DD)</Text>
              <TextInput style={[s.input, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
                value={form.from_date} onChangeText={t => setForm(f => ({ ...f, from_date: t }))}
                placeholder="2026-03-01" placeholderTextColor={theme.textMuted} keyboardType="numbers-and-punctuation" />
              <Text style={s.fieldLabel}>To (YYYY-MM-DD)</Text>
              <TextInput style={[s.input, { color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
                value={form.to_date} onChangeText={t => setForm(f => ({ ...f, to_date: t }))}
                placeholder="2026-03-03" placeholderTextColor={theme.textMuted} keyboardType="numbers-and-punctuation" />
              <Text style={s.fieldLabel}>Reason (optional)</Text>
              <TextInput style={[s.input, { height: 70, color: theme.textPrimary, backgroundColor: theme.bgInput, borderColor: theme.border }]}
                value={form.reason} onChangeText={t => setForm(f => ({ ...f, reason: t }))}
                placeholder="Reason..." placeholderTextColor={theme.textMuted} multiline />
              <View style={s.modalBtns}>
                <TouchableOpacity onPress={() => setShowModal(false)} style={[s.cancelBtn, { backgroundColor: theme.bgElevated }]}>
                  <Text style={[s.cancelTxt, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSubmit} style={[s.submitBtn, { backgroundColor: theme.success }]}>
                  <Text style={s.submitTxt}>Submit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAwareContainer>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (t: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.bg },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20 },
  title: { color: t.textPrimary, fontSize: 22, fontWeight: '800' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: t.border },
  leaveType: { color: t.textPrimary, fontWeight: '700', fontSize: 15 },
  dates: { color: t.textSecondary, fontSize: 13, marginTop: 2 },
  reason: { color: t.textMuted, fontSize: 12, marginTop: 4 },
  status: { fontWeight: '700', fontSize: 14, minWidth: 70, textAlign: 'right' },
  empty: { color: t.textMuted, textAlign: 'center', marginTop: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: t.textPrimary, fontSize: 20, fontWeight: '800' },
  fieldLabel: { color: t.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: { borderRadius: 12, padding: 12, fontSize: 14, borderWidth: 1 },
  typesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.bgElevated },
  typeTxt: { color: t.textSecondary, fontSize: 13 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelTxt: { fontWeight: '700' },
  submitBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitTxt: { color: '#fff', fontWeight: '700' },
});
