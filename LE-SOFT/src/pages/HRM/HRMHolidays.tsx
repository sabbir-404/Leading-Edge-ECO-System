import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Plus, Trash2, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

interface Holiday {
  id: number;
  holiday_date: string;
  holiday_name: string;
  holiday_type: string;
  created_at: string;
}

const HOLIDAY_TYPES = ['Public', 'Government', 'Company'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_LABELS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function HRMHolidays() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ date: '', name: '', type: 'Public' });
  const [saving, setSaving] = useState(false);

  const fetchHolidays = async () => {
    try {
      // @ts-ignore
      const data = await window.electron.hrmGetHolidays();
      setHolidays(data || []);
    } catch (err) {
      console.error('Failed to fetch holidays:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  useAutoRefresh(['hrm_holidays'], fetchHolidays);

  const handleAdd = async () => {
    if (!form.date || !form.name.trim()) return;
    setSaving(true);
    try {
      // @ts-ignore
      await window.electron.hrmUpsertHoliday({
        holiday_date: form.date,
        holiday_name: form.name.trim(),
        holiday_type: form.type
      });
      setForm({ date: '', name: '', type: 'Public' });
      setShowAdd(false);
      await fetchHolidays();
    } catch (err: any) {
      alert('Failed to save holiday: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this holiday?')) return;
    try {
      // @ts-ignore
      await window.electron.hrmDeleteHoliday(id);
      await fetchHolidays();
    } catch (err: any) {
      alert('Failed to delete: ' + (err.message || err));
    }
  };

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Adjust for Saturday-start week: Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
    const jsDay = firstDay.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const satStartDay = (jsDay + 1) % 7; // Convert to Sat-start: Sat=0

    const cells: (number | null)[] = [];
    for (let i = 0; i < satStartDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Fill remaining cells
    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  }, [viewYear, viewMonth]);

  const holidayMap = useMemo(() => {
    const map: Record<string, Holiday> = {};
    holidays.forEach(h => {
      map[h.holiday_date] = h;
    });
    return map;
  }, [holidays]);

  const isFriday = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    return d.getDay() === 5;
  };

  const formatDate = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${viewYear}-${mm}-${dd}`;
  };

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const goToToday = () => {
    setViewYear(new Date().getFullYear());
    setViewMonth(new Date().getMonth());
  };

  const todayStr = new Date().toISOString().split('T')[0];

  // Upcoming holidays (next 90 days)
  const upcomingHolidays = useMemo(() => {
    const now = new Date();
    const limit = new Date();
    limit.setDate(limit.getDate() + 90);
    return holidays
      .filter(h => {
        const d = new Date(h.holiday_date + 'T00:00:00');
        return d >= now && d <= limit;
      })
      .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
  }, [holidays]);

  const typeColors: Record<string, { bg: string; text: string; border: string }> = {
    'Public': { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    'Government': { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
    'Company': { bg: 'rgba(168,85,247,0.1)', text: '#a855f7', border: 'rgba(168,85,247,0.3)' },
  };

  return (
    <DashboardLayout title="HRM - Holiday Calendar">
      <div style={{ padding: '1rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', margin: 0, color: 'var(--text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Calendar size={28} style={{ color: 'var(--accent-color)' }} />
            Holiday Calendar
          </h1>
          <button
            onClick={() => setShowAdd(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '0.6rem 1.25rem',
              background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: '10px',
              fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <Plus size={18} /> Add Holiday
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' }}>
          {/* Calendar Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)',
              padding: '1.5rem', overflow: 'hidden'
            }}
          >
            {/* Month Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <button onClick={goToPrevMonth} style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}>
                <ChevronLeft size={18} />
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {MONTHS[viewMonth]} {viewYear}
                </div>
                <button onClick={goToToday} style={{ fontSize: '0.75rem', color: 'var(--accent-color)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginTop: '2px' }}>
                  Today
                </button>
              </div>
              <button onClick={goToNextMonth} style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}>
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Day Headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
              {DAY_LABELS.map((label, i) => (
                <div key={label} style={{
                  textAlign: 'center', fontSize: '0.78rem', fontWeight: 700,
                  color: i === 6 ? '#ef4444' : 'var(--text-secondary)',
                  padding: '6px 0'
                }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Calendar Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} style={{ minHeight: '60px' }} />;
                }
                const dateStr = formatDate(day);
                const isToday = dateStr === todayStr;
                const isFri = isFriday(day);
                const holiday = holidayMap[dateStr];
                const tc = holiday ? (typeColors[holiday.holiday_type] || typeColors['Public']) : null;

                return (
                  <div
                    key={dateStr}
                    onClick={() => {
                      if (!showAdd) {
                        setForm({ ...form, date: dateStr });
                        setShowAdd(true);
                      }
                    }}
                    style={{
                      minHeight: '60px', padding: '4px 6px', borderRadius: '8px', cursor: 'pointer',
                      border: isToday ? '2px solid var(--accent-color)' : '1px solid transparent',
                      background: holiday
                        ? tc!.bg
                        : isFri
                          ? 'rgba(239,68,68,0.04)'
                          : 'var(--input-bg)',
                      transition: 'all 0.15s',
                      position: 'relative'
                    }}
                    title={holiday ? `${holiday.holiday_name} (${holiday.holiday_type})` : isFri ? 'Friday — Weekend' : ''}
                  >
                    <div style={{
                      fontSize: '0.82rem', fontWeight: isToday ? 800 : 500,
                      color: isToday ? 'var(--accent-color)' : isFri ? '#ef4444' : holiday ? tc!.text : 'var(--text-primary)'
                    }}>
                      {day}
                    </div>
                    {isFri && (
                      <div style={{ fontSize: '0.58rem', color: '#ef4444', fontWeight: 600, opacity: 0.7 }}>
                        Weekend
                      </div>
                    )}
                    {holiday && (
                      <div style={{
                        fontSize: '0.58rem', color: tc!.text, fontWeight: 700,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginTop: '1px'
                      }}>
                        {holiday.holiday_name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '1.25rem', marginTop: '1rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Friday (Weekend)</span>
              </div>
              {HOLIDAY_TYPES.map(t => {
                const tc = typeColors[t];
                return (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: tc.bg, border: `1px solid ${tc.border}` }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{t} Holiday</span>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Right Panel: Upcoming + Holiday List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Upcoming Holidays */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              style={{
                background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)',
                padding: '1.25rem'
              }}
            >
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Star size={16} style={{ color: '#f59e0b' }} /> Upcoming Holidays
              </h3>
              {upcomingHolidays.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>No upcoming holidays in the next 90 days.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {upcomingHolidays.map(h => {
                    const tc = typeColors[h.holiday_type] || typeColors['Public'];
                    const d = new Date(h.holiday_date + 'T00:00:00');
                    return (
                      <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--input-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{
                          width: '38px', height: '38px', borderRadius: '10px', background: tc.bg, border: `1px solid ${tc.border}`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: tc.text, lineHeight: 1 }}>{MONTHS[d.getMonth()].slice(0, 3)}</div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: tc.text, lineHeight: 1 }}>{d.getDate()}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.holiday_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {d.toLocaleDateString(undefined, { weekday: 'long' })} · <span style={{ color: tc.text, fontWeight: 600 }}>{h.holiday_type}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* All Holidays List */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{
                background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)',
                padding: '1.25rem', flex: 1
              }}
            >
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                All Holidays ({holidays.length})
              </h3>
              {loading ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Loading...</p>
              ) : holidays.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                  No holidays defined yet. Click "Add Holiday" or click a date on the calendar to add one.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '350px', overflowY: 'auto' }}>
                  {holidays
                    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
                    .map(h => {
                      const tc = typeColors[h.holiday_type] || typeColors['Public'];
                      const d = new Date(h.holiday_date + 'T00:00:00');
                      return (
                        <div key={h.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', background: 'var(--input-bg)', borderRadius: '8px',
                          border: '1px solid var(--border-color)'
                        }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{h.holiday_name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                              <span style={{ marginLeft: '8px', padding: '1px 6px', borderRadius: '4px', background: tc.bg, color: tc.text, fontWeight: 600, fontSize: '0.68rem', border: `1px solid ${tc.border}` }}>{h.holiday_type}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDelete(h.id)}
                            style={{
                              background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none',
                              borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex',
                              transition: 'all 0.15s'
                            }}
                            title="Delete holiday"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* Add Holiday Modal */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
              style={{
                position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'
              }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                style={{
                  background: 'var(--card-bg)', borderRadius: '16px', padding: '1.75rem',
                  width: '100%', maxWidth: '440px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)'
                }}
              >
                <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={20} style={{ color: 'var(--accent-color)' }} />
                  Add Public Holiday
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Holiday Date *</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      style={{
                        width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px',
                        border: '1px solid var(--border-color)', background: 'var(--input-bg)',
                        color: 'var(--text-primary)', fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Holiday Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Eid ul-Fitr, Victory Day"
                      style={{
                        width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px',
                        border: '1px solid var(--border-color)', background: 'var(--input-bg)',
                        color: 'var(--text-primary)', fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Holiday Type</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      style={{
                        width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px',
                        border: '1px solid var(--border-color)', background: 'var(--input-bg)',
                        color: 'var(--text-primary)', fontSize: '0.9rem'
                      }}
                    >
                      {HOLIDAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowAdd(false)}
                    style={{
                      padding: '0.55rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)',
                      background: 'var(--input-bg)', color: 'var(--text-secondary)', fontWeight: 600,
                      cursor: 'pointer', fontSize: '0.85rem'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={saving || !form.date || !form.name.trim()}
                    style={{
                      padding: '0.55rem 1.5rem', borderRadius: '8px', border: 'none',
                      background: (!form.date || !form.name.trim()) ? 'var(--border-color)' : 'var(--accent-color)',
                      color: '#fff', fontWeight: 700, cursor: (!form.date || !form.name.trim()) ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem', transition: 'all 0.2s'
                    }}
                  >
                    {saving ? 'Saving...' : 'Save Holiday'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
