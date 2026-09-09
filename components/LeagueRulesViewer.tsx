'use client';

import React from 'react';

interface Props {
  rules: any;
  leagueName?: string;
  seasonName?: string;
  isPreview?: boolean;
}

export function extractRulesText(rules: any): string {
  if (!rules) return '';
  if (typeof rules === 'string') return rules.trim();
  if (typeof rules === 'object') {
    if (typeof rules.text === 'string' && rules.text.trim()) return rules.text.trim();
    if (typeof rules.raw_text === 'string' && rules.raw_text.trim()) return rules.raw_text.trim();
    
    // Legacy structured object support
    const parts: string[] = [];
    if (rules.description) parts.push(`GENEL AÇIKLAMA\n\n${rules.description}`);
    if (Array.isArray(rules.participation) && rules.participation.length) {
      parts.push(`KATILIM ŞARTLARI\n\n${rules.participation.map((r: string) => `- ${r}`).join('\n')}`);
    }
    if (Array.isArray(rules.match_rules) && rules.match_rules.length) {
      parts.push(`MAÇ KURALLARI\n\n${rules.match_rules.map((r: string) => `- ${r}`).join('\n')}`);
    }
    if (rules.points && (rules.points.win !== undefined || rules.points.draw !== undefined)) {
      parts.push(`PUANLAMA SİSTEMİ\n\n- Galibiyet: ${rules.points.win ?? 3} Puan\n- Beraberlik: ${rules.points.draw ?? 1} Puan\n- Mağlubiyet: ${rules.points.loss ?? 0} Puan`);
    }
    if (rules.promotion_relegation) parts.push(`YÜKSELME / KÜME DÜŞME\n\n${rules.promotion_relegation}`);
    if (Array.isArray(rules.additional_rules) && rules.additional_rules.length) {
      parts.push(`EK KURALLAR\n\n${rules.additional_rules.map((r: string) => `- ${r}`).join('\n')}`);
    }
    return parts.join('\n\n');
  }
  return '';
}

// ── Safe Inline Markdown Parser ──────────────────────────────────────────
export function renderInline(text: string): React.ReactNode[] {
  if (!text) return [];

  // Tokens: [text](url), **bold**, *italic*, `code`
  const regex = /(\[.*?\]\(https?:\/\/[^\s\)]+\)|\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // 1. Code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const codeContent = part.slice(1, -1);
      return (
        <code
          key={index}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-white/10 text-[#00e5ff] font-mono text-[12px] sm:text-[13px] border border-white/10"
        >
          {codeContent}
        </code>
      );
    }

    // 2. Bold
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const boldContent = part.slice(2, -2);
      return (
        <strong key={index} className="font-black text-white">
          {boldContent}
        </strong>
      );
    }

    // 3. Italic
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const italicContent = part.slice(1, -1);
      return (
        <em key={index} className="italic text-gray-200">
          {italicContent}
        </em>
      );
    }

    // 4. Link [text](url) - strictly validate http/https to prevent javascript: or data: injection
    const linkMatch = part.match(/^\[(.*?)\]\((https?:\/\/[^\s\)]+)\)$/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const linkUrl = linkMatch[2];
      if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
        return (
          <a
            key={index}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00e5ff] hover:underline underline-offset-4 inline-flex items-center gap-1 font-bold transition-colors"
          >
            {linkText || linkUrl}
            <span className="text-[10px] opacity-70">↗</span>
          </a>
        );
      }
    }

    // Plain text
    return <span key={index}>{part}</span>;
  }).filter(Boolean);
}

// ── Document & Block Structure ───────────────────────────────────────────
export type RuleBlock =
  | { type: 'h3'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; text: string };

export interface RuleSection {
  title?: string;
  blocks: RuleBlock[];
}

export interface RuleDocument {
  title: string | null;
  sections: RuleSection[];
}

