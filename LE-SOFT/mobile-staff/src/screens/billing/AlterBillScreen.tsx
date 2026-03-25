import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useResponsive } from '../../lib/responsive';
import { decryptRows, encryptObjectForDb } from '../../lib/encryption';
import { Minus, Plus, Save, Search, ShieldAlert, Trash2 } from 'lucide-react-native';

interface BillRow {
  id: number;
  invoice_number?: string;
  grand_total?: number;
  subtotal?: number;
  discount_total?: number;
  billed_by?: string;
  payment_method_id?: number | null;
  payment_ref?: string | null;
  created_at?: string;
  updated_at?: string;
  billing_customers?: {
    name?: string;
  };
}

interface EditableItem {
  id?: number;
  product_id: number;
  product_name: string;
  sku: string;
  quantity: number;
  mrp: number;
  discount_pct: number;
  discount_amt?: number;
  price: number;
  isNew?: boolean;
}

interface ProductRow {
  id: number;
  name: string;
  sku: string;
  selling_price: number;
  quantity?: number;
}

interface PaymentMethod {
  id: number;
  name: string;
}

interface AuditEntry {
  field: string;
  oldValue: string;
  newValue: string;
  productId?: number;
  productName?: string;
}

const clamp = (num: number, min: number, max: number) => Math.max(min, Math.min(max, num));

