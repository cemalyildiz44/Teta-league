'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Site-styled replacements for window.confirm() and window.alert():
//   const confirm = useConfirm();  if (!(await confirm({ message: '...' }))) return;
//   const toast = useToast();      toast.success('Kaydedildi'); toast.error(res.error);

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions (delete, leave, remove). */
  danger?: boolean;
}

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface Feedback {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: { success: (text: string) => void; error: (text: string) => void; info: (text: string) => void };
}

const FeedbackContext = createContext<Feedback | null>(null);

const TOAST_MS = 5000;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const confirmButton = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setDialog({ ...options, resolve });
      }),
    []
  );

  const close = useCallback(
    (ok: boolean) => {
      dialog?.resolve(ok);
      setDialog(null);
      returnFocus.current?.focus?.();
    },
    [dialog]
  );

  // Escape cancels; Tab stays inside the dialog; focus starts on the safe choice (cancel) for destructive actions
  useEffect(() => {
    if (!dialog) return;
    (dialog.danger ? cancelButton : confirmButton).current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      } else if (event.key === 'Tab') {
        const buttons = [cancelButton.current, confirmButton.current].filter(Boolean) as HTMLButtonElement[];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const value = useMemo<Feedback>(
    () => ({
      confirm,
      toast: {
        success: (text) => push('success', text),
        error: (text) => push('error', text),
        info: (text) => push('info', text),
      },
    }),
    [confirm, push]
  );

  const toastStyle: Record<ToastKind, string> = {
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    error: 'border-red-500/40 bg-red-500/10 text-red-300',
    info: 'border-[#00e5ff]/40 bg-[#00e5ff]/10 text-[#00e5ff]',
  };

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {dialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => close(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            aria-describedby="feedback-message"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#060d18] p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] fade-in-up"
          >
            <h2 id="feedback-title" className="text-base font-[900] text-white tracking-wide uppercase mb-2">
              {dialog.title || 'Emin misiniz?'}
            </h2>
            <p id="feedback-message" className="text-sm text-gray-300 leading-relaxed mb-6 whitespace-pre-line">
              {dialog.message}
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                ref={cancelButton}
                type="button"
                onClick={() => close(false)}
                className="min-h-[44px] sm:min-h-0 px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10 transition-colors"
              >
                {dialog.cancelLabel || 'Vazgeç'}
              </button>
              <button
                ref={confirmButton}
                type="button"
                onClick={() => close(true)}
                className={`min-h-[44px] sm:min-h-0 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors ${
                  dialog.danger
                    ? 'bg-red-500 text-white hover:bg-red-400'
                    : 'bg-[#00e5ff] text-[#050a0f] hover:bg-[#7fffd4]'
                }`}
              >
                {dialog.confirmLabel || 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] flex w-[calc(100%-2rem)] max-w-md flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-bold backdrop-blur-md shadow-lg fade-in-up ${toastStyle[t.kind]}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

function useFeedback(): Feedback {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useConfirm/useToast must be used inside <FeedbackProvider>');
  return ctx;
}

export const useConfirm = () => useFeedback().confirm;
export const useToast = () => useFeedback().toast;
