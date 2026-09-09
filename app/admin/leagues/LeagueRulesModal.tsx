'use client';

import { useState, useRef } from 'react';
import {
  X,
  Loader2,
  Save,
  BookOpen,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { saveLeagueRulesAction } from './actions';
import { useRouter } from 'next/navigation';
import LeagueRulesViewer, { extractRulesText } from '@/components/LeagueRulesViewer';

const MAX_CHARS = 10000;

interface HelpCardItem {
  id: string;
  syntax: string;
  description: string;
  snippet: string;
}

const HELP_CARDS: HelpCardItem[] = [
  { id: 'h1', syntax: '# Başlık', description: 'Ana başlık', snippet: '\n# Başlık\n' },
  { id: 'h2', syntax: '## Alt başlık', description: 'Bölüm başlığı', snippet: '\n## Alt Başlık\n' },
  { id: 'h3', syntax: '### Bölüm', description: 'Alt bölüm başlığı', snippet: '\n### Bölüm Başlığı\n' },
  { id: 'ul', syntax: '- Madde', description: 'Madde listesi', snippet: '\n- Madde 1\n- Madde 2\n' },
  { id: 'ol', syntax: '1. Madde', description: 'Numaralı liste', snippet: '\n1. Birinci madde\n2. İkinci madde\n' },
  { id: 'bold', syntax: '**kalın**', description: 'Vurgulu metin', snippet: '**kalın metin**' },
  { id: 'italic', syntax: '*italik*', description: 'İkincil vurgu', snippet: '*italik metin*' },
  { id: 'code', syntax: '`kod`', description: 'Kısa kod veya terim', snippet: '`kod veya terim`' },
  { id: 'link', syntax: '[metin](https://...)', description: 'Dış bağlantı', snippet: '[bağlantı metni](https://...)' },
  { id: 'quote', syntax: '> Not', description: 'Uyarı veya not kutusu', snippet: '\n> Not: Buraya açıklama yazınız.\n' },
];

export function LeagueRulesModal({ league, onClose }: { league: any, onClose: () => void }) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rulesText, setRulesText] = useState(() => extractRulesText(league.rules));

  const insertSnippet = (snippet: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setRulesText(prev => (prev ? prev + '\n' + snippet : snippet));
      return;
    }

    const start = textarea.selectionStart ?? rulesText.length;
    const end = textarea.selectionEnd ?? rulesText.length;
    const before = rulesText.substring(0, start);
    const after = rulesText.substring(end);
    const selected = rulesText.substring(start, end);

    let textToInsert = snippet;
    if (selected) {
      if (snippet.startsWith('**') && snippet.endsWith('**')) {
        textToInsert = `**${selected}**`;
      } else if (snippet.startsWith('*') && snippet.endsWith('*')) {
        textToInsert = `*${selected}*`;
      } else if (snippet.startsWith('`') && snippet.endsWith('`')) {
        textToInsert = `\`${selected}\``;
      } else if (snippet.startsWith('[') && snippet.includes('](')) {
        textToInsert = `[${selected}](https://...)`;
      } else if (snippet.trim().startsWith('>')) {
        textToInsert = `\n> ${selected}\n`;
      }
    }

    const newText = before + textToInsert + after;
    if (newText.length > MAX_CHARS) return;

    setRulesText(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursor = start + textToInsert.length;
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');

    const res = await saveLeagueRulesAction(league.id, { text: rulesText.trim() });
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      router.refresh();
      onClose();
    }
  };

  const isNearLimit = rulesText.length > MAX_CHARS * 0.9;
  const isOverLimit = rulesText.length >= MAX_CHARS;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md overflow-y-auto'>
      <div className='card-surface w-full max-w-6xl xl:max-w-7xl my-auto rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[92vh] bg-[#03070c] shadow-2xl'>
        {/* Header */}
        <div className='p-5 md:p-6 border-b border-white/5 flex items-center justify-between bg-[#0a1628] shrink-0'>
          <div className='flex items-center gap-3'>
            <div className='w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 shadow-inner'>
              <BookOpen className='w-5 h-5' />
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h2 className='text-base sm:text-lg font-black text-white uppercase tracking-widest'>{league.name}</h2>
                <span className='px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-widest'>
                  Markdown
                </span>
              </div>
              <p className='text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5'>
                Lig Kurallarını Yönet ve Canlı Önizle
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-colors hover:text-cyan-400'
            aria-label='Kapat'
          >
            <X className='w-5 h-5'/>
          </button>
        </div>

        {/* Main Body */}
        <div className='p-5 md:p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#050a12]'>
          {error && (
            <div className='p-4 mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-xl'>
              {error}
            </div>
          )}

          {/* 2-Column Responsive Layout */}
          <div className='grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px] gap-6'>

            {/* LEFT COLUMN: Editor + Live Preview */}
            <div className='space-y-5 min-w-0'>

              {/* Top Editor Container */}
              <div className='bg-[#03070c] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3'>
                {/* Editor Header with Toolbar & Counter */}
                <div className='flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5'>
                  <div className='flex items-center gap-2'>
                    <label className='text-xs font-black text-white tracking-widest uppercase flex items-center gap-1.5'>
                      <Sparkles className='w-3.5 h-3.5 text-cyan-400' />
                      Topluluk Kuralları Metni
                    </label>
                  </div>

                  {/* Quick Toolbar */}
                  <div className='flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5 overflow-x-auto custom-scrollbar'>
                    <button
                      type='button'
                      onClick={() => insertSnippet('\n# ')}
                      title='Başlık 1 (#)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <Heading1 className='w-4 h-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => insertSnippet('\n## ')}
                      title='Başlık 2 (##)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <Heading2 className='w-4 h-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => insertSnippet('\n### ')}
                      title='Başlık 3 (###)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <Heading3 className='w-4 h-4' />
                    </button>
                    <div className='w-px h-4 bg-white/10 mx-0.5' />
                    <button
                      type='button'
                      onClick={() => insertSnippet('**kalın metin**')}
                      title='Kalın (**metin**)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <Bold className='w-4 h-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => insertSnippet('*italik metin*')}
                      title='İtalik (*metin*)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <Italic className='w-4 h-4' />
                    </button>
                    <div className='w-px h-4 bg-white/10 mx-0.5' />
                    <button
                      type='button'
                      onClick={() => insertSnippet('\n- ')}
                      title='Madde Listesi (-)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <List className='w-4 h-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => insertSnippet('\n1. ')}
                      title='Numaralı Liste (1.)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <ListOrdered className='w-4 h-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => insertSnippet('\n> ')}
                      title='Not / Alıntı (>)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <Quote className='w-4 h-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => insertSnippet('`terim`')}
                      title='Kod (`kod`)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <Code className='w-4 h-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => insertSnippet('[metin](https://...)')}
                      title='Bağlantı [metin](url)'
                      className='p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-cyan-400 transition-colors'
                    >
                      <Link2 className='w-4 h-4' />
                    </button>
                  </div>

                  {/* Character Counter */}
                  <div className='flex items-center gap-1.5 font-mono text-xs'>
                    <span className={isOverLimit ? 'text-red-400 font-bold' : isNearLimit ? 'text-amber-400 font-bold' : 'text-zinc-400'}>
                      {rulesText.length}
                    </span>
                    <span className='text-zinc-600'>/</span>
                    <span className='text-zinc-500'>{MAX_CHARS.toLocaleString('tr-TR')}</span>
                  </div>
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={rulesText}
                  onChange={e => setRulesText(e.target.value)}
                  maxLength={MAX_CHARS}
                  className='w-full h-64 sm:h-72 bg-black/60 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-cyan-500 outline-none resize-none font-mono leading-relaxed placeholder:text-zinc-600 custom-scrollbar selection:bg-cyan-500/30'
                  placeholder={`# TETA LEAGUE KURAL KİTAPÇIĞI\n\n## 1. ZORUNLU BİLDİRİM\n\n- Tüm kaptanlar sezon başlamadan önce kuralları okumak zorundadır.\n- Kurallar kabul edilmiş sayılır.\n\n### 1.1 Takım Gereksinimleri\n\n1. Minimum kadro boyutu 8 oyuncudur.\n2. Maksimum kadro 25 oyuncudur.\n\n**Önemli:** Kurallara aykırı davranışlarda ceza uygulanabilir.\n\n> Not: Yönetim gerekli gördüğünde kuralları güncelleyebilir.`}
                />
              </div>

              {/* Bottom Live Preview Container */}
              <div className='bg-[#03070c] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3'>
                <div className='flex items-center justify-between pb-3 border-b border-white/5'>
                  <div className='flex items-center gap-2'>
                    <Eye className='w-4 h-4 text-cyan-400' />
                    <h3 className='text-xs font-black text-white tracking-widest uppercase'>
                      CANLI ÖNİZLEME
                    </h3>
                  </div>
                  <div className='flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider'>
                    <span className='w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse' />
                    Anlık Render
                  </div>
                </div>

                {/* Rendered Preview Box */}
                <div className='h-72 sm:h-80 overflow-y-auto custom-scrollbar p-5 bg-black/40 border border-white/5 rounded-xl'>
                  <LeagueRulesViewer
                    rules={{ text: rulesText }}
                    leagueName={league.name}
                    isPreview
                  />
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: Markdown Kullanımı (Help Panel) */}
            <div className='bg-[#03070c] border border-white/5 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 shrink-0 h-fit lg:sticky lg:top-0 shadow-xl'>
              <div className='pb-3 border-b border-white/5'>
                <div className='flex items-center gap-2'>
                  <HelpCircle className='w-4 h-4 text-cyan-400' />
                  <h3 className='text-xs font-black text-white tracking-widest uppercase'>
                    Markdown kullanımı
                  </h3>
                </div>
                <p className='text-[11px] text-zinc-400 mt-1 font-medium'>
                  Tıklayarak doğrudan metne ekleyebilirsiniz
                </p>
              </div>

              {/* Syntax Cheat Sheet Cards */}
              <div className='space-y-2'>
                {HELP_CARDS.map((card) => (
                  <button
                    key={card.id}
                    type='button'
                    onClick={() => insertSnippet(card.snippet)}
                    className='w-full text-left p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/40 hover:bg-cyan-500/[0.04] transition-all group cursor-pointer flex flex-col gap-0.5'
                  >
                    <div className='flex items-center justify-between'>
                      <code className='text-xs font-mono font-bold text-cyan-400 bg-white/5 px-2 py-0.5 rounded group-hover:bg-cyan-500/10 transition-colors'>
                        {card.syntax}
                      </code>
                      <span className='text-[10px] text-zinc-500 group-hover:text-cyan-400 transition-colors font-bold'>
                        Ekle +
                      </span>
                    </div>
                    <span className='text-[11px] text-zinc-400 font-medium pl-0.5'>
                      {card.description}
                    </span>
                  </button>
                ))}
              </div>

              <div className='mt-2 p-3 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/20 text-[11px] text-zinc-400 leading-relaxed'>
                💡 <span className='text-zinc-200 font-bold'>İpucu:</span> Metin seçip kartlardan birine tıklarsanız, seçili metin otomatik olarak o syntax içine alınır.
              </div>
            </div>

          </div>
        </div>

        {/* Footer Actions */}
        <div className='p-4 sm:p-6 border-t border-white/5 bg-[#0a1628] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0'>
          <p className='text-[11px] text-zinc-500 font-medium text-center sm:text-left'>
            🔒 Değişiklikler <span className='text-zinc-400 font-bold'>Kaydet</span> butonuna basılana kadar yayınlanmaz.
          </p>
          <div className='flex items-center gap-3 w-full sm:w-auto justify-end'>
            <button
              type='button'
              onClick={onClose}
              className='flex-1 sm:flex-initial px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-colors'
            >
              İPTAL
            </button>
            <button
              type='button'
              onClick={handleSave}
              disabled={loading || isOverLimit}
              className='flex-1 sm:flex-initial px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-cyan-500/20'
            >
              {loading ? <Loader2 className='w-4 h-4 animate-spin' /> : <Save className='w-4 h-4' />}
              KAYDET
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