export default function AlterBillScreen() {
  const { theme } = useTheme();
  const ui = useResponsive();

  const [bills, setBills] = useState<BillRow[]>([]);
  const [selectedBill, setSelectedBill] = useState<BillRow | null>(null);
  const [initialItems, setInitialItems] = useState<EditableItem[]>([]);
  const [items, setItems] = useState<EditableItem[]>([]);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [query, setQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [additionalPaymentMethod, setAdditionalPaymentMethod] = useState<number | null>(null);
  const [additionalPaymentRef, setAdditionalPaymentRef] = useState('');

  const [currentRole, setCurrentRole] = useState('staff');
  const [currentUserName, setCurrentUserName] = useState('Unknown');

  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const canDelete = currentRole === 'admin' || currentRole === 'superadmin';

  const fetchBaseData = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData?.user;

    if (authUser) {
      const { data: userRow } = await supabase
        .from('users')
        .select('full_name, username, role')
        .eq('auth_id', authUser.id)
        .single();
      const user = decryptRows([userRow || {}])[0] || {};
      setCurrentRole(String(user.role || 'staff').toLowerCase());
      setCurrentUserName(user.full_name || user.username || authUser.email || 'Unknown');
    }

    const [{ data: billsData }, { data: productsData }, { data: methodsData }] = await Promise.all([
      supabase
        .from('bills')
        .select('id, invoice_number, subtotal, discount_total, grand_total, payment_method_id, payment_ref, billed_by, created_at, updated_at, billing_customers(name)')
        .order('created_at', { ascending: false })
        .limit(250),
      supabase.from('products').select('id, name, sku, selling_price, quantity').order('name').limit(500),
      supabase.from('payment_methods').select('id, name').order('name'),
    ]);

    setBills(decryptRows((billsData || []) as any));
    setProducts(decryptRows((productsData || []) as any));
    setPaymentMethods(decryptRows((methodsData || []) as any));
  }, []);

  useEffect(() => {
    fetchBaseData();
  }, [fetchBaseData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBaseData();
    setRefreshing(false);
  }, [fetchBaseData]);

  const loadBillItems = async (bill: BillRow) => {
    setSelectedBill(bill);
    setDeleteReason('');
    setAdditionalPaymentRef('');

    const { data, error } = await supabase
      .from('bill_items')
      .select('id, product_id, product_name, sku, quantity, mrp, discount_pct, discount_amt, price')
      .eq('bill_id', bill.id)
      .order('id', { ascending: true });

    if (error) {
      Alert.alert('Error', error.message || 'Unable to load bill items');
      setItems([]);
      setInitialItems([]);
      return;
    }

    const rows = decryptRows((data || []) as any);
    const mapped: EditableItem[] = rows.map((r: any) => ({
      id: Number(r.id),
      product_id: Number(r.product_id),
      product_name: String(r.product_name || ''),
      sku: String(r.sku || ''),
      quantity: Number(r.quantity || 1),
      mrp: Number(r.mrp || 0),
      discount_pct: Number(r.discount_pct || 0),
      discount_amt: Number(r.discount_amt || 0),
      price: Number(r.price || 0),
      isNew: false,
    }));

    setItems(mapped);
    setInitialItems(mapped);
    setAdditionalPaymentMethod(bill.payment_method_id ? Number(bill.payment_method_id) : null);
  };

  const lineBase = (i: EditableItem) => Number(i.mrp || 0) * Number(i.quantity || 0);
  const lineUnitFinal = (i: EditableItem) => Number(i.mrp || 0) * (1 - clamp(Number(i.discount_pct || 0), 0, 100) / 100);
  const lineFinal = (i: EditableItem) => lineUnitFinal(i) * Number(i.quantity || 0);
  const lineDiscount = (i: EditableItem) => Math.max(0, lineBase(i) - lineFinal(i));

  const computedTotals = useMemo(() => {
    const subtotal = items.reduce((sum, it) => sum + lineBase(it), 0);
    const discountTotal = items.reduce((sum, it) => sum + lineDiscount(it), 0);
    const grand = items.reduce((sum, it) => sum + lineFinal(it), 0);
    const oldGrand = Number(selectedBill?.grand_total || 0);
    const additional = Math.max(0, grand - oldGrand);
    return { subtotal, discountTotal, grand, oldGrand, additional };
  }, [items, selectedBill]);

  const updateQty = (productId: number, delta: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.product_id === productId
          ? { ...i, quantity: Math.max(1, Number(i.quantity || 1) + delta) }
          : i
      )
    );
  };

  const setQtyDirect = (productId: number, raw: string) => {
    const q = Math.max(1, Number.parseInt(raw || '1', 10) || 1);
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, quantity: q } : i)));
  };

  const setDiscountPct = (productId: number, raw: string) => {
    const pct = clamp(Number.parseFloat(raw || '0') || 0, 0, 100);
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, discount_pct: pct } : i)));
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  const addProduct = (p: ProductRow) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product_id === p.id);
      if (idx >= 0) {
        return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          sku: p.sku || '',
          quantity: 1,
          mrp: Number(p.selling_price || 0),
          discount_pct: 0,
          discount_amt: 0,
          price: Number(p.selling_price || 0),
          isNew: true,
        },
      ];
    });
    setProductQuery('');
  };

  const filteredBills = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter((b) => {
      const hay = `${b.invoice_number || ''} ${b.billing_customers?.name || ''} ${b.billed_by || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bills, query]);

  const productSuggestions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [] as ProductRow[];
    return products
      .filter((p) => `${p.name || ''} ${p.sku || ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, productQuery]);

  const pendingAudit = useMemo<AuditEntry[]>(() => {
    const initialMap = new Map<number, EditableItem>();
    initialItems.forEach((it) => initialMap.set(it.product_id, it));

    const currentMap = new Map<number, EditableItem>();
    items.forEach((it) => currentMap.set(it.product_id, it));

    const entries: AuditEntry[] = [];

    initialItems.forEach((oldItem) => {
      const now = currentMap.get(oldItem.product_id);
      if (!now) {
        entries.push({
          field: 'item_removed',
          oldValue: `Qty ${oldItem.quantity}`,
          newValue: 'Removed',
          productId: oldItem.product_id,
          productName: oldItem.product_name,
        });
        return;
      }

      if (Number(now.quantity) !== Number(oldItem.quantity)) {
        entries.push({
          field: 'quantity',
          oldValue: String(oldItem.quantity),
          newValue: String(now.quantity),
          productId: now.product_id,
          productName: now.product_name,
        });
      }

      if (Number(now.discount_pct) !== Number(oldItem.discount_pct || 0)) {
        entries.push({
          field: 'discount_pct',
          oldValue: String(oldItem.discount_pct || 0),
          newValue: String(now.discount_pct || 0),
          productId: now.product_id,
          productName: now.product_name,
        });
      }
    });

    items.forEach((newItem) => {
      if (!initialMap.has(newItem.product_id)) {
        entries.push({
          field: 'item_added',
          oldValue: 'Not Present',
          newValue: `Qty ${newItem.quantity}`,
          productId: newItem.product_id,
          productName: newItem.product_name,
        });
      }
    });

    if (Number(computedTotals.grand.toFixed(2)) !== Number(computedTotals.oldGrand.toFixed(2))) {
      entries.push({
        field: 'grand_total',
        oldValue: Number(computedTotals.oldGrand).toFixed(2),
        newValue: Number(computedTotals.grand).toFixed(2),
      });
    }

    return entries;
  }, [items, initialItems, computedTotals]);

  const writeAuditLogs = async (billId: number, entries: AuditEntry[], eventType: 'alter' | 'delete', reason?: string) => {
    if (!entries.length) return;

    const logs = entries.map((e) =>
      encryptObjectForDb({
        bill_id: billId,
        event_type: eventType,
        changed_by: currentUserName,
        field_name: e.field,
        product_id: e.productId || null,
        product_name: e.productName || null,
        old_value: e.oldValue,
        new_value: e.newValue,
        reason: reason || null,
        changed_at: new Date().toISOString(),
      })
    );

    const { error } = await supabase.from('bill_audit_logs').insert(logs as any);
    if (error) {
      // Keep alteration/deletion successful even if optional audit table is unavailable.
      console.warn('bill_audit_logs insert failed:', error.message);
    }
  };

  const saveAlteration = async () => {
    if (!selectedBill) {
      Alert.alert('Select Bill', 'Please select a bill before saving alterations.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('No Items', 'A bill must have at least one item.');
      return;
    }
    if (computedTotals.additional > 0 && !additionalPaymentMethod) {
      Alert.alert('Payment Required', 'Choose a payment method for the additional amount.');
      return;
    }

    setSaving(true);
    try {
      const preparedItems = items.map((i) => {
        const base = lineBase(i);
        const final = lineFinal(i);
        const discountAmt = Math.max(0, base - final);
        return encryptObjectForDb({
          bill_id: selectedBill.id,
          product_id: i.product_id,
          product_name: i.product_name,
          sku: i.sku || '',
          quantity: i.quantity,
          mrp: i.mrp,
          discount_pct: i.discount_pct,
          discount_amt: Number(discountAmt.toFixed(2)),
          price: Number(final.toFixed(2)),
        });
      });

      const { error: removeError } = await supabase.from('bill_items').delete().eq('bill_id', selectedBill.id);
      if (removeError) throw removeError;

      const { error: insertError } = await supabase.from('bill_items').insert(preparedItems as any);
      if (insertError) throw insertError;

      const billUpdatePayload = encryptObjectForDb({
        subtotal: Number(computedTotals.subtotal.toFixed(2)),
        discount_total: Number(computedTotals.discountTotal.toFixed(2)),
        grand_total: Number(computedTotals.grand.toFixed(2)),
        payment_method_id: computedTotals.additional > 0 ? additionalPaymentMethod : selectedBill.payment_method_id,
        payment_ref: computedTotals.additional > 0 ? additionalPaymentRef : selectedBill.payment_ref,
      });

      const { error: updateBillError } = await supabase.from('bills').update(billUpdatePayload).eq('id', selectedBill.id);
      if (updateBillError) throw updateBillError;

      const paymentAudit: AuditEntry[] = computedTotals.additional > 0
        ? [{
            field: 'payment_reconciliation',
            oldValue: 'No additional payment',
            newValue: `Additional ৳${computedTotals.additional.toFixed(2)} via method ${additionalPaymentMethod || '-'}`,
          }]
        : [];

      await writeAuditLogs(selectedBill.id, [...pendingAudit, ...paymentAudit], 'alter');

      Alert.alert('Saved', `Bill altered successfully. New total: ৳${computedTotals.grand.toFixed(2)}`);
      await fetchBaseData();
      await loadBillItems({ ...selectedBill, grand_total: computedTotals.grand });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Unable to alter bill');
    } finally {
      setSaving(false);
    }
  };

  const restoreInventory = async (rows: EditableItem[]) => {
    const ids = Array.from(new Set(rows.map((r) => Number(r.product_id)).filter((id) => Number.isFinite(id) && id > 0)));
    if (!ids.length) return;

    const { data: productsData } = await supabase.from('products').select('id, quantity').in('id', ids as any);
    const currentQty = new Map<number, number>();
    (productsData || []).forEach((p: any) => currentQty.set(Number(p.id), Number(p.quantity || 0)));

    for (const row of rows) {
      const pid = Number(row.product_id);
      if (!pid) continue;
      const oldQty = currentQty.get(pid) || 0;
      const restored = oldQty + Number(row.quantity || 0);
      await supabase.from('products').update({ quantity: restored }).eq('id', pid);
      currentQty.set(pid, restored);
    }
  };

  const deleteBill = async () => {
    if (!selectedBill) {
      Alert.alert('Select Bill', 'Please choose a bill first.');
      return;
    }
    if (!canDelete) {
      Alert.alert('Access Denied', 'Only admin or superadmin can delete bills.');
      return;
    }
    if (!deleteReason.trim()) {
      Alert.alert('Reason Required', 'Enter a reason for deletion.');
      return;
    }

    Alert.alert('Delete Bill', 'This will restore inventory and permanently remove this bill. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await restoreInventory(items);

            await supabase.from('bill_shipping').delete().eq('bill_id', selectedBill.id);
            const { error: deleteItemsError } = await supabase.from('bill_items').delete().eq('bill_id', selectedBill.id);
            if (deleteItemsError) throw deleteItemsError;

            const { error: deleteBillError } = await supabase.from('bills').delete().eq('id', selectedBill.id);
            if (deleteBillError) throw deleteBillError;

            const auditEntries: AuditEntry[] = [
              {
                field: 'bill_deleted',
                oldValue: selectedBill.invoice_number || `#${selectedBill.id}`,
                newValue: 'Deleted with inventory restoration',
              },
            ];

            await writeAuditLogs(selectedBill.id, auditEntries, 'delete', deleteReason.trim());

            Alert.alert('Deleted', 'Bill deleted and inventory restored.');
            setSelectedBill(null);
            setItems([]);
            setInitialItems([]);
            setDeleteReason('');
            await fetchBaseData();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Unable to delete bill');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const s = makeStyles(theme, ui);

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={filteredBills}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <Text style={s.title}>Alter & Audit</Text>
              <Text style={s.subtitle}>Edit line items, reconcile additional payment, and track all changes.</Text>
            </View>

            <View style={s.panel}>
              <View style={s.searchRow}>
                <Search color={theme.textMuted} size={ui.icon(16)} />
                <TextInput
                  style={s.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Find bill by invoice/customer/staff"
                  placeholderTextColor={theme.textMuted}
                />
              </View>

              <Text style={s.sectionLabel}>Select Bill</Text>
              {filteredBills.slice(0, 60).map((bill) => {
                const active = selectedBill?.id === bill.id;
                return (
                  <TouchableOpacity key={bill.id} style={[s.billRow, active && s.billRowActive]} onPress={() => loadBillItems(bill)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.billInvoice}>{bill.invoice_number || `#${bill.id}`}</Text>
                      <Text style={s.billMeta}>{bill.billing_customers?.name || 'Walk-in'} · {bill.billed_by || '-'}</Text>
                    </View>
                    <Text style={s.billTotal}>৳{Math.round(Number(bill.grand_total || 0)).toLocaleString()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedBill ? (
              <View style={s.panel}>
                <Text style={s.sectionLabel}>Modification Workflow</Text>
                <View style={s.summaryBox}>
                  <Text style={s.summaryLine}>Invoice: {selectedBill.invoice_number || `#${selectedBill.id}`}</Text>
                  <Text style={s.summaryLine}>Original Total: ৳{Number(computedTotals.oldGrand || 0).toFixed(2)}</Text>
                  <Text style={s.summaryLine}>New Total: ৳{Number(computedTotals.grand || 0).toFixed(2)}</Text>
                  <Text style={[s.summaryLine, computedTotals.additional > 0 ? s.warningText : s.okText]}>
                    Additional Amount: ৳{Number(computedTotals.additional || 0).toFixed(2)}
                  </Text>
                </View>

                <Text style={s.sectionLabel}>Line Items</Text>
                {items.map((it) => (
                  <View key={it.product_id} style={s.itemCard}>
                    <View style={s.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.itemName}>{it.product_name}</Text>
                        <Text style={s.itemMeta}>{it.sku || '-'} {it.isNew ? '· New' : ''}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeItem(it.product_id)} style={s.removeBtn}>
                        <Trash2 color={theme.danger} size={ui.icon(15)} />
                      </TouchableOpacity>
                    </View>

                    <View style={s.editRow}>
                      <View style={s.qtyWrap}>
                        <TouchableOpacity onPress={() => updateQty(it.product_id, -1)} style={s.qtyBtn}>
                          <Minus color={theme.textPrimary} size={ui.icon(12)} />
                        </TouchableOpacity>
                        <TextInput
                          style={s.qtyInput}
                          keyboardType="number-pad"
                          value={String(it.quantity)}
                          onChangeText={(t) => setQtyDirect(it.product_id, t)}
                        />
                        <TouchableOpacity onPress={() => updateQty(it.product_id, 1)} style={s.qtyBtn}>
                          <Plus color={theme.textPrimary} size={ui.icon(12)} />
                        </TouchableOpacity>
                      </View>

                      <View style={s.discountWrap}>
                        <Text style={s.discountLabel}>Discount %</Text>
                        <TextInput
                          style={s.discountInput}
                          keyboardType="decimal-pad"
                          value={String(it.discount_pct)}
                          onChangeText={(t) => setDiscountPct(it.product_id, t)}
                        />
                      </View>
                    </View>
                  </View>
                ))}

                <Text style={s.sectionLabel}>Add New Item</Text>
                <View style={s.searchRow}>
                  <Search color={theme.textMuted} size={ui.icon(15)} />
                  <TextInput
                    style={s.searchInput}
                    value={productQuery}
                    onChangeText={setProductQuery}
                    placeholder="Search product by name or SKU"
                    placeholderTextColor={theme.textMuted}
                  />
                </View>
                {productSuggestions.map((p) => (
                  <TouchableOpacity key={p.id} style={s.suggestRow} onPress={() => addProduct(p)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemName}>{p.name}</Text>
                      <Text style={s.itemMeta}>{p.sku || '-'} · Stock {Number(p.quantity || 0)}</Text>
                    </View>
                    <Text style={s.billTotal}>৳{Number(p.selling_price || 0).toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}

                {computedTotals.additional > 0 ? (
                  <View style={s.reconcileBox}>
                    <Text style={s.reconcileTitle}>Payment Reconciliation Required</Text>
                    <Text style={s.reconcileMeta}>Additional amount ৳{computedTotals.additional.toFixed(2)} was added. Select method and reference.</Text>

                    <View style={s.pickerWrap}>
                      <Picker
                        selectedValue={additionalPaymentMethod}
                        onValueChange={(v) => setAdditionalPaymentMethod(v)}
                        style={{ color: theme.textPrimary }}
                      >
                        <Picker.Item label="Select Payment Method" value={null} color={theme.textMuted} />
                        {paymentMethods.map((m) => (
                          <Picker.Item key={m.id} label={m.name} value={m.id} />
                        ))}
                      </Picker>
                    </View>

                    <TextInput
                      style={s.input}
                      value={additionalPaymentRef}
                      onChangeText={setAdditionalPaymentRef}
                      placeholder="Payment reference (optional)"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                ) : null}

                <Text style={s.sectionLabel}>Audit Preview</Text>
                {pendingAudit.length === 0 ? <Text style={s.muted}>No pending changes.</Text> : null}
                {pendingAudit.map((a, idx) => (
                  <View key={`${a.field}-${idx}`} style={s.auditRow}>
                    <Text style={s.auditField}>{a.productName ? `${a.productName} · ${a.field}` : a.field}</Text>
                    <Text style={s.auditValues}>{a.oldValue} {'->'} {a.newValue}</Text>
                  </View>
                ))}

                <TouchableOpacity style={[s.primaryBtn, saving && s.btnDisabled]} onPress={saveAlteration} disabled={saving}>
                  <Save color={theme.bg} size={ui.icon(16)} />
                  <Text style={s.primaryText}>{saving ? 'Saving...' : 'Save Alteration'}</Text>
                </TouchableOpacity>

                <View style={s.deleteSection}>
                  <Text style={s.sectionLabel}>Safe Deletion</Text>
                  {!canDelete ? (
                    <View style={s.noAccessBox}>
                      <ShieldAlert color={theme.warning} size={ui.icon(16)} />
                      <Text style={s.noAccessText}>Delete access requires admin or superadmin role.</Text>
                    </View>
                  ) : (
                    <>
                      <TextInput
                        style={s.input}
                        value={deleteReason}
                        onChangeText={setDeleteReason}
                        placeholder="Reason for deletion (required)"
                        placeholderTextColor={theme.textMuted}
                      />
                      <TouchableOpacity style={[s.deleteBtn, saving && s.btnDisabled]} onPress={deleteBill} disabled={saving}>
                        <Trash2 color="#fff" size={ui.icon(15)} />
                        <Text style={s.deleteText}>Delete Bill & Restore Inventory</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ) : null}
          </>
        }
        renderItem={() => null}
      />
    </SafeAreaView>
  );
}

const makeStyles = (theme: any, ui: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    listContent: { paddingHorizontal: ui.contentPadding, paddingBottom: ui.spacing(30) },

    header: { paddingTop: ui.spacing(8), paddingBottom: ui.spacing(8) },
    title: { color: theme.textPrimary, fontSize: ui.font(22, 18, 26), fontWeight: '800' },
    subtitle: { color: theme.textMuted, fontSize: ui.font(12), marginTop: ui.spacing(4) },

    panel: {
      backgroundColor: theme.bgCard,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(14),
      padding: ui.cardPadding,
      marginTop: ui.spacing(10),
      gap: ui.spacing(8),
    },

    sectionLabel: { color: theme.textPrimary, fontSize: ui.font(13), fontWeight: '700', marginTop: ui.spacing(4) },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: ui.spacing(8),
      minHeight: ui.controlHeight,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(10),
      paddingHorizontal: ui.spacing(10),
      backgroundColor: theme.bgInput,
    },
    searchInput: { flex: 1, color: theme.textPrimary, fontSize: ui.font(13), paddingVertical: ui.spacing(8) },

    billRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: ui.spacing(10),
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(10),
      paddingHorizontal: ui.spacing(10),
      paddingVertical: ui.spacing(10),
      backgroundColor: theme.bg,
    },
    billRowActive: { borderColor: theme.accent, backgroundColor: theme.accent + '12' },
    billInvoice: { color: theme.textPrimary, fontWeight: '700', fontSize: ui.font(13) },
    billMeta: { color: theme.textMuted, fontSize: ui.font(11), marginTop: ui.spacing(2) },
    billTotal: { color: theme.success, fontWeight: '800', fontSize: ui.font(13) },

    summaryBox: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(10),
      backgroundColor: theme.bg,
      padding: ui.spacing(10),
    },
    summaryLine: { color: theme.textSecondary, fontSize: ui.font(12), marginBottom: ui.spacing(3) },
    warningText: { color: theme.warning, fontWeight: '700' },
    okText: { color: theme.success, fontWeight: '700' },

    itemCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(10),
      backgroundColor: theme.bg,
      padding: ui.spacing(10),
      gap: ui.spacing(8),
    },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.spacing(8) },
    itemName: { color: theme.textPrimary, fontSize: ui.font(12), fontWeight: '700' },
    itemMeta: { color: theme.textMuted, fontSize: ui.font(11), marginTop: ui.spacing(2) },
    removeBtn: {
      width: ui.scale(30),
      height: ui.scale(30),
      borderRadius: ui.radius(8),
      borderWidth: 1,
      borderColor: theme.danger + '66',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.danger + '15',
    },

    editRow: { flexDirection: ui.isCompact ? 'column' : 'row', gap: ui.spacing(10) },
    qtyWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(9),
      backgroundColor: theme.bgCard,
      overflow: 'hidden',
      minHeight: ui.controlHeight,
    },
    qtyBtn: {
      width: ui.scale(32),
      height: ui.controlHeight,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bg,
    },
    qtyInput: {
      width: ui.scale(54),
      textAlign: 'center',
      color: theme.textPrimary,
      fontSize: ui.font(13),
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.border,
      height: ui.controlHeight,
    },

    discountWrap: { flex: 1 },
    discountLabel: { color: theme.textMuted, fontSize: ui.font(11), marginBottom: ui.spacing(4) },
    discountInput: {
      minHeight: ui.controlHeight,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(9),
      paddingHorizontal: ui.spacing(10),
      color: theme.textPrimary,
      backgroundColor: theme.bgCard,
      fontSize: ui.font(13),
    },

    suggestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(10),
      paddingHorizontal: ui.spacing(10),
      paddingVertical: ui.spacing(10),
      backgroundColor: theme.bg,
      gap: ui.spacing(10),
    },

    reconcileBox: {
      borderWidth: 1,
      borderColor: theme.warning + '66',
      backgroundColor: theme.warning + '12',
      borderRadius: ui.radius(10),
      padding: ui.spacing(10),
      marginTop: ui.spacing(4),
      gap: ui.spacing(8),
    },
    reconcileTitle: { color: theme.warning, fontWeight: '800', fontSize: ui.font(12) },
    reconcileMeta: { color: theme.textSecondary, fontSize: ui.font(11) },

    pickerWrap: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(9),
      overflow: 'hidden',
      backgroundColor: theme.bgCard,
      minHeight: ui.controlHeight,
      justifyContent: 'center',
    },

    input: {
      minHeight: ui.controlHeight,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(9),
      paddingHorizontal: ui.spacing(10),
      color: theme.textPrimary,
      backgroundColor: theme.bgCard,
      fontSize: ui.font(13),
    },

    muted: { color: theme.textMuted, fontSize: ui.font(12) },
    auditRow: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: ui.radius(9),
      paddingHorizontal: ui.spacing(10),
      paddingVertical: ui.spacing(8),
      backgroundColor: theme.bg,
      gap: ui.spacing(2),
    },
    auditField: { color: theme.textPrimary, fontWeight: '700', fontSize: ui.font(11) },
    auditValues: { color: theme.textMuted, fontSize: ui.font(11) },

    primaryBtn: {
      marginTop: ui.spacing(10),
      minHeight: ui.controlHeight,
      borderRadius: ui.radius(10),
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: ui.spacing(8),
    },
    primaryText: { color: theme.bg, fontWeight: '800', fontSize: ui.font(13) },

    deleteSection: { marginTop: ui.spacing(8), gap: ui.spacing(8) },
    noAccessBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: ui.spacing(8),
      borderWidth: 1,
      borderColor: theme.warning + '66',
      borderRadius: ui.radius(10),
      backgroundColor: theme.warning + '12',
      padding: ui.spacing(10),
    },
    noAccessText: { color: theme.warning, fontSize: ui.font(11), flex: 1 },

    deleteBtn: {
      minHeight: ui.controlHeight,
      borderRadius: ui.radius(10),
      backgroundColor: theme.danger,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: ui.spacing(8),
    },
    deleteText: { color: '#fff', fontWeight: '800', fontSize: ui.font(12) },

    btnDisabled: { opacity: 0.7 },
  });
