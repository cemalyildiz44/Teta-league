'use client';

interface Props {
  rules: any;
  leagueName?: string;
  seasonName?: string;
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

interface ParsedSection {
  title?: string;
  items: Array<{ type: 'paragraph' | 'list'; content: string | string[] }>;
}

export function parseRulesText(raw: string): ParsedSection[] {
  if (!raw || !raw.trim()) return [];

  const lines = raw.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection = { items: [] };
  let currentParagraphLines: string[] = [];
  let currentListItems: string[] = [];

  const flushList = () => {
    if (currentListItems.length > 0) {
      currentSection.items.push({ type: 'list', content: [...currentListItems] });
      currentListItems = [];
    }
  };

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      currentSection.items.push({ type: 'paragraph', content: currentParagraphLines.join('\n') });
      currentParagraphLines = [];
    }
  };

  const flushSection = () => {
    flushList();
    flushParagraph();
    if (currentSection.title || currentSection.items.length > 0) {
      sections.push(currentSection);
      currentSection = { items: [] };
    }
  };

  // Helper to test if a line is an uppercase section header
  const isHeader = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed.length < 3 || trimmed.length > 70) return false;
    // Check if line starts with markdown header
    if (/^#{1,3}\s+/.test(trimmed)) return true;
    // Bullet or number cannot be a header
    if (/^[-*•]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) return false;
    // Must contain letters
    const hasLetters = /[A-ZÇĞİÖŞÜa-zçğıöşü]/.test(trimmed);
    if (!hasLetters) return false;
    // Must have NO lowercase letters (all uppercase)
    const hasLowercase = /[a-zçğıöşü]/.test(trimmed);
    return !hasLowercase;
  };

  const isListItem = (line: string): boolean => {
    const trimmed = line.trim();
    return /^[-*•]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed);
  };

  const cleanListItem = (line: string): string => {
    return line.trim().replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '').trim();
  };

  const cleanHeader = (line: string): string => {
    return line.trim().replace(/^#{1,3}\s+/, '').trim();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      // Empty line - flush ongoing block
      flushList();
      flushParagraph();
      continue;
    }

    if (isHeader(trimmed)) {
      flushSection();
      currentSection.title = cleanHeader(trimmed);
    } else if (isListItem(trimmed)) {
      flushParagraph();
      currentListItems.push(cleanListItem(trimmed));
    } else {
      flushList();
      currentParagraphLines.push(trimmed);
    }
  }

  flushSection();

  return sections;
}

export default function LeagueRulesViewer({ rules, leagueName, seasonName }: Props) {
  const text = extractRulesText(rules);
  const sections = parseRulesText(text);

  if (!text || sections.length === 0) {
    return (
      <div className="bg-[#03070c] border border-white/5 rounded-2xl p-10 sm:p-16 text-center max-w-3xl mx-auto">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-2xl shadow-inner">
          ⚖️
        </div>
        <h3 className="text-base sm:text-lg font-black text-white tracking-widest uppercase mb-2">
          LİG KURALLARI
        </h3>
        <p className="text-sm text-gray-400 max-w-sm mx-auto font-medium">
          Henüz lig kuralları eklenmedi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {sections.map((sec, sIdx) => (
        <section 
          key={sIdx} 
          className="bg-[#03070c] border border-white/5 rounded-2xl p-6 sm:p-8 transition-all hover:border-white/10 shadow-lg"
        >
          {sec.title && (
            <div className="flex items-center gap-3 pb-3 mb-5 border-b border-white/5">
              <span className="w-2 h-2 rounded-full bg-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.6)]" />
              <h3 className="text-sm sm:text-base font-black text-white tracking-widest uppercase">
                {sec.title}
              </h3>
            </div>
          )}

          <div className="space-y-4">
            {sec.items.map((item, iIdx) => {
              if (item.type === 'list' && Array.isArray(item.content)) {
                return (
                  <ul key={iIdx} className="space-y-2.5 pl-5 list-disc marker:text-[#00e5ff]/80 text-gray-300 text-sm leading-relaxed">
                    {item.content.map((li, lIdx) => (
                      <li key={lIdx} className="pl-1">
                        {li}
                      </li>
                    ))}
                  </ul>
                );
              }

              return (
                <p key={iIdx} className="text-gray-300 text-sm sm:text-[15px] leading-relaxed whitespace-pre-line">
                  {typeof item.content === 'string' ? item.content : ''}
                </p>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
