import { useEffect, useRef } from 'react';

type ShortcutHandler = () => void;

interface ShortcutMap {
    [key: string]: ShortcutHandler;
}

/**
 * Global Keyboard Shortcut Hook
 * Uses a ref to hold the latest shortcuts so the event listener
 * is only added/removed ONCE, preventing listener accumulation.
 */
export const useKeyboardShortcuts = (shortcuts: ShortcutMap) => {
    // Always hold the latest shortcuts without re-registering the listener
    const shortcutsRef = useRef<ShortcutMap>(shortcuts);
    shortcutsRef.current = shortcuts;

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const latestShortcuts = shortcutsRef.current;

            // Check if user is typing in an input/textarea
            const target = event.target as HTMLElement;
            const isInput =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;

            // Esc should always work to close modals even if in input
            if (event.key === 'Escape') {
                if (latestShortcuts['Escape']) {
                    latestShortcuts['Escape']();
                }
                return;
            }

            // Other shortcuts shouldn't trigger if user is typing
            if (isInput) return;

            // Check combinations
            let keyStr = '';
            if (event.ctrlKey) keyStr += 'Ctrl+';
            if (event.altKey) keyStr += 'Alt+';
            if (event.shiftKey) keyStr += 'Shift+';
            keyStr += event.key;

            if (latestShortcuts[keyStr]) {
                event.preventDefault();
                latestShortcuts[keyStr]();
            } else if (latestShortcuts[event.key]) {
                event.preventDefault();
                latestShortcuts[event.key]();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []); // Empty deps — register listener ONCE, refs stay current
};