export function parseRulesDocument(raw: string): RuleDocument {
  if (!raw || !raw.trim()) return { title: null, sections: [] };

  const lines = raw.split(/\r?\n/);
  let docTitle: string | null = null;
  const sections: RuleSection[] = [];
  let currentSection: RuleSection = { blocks: [] };

  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let currentQuote: string[] = [];
  let currentParagraph: string[] = [];

  const flushList = () => {
    if (currentList && currentList.items.length > 0) {
      currentSection.blocks.push({ type: currentList.type, items: [...currentList.items] });
      currentList = null;
    }
  };

  const flushQuote = () => {
    if (currentQuote.length > 0) {
      currentSection.blocks.push({ type: 'quote', text: currentQuote.join('\n') });
      currentQuote = [];
    }
  };

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      currentSection.blocks.push({ type: 'p', text: currentParagraph.join('\n') });
      currentParagraph = [];
    }
  };

  const flushAllBlocks = () => {
    flushList();
    flushQuote();
    flushParagraph();
  };

  const flushSection = () => {
    flushAllBlocks();
    if (currentSection.title || currentSection.blocks.length > 0) {
      sections.push(currentSection);
      currentSection = { blocks: [] };
    }
  };

  const isLegacyHeader = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed.length < 3 || trimmed.length > 70) return false;
    if (/^#{1,3}\s+/.test(trimmed)) return false;
    if (/^[-*•]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) return false;
    const hasLetters = /[A-ZÇĞİÖŞÜa-zçğıöşü]/.test(trimmed);
    if (!hasLetters) return false;
    const hasLowercase = /[a-zçğıöşü]/.test(trimmed);
    return !hasLowercase;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushAllBlocks();
      continue;
    }

    // 1. Check H1 (# Title)
    if (/^#\s+/.test(trimmed)) {
      flushSection();
      const h1Text = trimmed.replace(/^#\s+/, '').trim();
      if (!docTitle) {
        docTitle = h1Text;
      } else {
        currentSection.title = h1Text;
      }
      continue;
    }

    // 2. Check H2 (## Title) or Legacy Uppercase Header
    if (/^##\s+/.test(trimmed)) {
      flushSection();
      const h2Text = trimmed.replace(/^##\s+/, '').trim();
      currentSection.title = h2Text;
      continue;
    }

    if (isLegacyHeader(trimmed)) {
      flushSection();
      currentSection.title = trimmed;
      continue;
    }

    // 3. Check H3 (### Title)
    if (/^###\s+/.test(trimmed)) {
      flushAllBlocks();
      const h3Text = trimmed.replace(/^###\s+/, '').trim();
      currentSection.blocks.push({ type: 'h3', text: h3Text });
      continue;
    }

    // 4. Check Blockquote (> Quote)
    if (/^>\s*/.test(trimmed)) {
      flushList();
      flushParagraph();
      const quoteContent = trimmed.replace(/^>\s*/, '');
      currentQuote.push(quoteContent);
      continue;
    }

    // 5. Check Unordered List (- item, * item, • item)
    if (/^[-*•]\s+/.test(trimmed)) {
      flushQuote();
      flushParagraph();
      const itemText = trimmed.replace(/^[-*•]\s+/, '').trim();
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(itemText);
      continue;
    }

    // 6. Check Ordered List (1. item, 2. item)
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushQuote();
      flushParagraph();
      const itemText = trimmed.replace(/^\d+[.)]\s+/, '').trim();
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(itemText);
      continue;
    }

    // 7. Normal paragraph line
    flushList();
    flushQuote();
    currentParagraph.push(trimmed);
  }

  flushSection();

  return { title: docTitle, sections };
}

// Backward compatibility helper
export function parseRulesText(raw: string) {
  const doc = parseRulesDocument(raw);
  return doc.sections.map(sec => ({
    title: sec.title,
    items: sec.blocks.map(b => {
      if (b.type === 'ul' || b.type === 'ol') {
        return { type: 'list' as const, content: b.items };
      }
      return { type: 'paragraph' as const, content: 'text' in b ? b.text : '' };
    })
  }));
}

