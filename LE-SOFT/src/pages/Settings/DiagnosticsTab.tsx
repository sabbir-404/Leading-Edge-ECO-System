import React, { useState, useEffect, useCallback } from 'react';
import {
    AlertTriangle, ShieldCheck, RefreshCw, Send,
    Download, Copy, Check, Filter,
    Database, CheckCircle2, Info, X
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface TelemetryStatus {
    enabled: boolean;
    installationId: string;
    diagnosticDeviceId: string;
    queuedReportsCount: number;
    lastSuccessfulUpload: string | null;
    lastUploadError: string | null;
    totalReportedThisSession: number;
}

interface ErrorReport {
    id: number;
    report_fingerprint: string;
    occurred_at: string;
    app_version: string;
    os_name: string;
    os_version: string;
    architecture: string;
    installation_id: string;
    user_role: string;
    error_type: string;
    error_message_sanitized: string;
    stack_trace_sanitized?: string;
    source: string;
    severity: string;
    active_database?: string;
    database_state?: string;
    failover_reason?: string | null;
    operation?: string | null;
    duration_ms?: number | null;
    retry_count?: number;
    app_uptime_seconds?: number;
    metadata?: Record<string, any>;
    occurrence_count?: number;
}

export const DiagnosticsTab: React.FC = () => {
    const { showToast } = useToast();

    // Telemetry status & user control state
    const [status, setStatus] = useState<TelemetryStatus>({
        enabled: true,
        installationId: '',
        diagnosticDeviceId: 'Loading...',
        queuedReportsCount: 0,
        lastSuccessfulUpload: null,
        lastUploadError: null,
        totalReportedThisSession: 0
    });
    const [toggling, setToggling] = useState(false);
    const [testing, setTesting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [copiedId, setCopiedId] = useState(false);

    // Admin Reports state
    const [reports, setReports] = useState<ErrorReport[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);
    const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null);
    const [copiedTrace, setCopiedTrace] = useState(false);

    // Filters
    const [severityFilter, setSeverityFilter] = useState('all');
    const [dbStateFilter, setDbStateFilter] = useState('all');
    const [appVersionFilter, setAppVersionFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

    // Summary metrics
    const [summary, setSummary] = useState({
        totalErrors: 0,
        uniqueFingerprints: 0,
        affectedInstallations: 0,
        failoverCount: 0
    });

    const userRole = (localStorage.getItem('user_role') || '').toLowerCase();
    const isAdminOrSuper = userRole === 'admin' || userRole === 'superadmin';

    // ── Fetch Telemetry Health & Settings ──────────────────────────────────────
    const fetchStatus = useCallback(async () => {
        try {
            const res = await (window as any).electron?.getTelemetryStatus?.();
            if (res?.success && res.data) {
                setStatus(res.data);
            }
        } catch (e: any) {
            console.warn('Failed to load telemetry status:', e.message);
        }
    }, []);

    // ── Fetch Admin Remote Reports ─────────────────────────────────────────────
    const fetchReports = useCallback(async () => {
        if (!isAdminOrSuper) return;
        setLoadingReports(true);

        let startDate: string | undefined;
        const now = new Date();
        if (timeRange === '24h') {
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        } else if (timeRange === '7d') {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (timeRange === '30d') {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        try {
            const res = await (window as any).electron?.getAdminErrorReports?.({
                severity: severityFilter,
                databaseState: dbStateFilter,
                appVersion: appVersionFilter,
                searchFingerprint: searchQuery.trim() || undefined,
                startDate,
                page: 1,
                pageSize: 50
            });

            if (res?.success) {
                setReports(res.data || []);
                if (res.summary) {
                    setSummary(res.summary);
                }
            } else {
                console.warn('[DIAGNOSTICS] Remote reports fetch note:', res?.error);
            }
        } catch (e: any) {
            console.error('Failed to fetch remote error reports:', e);
        } finally {
            setLoadingReports(false);
        }
    }, [isAdminOrSuper, severityFilter, dbStateFilter, appVersionFilter, searchQuery, timeRange]);

    useEffect(() => {
        fetchStatus();
        fetchReports();
    }, [fetchStatus, fetchReports]);

    // ── User Control Handlers ──────────────────────────────────────────────────
    const handleToggleTelemetry = async () => {
        setToggling(true);
        const nextState = !status.enabled;
        try {
            const res = await (window as any).electron?.setTelemetryEnabled?.(nextState);
            if (res?.success) {
                setStatus(prev => ({ ...prev, enabled: res.enabled }));
                showToast(`Anonymous diagnostic reporting ${res.enabled ? 'enabled' : 'disabled'}.`, 'success');
            } else {
                showToast('Failed to update telemetry setting', 'error');
            }
        } catch (e: any) {
            showToast(e.message || 'Error updating setting', 'error');
        } finally {
            setToggling(false);
        }
    };

    const handleSendTest = async () => {
        setTesting(true);
        try {
            const res = await (window as any).electron?.sendDiagnosticTest?.();
            if (res?.success) {
                showToast(res.message || 'Diagnostic test report sent successfully!', 'success');
                await fetchStatus();
                await fetchReports();
            } else {
                showToast(res?.message || 'Could not send test report', 'warning');
            }
        } catch (e: any) {
            showToast(e.message || 'Test trigger error', 'error');
        } finally {
            setTesting(false);
        }
    };

    const handleExportLog = async () => {
        setExporting(true);
        try {
            const res = await (window as any).electron?.exportDiagnosticLog?.();
            if (res?.success) {
                showToast(`Diagnostic log saved to: ${res.filePath || 'UserData'}`, 'success');
            } else {
                showToast(res?.error || 'Failed to export log', 'error');
            }
        } catch (e: any) {
            showToast(e.message || 'Log export error', 'error');
        } finally {
            setExporting(false);
        }
    };

    const handleCopyDeviceId = () => {
        navigator.clipboard.writeText(status.diagnosticDeviceId);
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
        showToast('Diagnostic Device ID copied to clipboard', 'info');
    };

    const handleCopyStackTrace = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedTrace(true);
        setTimeout(() => setCopiedTrace(false), 2000);
        showToast('Sanitized stack trace copied', 'info');
    };

    // ── Helper Badge Formatters ────────────────────────────────────────────────
    const getSeverityBadge = (sev: string) => {
        const s = (sev || 'error').toLowerCase();
        if (s === 'fatal') {
            return <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid #ef4444', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>FATAL</span>;
        }
        if (s === 'error') {
            return <span style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>ERROR</span>;
        }
        if (s === 'warning') {
            return <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>WARN</span>;
        }
        return <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>INFO</span>;
    };

    const getDbBadge = (db?: string, state?: string) => {
        const isDegraded = state === 'degraded';
        const isNas = db === 'nas';
        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 7px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: isDegraded ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                color: isDegraded ? '#ef4444' : '#10b981',
                border: `1px solid ${isDegraded ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
            }}>
                <Database size={11} />
                {isNas ? 'NAS' : 'Cloud'} ({state || 'active'})
            </span>
        );
    };

    // ── Styles ─────────────────────────────────────────────────────────────────
    const card: React.CSSProperties = {
        background: 'var(--card-bg)',
        borderRadius: '14px',
        border: '1px solid var(--border-color)',
        padding: '1.5rem',
        marginBottom: '1.25rem',
    };

    const metricBox: React.CSSProperties = {
        background: 'var(--input-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        flex: 1
    };

    return (
        <div>
            {/* ── 1. User Control & Privacy Card ─────────────────────────────── */}
            <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShieldCheck size={22} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                                Error & Diagnostic Reporting
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Helps administrators proactively resolve software bugs and database failover issues.
                            </p>
                        </div>
                    </div>

                    {/* Enable / Disable Toggle Switch */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: status.enabled ? '#10b981' : 'var(--text-secondary)' }}>
                            {status.enabled ? 'Telemetry Enabled' : 'Telemetry Disabled'}
                        </span>
                        <button
                            onClick={handleToggleTelemetry}
                            disabled={toggling}
                            style={{
                                width: '48px',
                                height: '26px',
                                borderRadius: '13px',
                                background: status.enabled ? '#10b981' : '#64748b',
                                border: 'none',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                padding: '2px'
                            }}
                            title="Toggle anonymous diagnostic reports"
                        >
                            <span style={{
                                display: 'block',
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                background: '#fff',
                                transform: status.enabled ? 'translateX(22px)' : 'translateX(0px)',
                                transition: 'transform 0.2s'
                            }} />
                        </button>
                    </div>
                </div>

                {/* Privacy Guarantee Notice */}
                <div style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    fontSize: '0.85rem',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '1.25rem'
                }}>
                    <Info size={18} color="#3b82f6" style={{ flexShrink: 0 }} />
                    <span>
                        <strong>Privacy Invariant:</strong> This sends sanitized technical diagnostic reports (stack trace, error message, and database failover state). Passwords, tokens, license keys, customer PII, and invoice contents are <strong>strictly redacted and never transmitted</strong>.
                    </span>
                </div>

                {/* Status Badges & Support Device ID */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={metricBox}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Diagnostic Device ID</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', color: 'var(--accent-color)' }}>
                                {status.diagnosticDeviceId}
                            </span>
                            <button
                                onClick={handleCopyDeviceId}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}
                                title="Copy Diagnostic Device ID"
                            >
                                {copiedId ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                            </button>
                        </div>
                    </div>

                    <div style={metricBox}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Offline Queue</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                {status.queuedReportsCount} report(s)
                            </span>
                            {status.queuedReportsCount > 0 && (
                                <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>(Retrying in bg)</span>
                            )}
                        </div>
                    </div>

                    <div style={metricBox}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Last Upload</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                            {status.lastSuccessfulUpload
                                ? new Date(status.lastSuccessfulUpload).toLocaleTimeString()
                                : 'None in this session'}
                        </span>
                    </div>
                </div>

                {/* Action Controls */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleSendTest}
                        disabled={testing || !status.enabled}
                        style={{
                            padding: '0.6rem 1.1rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: (testing || !status.enabled) ? 'not-allowed' : 'pointer',
                            opacity: (!status.enabled) ? 0.6 : 1
                        }}
                    >
                        <Send size={15} />
                        {testing ? 'Transmitting Test...' : 'Send Diagnostic Test'}
                    </button>

                    <button
                        onClick={handleExportLog}
                        disabled={exporting}
                        style={{
                            padding: '0.6rem 1.1rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: exporting ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <Download size={15} />
                        {exporting ? 'Exporting...' : 'Export Local Diagnostic Log'}
                    </button>
                </div>
            </div>

            {/* ── 2. Admin Remote Error Dashboard (Admin/Superadmin only) ───────── */}
            {isAdminOrSuper && (
                <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                                    Central Error & Incident Reports
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                    Aggregated telemetry from all customer installations on Supabase Cloud.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => { fetchReports(); fetchStatus(); }}
                            disabled={loadingReports}
                            style={{
                                padding: '0.55rem 1rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--input-bg)',
                                color: 'var(--text-primary)',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={14} className={loadingReports ? 'spin' : ''} />
                            Refresh Reports
                        </button>
                    </div>

                    {/* Summary Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        <div style={metricBox}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL INCIDENTS</span>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.totalErrors}</span>
                        </div>
                        <div style={metricBox}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>UNIQUE FINGERPRINTS</span>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#3b82f6' }}>{summary.uniqueFingerprints}</span>
                        </div>
                        <div style={metricBox}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>AFFECTED DEVICES</span>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>{summary.affectedInstallations}</span>
                        </div>
                        <div style={metricBox}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>FAILOVER EVENTS</span>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: summary.failoverCount > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
                                {summary.failoverCount}
                            </span>
                        </div>
                    </div>

                    {/* Filters Bar */}
                    <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        background: 'var(--input-bg)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        alignItems: 'center'
                    }}>
                        <Filter size={15} color="var(--text-secondary)" />

                        {/* Time Range */}
                        <select
                            value={timeRange}
                            onChange={e => setTimeRange(e.target.value as any)}
                            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                        >
                            <option value="24h">Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="all">All Time</option>
                        </select>

                        {/* Severity */}
                        <select
                            value={severityFilter}
                            onChange={e => setSeverityFilter(e.target.value)}
                            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                        >
                            <option value="all">All Severities</option>
                            <option value="fatal">Fatal Only</option>
                            <option value="error">Error Only</option>
                            <option value="warning">Warning Only</option>
                            <option value="info">Info Only</option>
                        </select>

                        {/* Database State */}
                        <select
                            value={dbStateFilter}
                            onChange={e => setDbStateFilter(e.target.value)}
                            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                        >
                            <option value="all">All DB States</option>
                            <option value="healthy">Healthy</option>
                            <option value="degraded">Degraded (Fallback)</option>
                            <option value="recovering">Recovering</option>
                        </select>

                        {/* App Version */}
                        <select
                            value={appVersionFilter}
                            onChange={e => setAppVersionFilter(e.target.value)}
                            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                        >
                            <option value="all">All Versions</option>
                            <option value="1.8.4">v1.8.4</option>
                            <option value="1.8.3">v1.8.3</option>
                            <option value="1.8.2">v1.8.2</option>
                            <option value="1.8.1">v1.8.1</option>
                        </select>

                        {/* Search Input */}
                        <input
                            type="text"
                            placeholder="Search fingerprint or error message..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                flex: 1,
                                minWidth: '180px',
                                padding: '0.4rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg)',
                                color: 'var(--text-primary)',
                                fontSize: '0.82rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Reports Table */}
                    {loadingReports ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                            <div>Loading remote error reports...</div>
                        </div>
                    ) : reports.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
                            <CheckCircle2 size={32} color="#10b981" style={{ margin: '0 auto 8px' }} />
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No errors recorded for this filter criteria</div>
                            <div style={{ fontSize: '0.82rem' }}>All monitored installations operating normally.</div>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                        <th style={{ padding: '0.65rem 0.75rem' }}>SEVERITY</th>
                                        <th style={{ padding: '0.65rem 0.75rem' }}>ERROR & MESSAGE</th>
                                        <th style={{ padding: '0.65rem 0.75rem' }}>DATABASE STATE</th>
                                        <th style={{ padding: '0.65rem 0.75rem' }}>VERSION</th>
                                        <th style={{ padding: '0.65rem 0.75rem' }}>OCCURRED</th>
                                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>ACTION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reports.map((r: ErrorReport) => (
                                        <tr
                                            key={r.id}
                                            style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.15s' }}
                                            onClick={() => setSelectedReport(r)}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--input-bg)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                {getSeverityBadge(r.severity)}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem', maxWidth: '300px' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {r.error_type}
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {r.error_message_sanitized}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', opacity: 0.6 }}>
                                                    fp: {r.report_fingerprint.slice(0, 10)}...
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                {getDbBadge(r.active_database, r.database_state)}
                                                {r.failover_reason && (
                                                    <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '2px' }}>
                                                        Failover: {r.failover_reason.slice(0, 25)}...
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>v{r.app_version}</span>
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {new Date(r.occurred_at).toLocaleDateString()} {new Date(r.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                {r.occurrence_count && r.occurrence_count > 1 && (
                                                    <span style={{ marginLeft: '6px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', padding: '1px 6px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700 }}>
                                                        x{r.occurrence_count}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelectedReport(r); }}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'transparent',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.78rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Inspect
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── 3. Detail Inspection Modal ──────────────────────────────────── */}
            {selectedReport && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '1.5rem'
                }}>
                    <div style={{
                        background: 'var(--card-bg)',
                        borderRadius: '16px',
                        border: '1px solid var(--border-color)',
                        width: '100%',
                        maxWidth: '780px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {getSeverityBadge(selectedReport.severity)}
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                                    {selectedReport.error_type}
                                </h3>
                            </div>
                            <button
                                onClick={() => setSelectedReport(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Message */}
                            <div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                    Sanitized Error Message
                                </span>
                                <div style={{
                                    marginTop: '4px',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    background: 'var(--input-bg)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.9rem',
                                    border: '1px solid var(--border-color)'
                                }}>
                                    {selectedReport.error_message_sanitized}
                                </div>
                            </div>

                            {/* Correlation Metadata Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                <div style={metricBox}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Active Database</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                        {selectedReport.active_database?.toUpperCase()} ({selectedReport.database_state})
                                    </span>
                                </div>
                                <div style={metricBox}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Source & Operation</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                        {selectedReport.source} {selectedReport.operation ? `:: ${selectedReport.operation}` : ''}
                                    </span>
                                </div>
                                <div style={metricBox}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>App & OS</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                        v{selectedReport.app_version} ({selectedReport.os_name} {selectedReport.architecture})
                                    </span>
                                </div>
                                <div style={metricBox}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Occurred At</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                        {new Date(selectedReport.occurred_at).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {/* Failover Reason if present */}
                            {selectedReport.failover_reason && (
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#ef4444',
                                    fontSize: '0.85rem'
                                }}>
                                    <strong>Failover Correlation Reason:</strong> {selectedReport.failover_reason}
                                </div>
                            )}

                            {/* Fingerprint */}
                            <div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                    Deterministic Fingerprint (32-byte SHA-256)
                                </span>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-primary)', marginTop: '3px' }}>
                                    {selectedReport.report_fingerprint}
                                </div>
                            </div>

                            {/* Sanitized Stack Trace */}
                            {selectedReport.stack_trace_sanitized && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                            Sanitized Stack Trace
                                        </span>
                                        <button
                                            onClick={() => handleCopyStackTrace(selectedReport.stack_trace_sanitized!)}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            {copiedTrace ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedTrace ? 'Copied' : 'Copy Stack'}
                                        </button>
                                    </div>
                                    <pre style={{
                                        margin: 0,
                                        padding: '0.85rem',
                                        borderRadius: '8px',
                                        background: '#090d16',
                                        color: '#cbd5e1',
                                        fontFamily: 'monospace',
                                        fontSize: '0.78rem',
                                        overflowX: 'auto',
                                        maxHeight: '180px',
                                        lineHeight: 1.45,
                                        border: '1px solid var(--border-color)'
                                    }}>
                                        {selectedReport.stack_trace_sanitized}
                                    </pre>
                                </div>
                            )}

                            {/* Sanitized Metadata */}
                            {selectedReport.metadata && Object.keys(selectedReport.metadata).length > 0 && (
                                <div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                                        Sanitized Diagnostic Context / Metadata
                                    </span>
                                    <pre style={{
                                        margin: 0,
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        background: '#090d16',
                                        color: '#94a3b8',
                                        fontFamily: 'monospace',
                                        fontSize: '0.78rem',
                                        overflowX: 'auto',
                                        maxHeight: '130px',
                                        border: '1px solid var(--border-color)'
                                    }}>
                                        {JSON.stringify(selectedReport.metadata, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}>
                            <button
                                onClick={() => setSelectedReport(null)}
                                style={{
                                    padding: '0.55rem 1.25rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: 'var(--accent-color)',
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: '0.88rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
