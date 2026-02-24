import { useEffect } from 'react';

type ShortcutHandler = () => void;

interface ShortcutMap {
    [key: string]: ShortcutHandler;
}

/**
 * Global Keyboard Shortcut Hook
 * @param shortcuts - Map of keys to handlers (e.g. { 'Escape': handleBack })
 */
export const useKeyboardShortcuts = (shortcuts: ShortcutMap) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Check if user is typing in an input/textarea
            const target = event.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            // Esc should always work to close modals even if in input
            if (event.key === 'Escape') {
                if (shortcuts['Escape']) {
                    shortcuts['Escape']();
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

            if (shortcuts[keyStr]) {
                event.preventDefault();
                shortcuts[keyStr]();
            } else if (shortcuts[event.key]) {
                // Also check single keys if no combo matched
                event.preventDefault();
                shortcuts[event.key]();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);
};
