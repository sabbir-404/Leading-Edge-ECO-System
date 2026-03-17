import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';

interface Props {
    show: boolean;
    countdown: number;
    onStay: () => void;
}

const IdleWarningModal: React.FC<Props> = ({ show, countdown, onStay }) => {
    const minutes = parseInt(localStorage.getItem('auto_logout_minutes') || '15', 10);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 99999,
                    }}
                >
                    <motion.div
                        initial={{ scale: 0.85, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.85, opacity: 0, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        style={{
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '18px',
                            padding: '2.5rem',
                            width: '90%',
                            maxWidth: '400px',
                            textAlign: 'center',
                            boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
                        }}
                    >
                        {/* Icon + ring */}
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: 'rgba(249,115,22,0.12)',
                            border: '3px solid var(--accent-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                            position: 'relative',
                        }}>
                            {/* Countdown ring */}
                            <svg
                                style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
                                width="80" height="80" viewBox="0 0 80 80"
                            >
                                <circle
                                    cx="40" cy="40" r="36"
                                    fill="none"
                                    stroke="var(--accent-color)"
                                    strokeWidth="3"
                                    strokeDasharray={`${2 * Math.PI * 36}`}
                                    strokeDashoffset={`${2 * Math.PI * 36 * (1 - countdown / 15)}`}
                                    style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                                />
                            </svg>
                            <Clock size={28} color="var(--accent-color)" />
                        </div>

                        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Session Timeout
                        </h2>
                        <p style={{ margin: '0 0 0.25rem', color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5 }}>
                            You've been inactive for <strong>{minutes} minutes</strong>.<br />
                            You will be logged out in
                        </p>

                        <div style={{
                            fontSize: '3.5rem',
                            fontWeight: 800,
                            color: countdown <= 5 ? '#ef4444' : 'var(--accent-color)',
                            lineHeight: 1,
                            margin: '0.75rem 0 1.5rem',
                            transition: 'color 0.3s',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {countdown}s
                        </div>

                        <button
                            onClick={onStay}
                            style={{
                                width: '100%',
                                padding: '0.9rem',
                                borderRadius: '10px',
                                border: 'none',
                                background: 'var(--accent-color)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '1rem',
                                cursor: 'pointer',
                                transition: 'opacity 0.15s',
                            }}
                        >
                            Stay Logged In
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default IdleWarningModal;
