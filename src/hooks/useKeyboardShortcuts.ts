import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

export type ShortcutAction = {
  /** Key to match (e.g. 'Escape', 'ArrowLeft', 'k', 'n', 'Delete') */
  key: string;
  /** Require Cmd (Mac) / Ctrl (Win) */
  cmdOrCtrl?: boolean;
  /** Require Shift */
  shift?: boolean;
  /** Handler */
  handler: () => void;
  /** Optional: only fire when no input is focused */
  ignoreWhenTyping?: boolean;
};

/**
 * Web-only keyboard shortcuts hook.
 * No-op on native platforms.
 *
 * Usage:
 * ```ts
 * useKeyboardShortcuts([
 *   { key: 'Escape', handler: () => closeModal() },
 *   { key: 'k', cmdOrCtrl: true, handler: () => openPalette() },
 *   { key: 'ArrowLeft', handler: () => prevDay(), ignoreWhenTyping: true },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(shortcuts: ShortcutAction[]) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const isTyping = target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    );

    for (const shortcut of shortcuts) {
      if (e.key !== shortcut.key) continue;

      if (shortcut.cmdOrCtrl && !(e.metaKey || e.ctrlKey)) continue;
      if (!shortcut.cmdOrCtrl && (e.metaKey || e.ctrlKey)) continue;

      if (shortcut.shift && !e.shiftKey) continue;

      if (shortcut.ignoreWhenTyping && isTyping) continue;

      // Escape should always work, even in inputs
      if (shortcut.key !== 'Escape' && shortcut.ignoreWhenTyping === undefined && isTyping) continue;

      e.preventDefault();
      shortcut.handler();
      return;
    }
  }, [shortcuts]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
