'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { User, Loader2, AtSign } from 'lucide-react';
import { searchPlayersForMentionAction } from '@/app/admin/news/actions';

interface PlayerMentionResult {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface MentionTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onValueChange?: (val: string) => void;
}

export default function MentionTextarea({
  name,
  defaultValue = '',
  value,
  onChange,
  onValueChange,
  placeholder,
  rows = 4,
  required,
  className = '',
  ...props
}: MentionTextareaProps) {
  const [internalValue, setInternalValue] = useState<string>(
    typeof value === 'string' ? value : typeof defaultValue === 'string' ? defaultValue : ''
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Mention autocomplete state
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerMentionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);

  // Sync external value
  useEffect(() => {
    if (typeof value === 'string') {
      setInternalValue(value);
    }
  }, [value]);

  // Check mention cursor position
  const checkMentionAtCursor = useCallback((text: string, cursorPosition: number) => {
    const textBeforeCursor = text.slice(0, cursorPosition);
    // Find @ followed by letters/numbers/underscore immediately before cursor
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);

    if (match) {
      const matchText = match[0];
      const q = match[1];
      const atPos = match.index! + (matchText.startsWith(' ') || matchText.startsWith('\n') ? 1 : 0);
      setMentionStartIndex(atPos);
      setQuery(q);
      setIsOpen(true);
      setSelectedIndex(0);
    } else {
      setIsOpen(false);
      setMentionStartIndex(null);
      setQuery('');
    }
  }, []);

  // Fetch mention search results
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await searchPlayersForMentionAction(query);
        if (active) {
          if (res.data) {
            setResults(res.data);
          } else {
            setResults([]);
          }
          setSelectedIndex(0);
        }
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, query]);

  // Handle textarea change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInternalValue(newVal);
    checkMentionAtCursor(newVal, cursorPos);

    if (onChange) onChange(e);
    if (onValueChange) onValueChange(newVal);
  };

  // Insert selected mention
  const handleSelectPlayer = (player: PlayerMentionResult) => {
    if (mentionStartIndex === null || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const before = internalValue.slice(0, mentionStartIndex);
    const after = internalValue.slice(cursorPos);
    const inserted = `@${player.username} `;
    const updated = before + inserted + after;
    const newCursor = before.length + inserted.length;

    setInternalValue(updated);
    setIsOpen(false);
    setMentionStartIndex(null);
    setQuery('');

    if (onValueChange) onValueChange(updated);

    // Refocus and place cursor right after the mention
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  // Keyboard navigation inside dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isOpen && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectPlayer(results[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }
    }

    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
  };

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        name={name}
        value={internalValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          checkMentionAtCursor(e.currentTarget.value, e.currentTarget.selectionStart);
        }}
        onClick={(e) => {
          checkMentionAtCursor(e.currentTarget.value, e.currentTarget.selectionStart);
        }}
        rows={rows}
        placeholder={placeholder}
        required={required}
        className={className}
        {...props}
      />

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div className="absolute left-0 bottom-full mb-1 w-full max-w-sm bg-[#060d18] border border-[#00e5ff]/30 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.9)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-3 py-2 bg-[#0a1628] border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#00e5ff]">
              <AtSign className="w-3.5 h-3.5" />
              <span>Oyuncu Etiketle</span>
            </div>
            {loading && <Loader2 className="w-3.5 h-3.5 text-[#00e5ff] animate-spin" />}
          </div>

          <div className="max-h-52 overflow-y-auto divide-y divide-white/5">
            {results.length === 0 && !loading ? (
              <div className="p-3 text-xs text-gray-500 text-center">
                Eşleşen oyuncu bulunamadı.
              </div>
            ) : (
              results.map((player, idx) => (
                <button
                  key={player.id}
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent blur before click executes
                    e.preventDefault();
                    handleSelectPlayer(player);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center gap-2.5 transition-colors ${
                    idx === selectedIndex ? 'bg-[#00e5ff]/15 text-white' : 'hover:bg-white/5 text-gray-300'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-black/40 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                    {player.avatar_url ? (
                      <img src={player.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-3.5 h-3.5 text-gray-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-[#00e5ff]">@{player.username}</span>
                    {player.full_name && (
                      <span className="text-[11px] text-gray-400 ml-2 truncate">({player.full_name})</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