// ── Main Component ───────────────────────────────────────────────────────
export default function LeagueRulesViewer({ rules, leagueName, seasonName, isPreview = false }: Props) {
  const text = extractRulesText(rules);
  const doc = parseRulesDocument(text);

  if (!text || (doc.sections.length === 0 && !doc.title)) {
    return (
      <div className={`bg-[#03070c] border border-white/5 rounded-2xl ${isPreview ? 'p-6' : 'p-10 sm:p-16'} text-center max-w-3xl mx-auto`}>
        <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-2xl shadow-inner">
          ⚖️
        </div>
        <h3 className="text-sm sm:text-base font-black text-white tracking-widest uppercase mb-2">
          LİG KURALLARI
        </h3>
        <p className="text-xs sm:text-sm text-gray-400 max-w-sm mx-auto font-medium">
          Henüz lig kuralları eklenmedi.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 max-w-4xl mx-auto ${isPreview ? '!max-w-none' : ''}`}>
      {/* Document Title Banner (from # H1) */}
      {doc.title && (
        <div className="bg-[#03070c] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#00e5ff]/5 blur-[80px] pointer-events-none" />
          <span className="text-[10px] font-black text-[#00e5ff] tracking-[0.25em] uppercase px-3 py-1 bg-[#00e5ff]/10 border border-[#00e5ff]/20 rounded-full inline-block mb-3">
            KURAL KİTAPÇIĞI
          </span>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white uppercase tracking-wider">
            {renderInline(doc.title)}
          </h1>
          {seasonName && (
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">
              {seasonName}
            </p>
          )}
        </div>
      )}

      {/* Sections */}
      {doc.sections.map((sec, sIdx) => (
        <section 
          key={sIdx} 
          className="bg-[#03070c] border border-white/5 rounded-2xl p-6 sm:p-8 transition-all hover:border-white/10 shadow-lg"
        >
          {sec.title && (
            <div className="flex items-center gap-3 pb-3 mb-5 border-b border-white/5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.6)] shrink-0" />
              <h2 className="text-sm sm:text-base md:text-lg font-black text-white tracking-widest uppercase">
                {renderInline(sec.title)}
              </h2>
            </div>
          )}

          <div className="space-y-4">
            {sec.blocks.map((block, bIdx) => {
              if (block.type === 'h3') {
                return (
                  <h3
                    key={bIdx}
                    className="text-sm sm:text-[15px] font-bold text-gray-200 tracking-wide uppercase pt-3 pb-1 border-b border-white/5 flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-sm bg-[#00e5ff]/70 shrink-0" />
                    {renderInline(block.text)}
                  </h3>
                );
              }

              if (block.type === 'ul') {
                return (
                  <ul key={bIdx} className="space-y-2 pl-5 list-disc marker:text-[#00e5ff] text-gray-300 text-sm leading-relaxed">
                    {block.items.map((it, iIdx) => (
                      <li key={iIdx} className="pl-1">
                        {renderInline(it)}
                      </li>
                    ))}
                  </ul>
                );
              }

              if (block.type === 'ol') {
                return (
                  <ol key={bIdx} className="space-y-2 pl-5 list-decimal marker:text-[#00e5ff] marker:font-bold text-gray-300 text-sm leading-relaxed">
                    {block.items.map((it, iIdx) => (
                      <li key={iIdx} className="pl-1">
                        {renderInline(it)}
                      </li>
                    ))}
                  </ol>
                );
              }

              if (block.type === 'quote') {
                return (
                  <blockquote
                    key={bIdx}
                    className="border-l-4 border-[#00e5ff] bg-[#00e5ff]/[0.06] rounded-r-xl p-4 my-3 text-sm text-cyan-100 font-medium leading-relaxed flex items-start gap-3"
                  >
                    <span className="text-base leading-none shrink-0 mt-0.5">📌</span>
                    <div className="space-y-1">
                      {renderInline(block.text)}
                    </div>
                  </blockquote>
                );
              }

              return (
                <p key={bIdx} className="text-gray-300 text-sm sm:text-[15px] leading-relaxed whitespace-pre-line">
                  {renderInline(block.text)}
                </p>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
