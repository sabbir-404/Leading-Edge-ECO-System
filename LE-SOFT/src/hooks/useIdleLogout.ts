import { useEffect, useRef, useState, useCallback } from 'react';

const WARN_SECONDS = 15; // Show warning for 15 seconds before logout

export interface IdleLogoutState {
    showWarning: boolean;
    countdown: number;
    stayLoggedIn: () => void;
}

/**
 * Tracks user idle time and triggers auto-logout.
 *
 * Reads settings from localStorage:
 *   auto_logout_enabled = "true" | "false"
 *   auto_logout_minutes = "5" | "10" | "15" | "30" | "60"
 *
 * @param onLogout  Callback fired when countdown reaches 0.
 * @param isActive  Pass `false` on the login / setup screens to disable the timer.
 */
export function useIdleLogout(onLogout: () => void, isActive = true): IdleLogoutState {
    const [showWarning, setShowWarning] = useState(false);
    const [countdown, setCountdown] = useState(WARN_SECONDS);

    const idleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countTimer  = useRef<ReturnType<typeof setInterval> | null>(null);

    const getSettings = () => {
        const enabled = localStorage.getItem('auto_logout_enabled') !== 'false'; // default: on
        const minutes = parseInt(localStorage.getItem('auto_logout_minutes') || '15', 10);
        return { enabled, idleMs: minutes * 60 * 1000 };
    };

    const clearTimers = useCallback(() => {
        if (idleTimer.current)  clearTimeout(idleTimer.current);
        if (countTimer.current) clearInterval(countTimer.current);
        idleTimer.current  = null;
        countTimer.current = null;
    }, []);

    const startCountdown = useCallback(() => {
        setShowWarning(true);
        setCountdown(WARN_SECONDS);

        let secs = WARN_SECONDS;
        countTimer.current = setInterval(() => {
            secs -= 1;
            setCountdown(secs);
            if (secs <= 0) {
                clearTimers();
                setShowWarning(false);
                onLogout();
            }
        }, 1000);
    }, [clearTimers, onLogout]);

    const resetIdle = useCallback(() => {
        const { enabled, idleMs } = getSettings();
        if (!enabled || !isActive) return;

        // If warning was showing and user moved — dismiss it
        if (showWarning) {
            clearTimers();
            setShowWarning(false);
            setCountdown(WARN_SECONDS);
        }

        clearTimers();
        idleTimer.current = setTimeout(startCountdown, idleMs);
    }, [clearTimers, isActive, showWarning, startCountdown]);

    // Reset on any user activity
    useEffect(() => {
        if (!isActive) return;

        const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
        events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));

        // Start initial timer
        resetIdle();

        return () => {
            events.forEach(e => window.removeEventListener(e, resetIdle));
            clearTimers();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive]);

    const stayLoggedIn = useCallback(() => {
        clearTimers();
        setShowWarning(false);
        setCountdown(WARN_SECONDS);
        resetIdle();
    }, [clearTimers, resetIdle]);

    return { showWarning, countdown, stayLoggedIn };
}
