'use client';

import { useEffect, useState } from 'react';

const tabs = [
  { id: 'genel', label: 'GENEL' },
  { id: 'maclar', label: 'MAÇLAR' },
  { id: 'sezonlar', label: 'SEZONLAR' },
  { id: 'kariyer', label: 'KARİYER' },
  { id: 'basarilar', label: 'BAŞARILAR' },
];

export default function ProfileTabs({
  genel,
  maclar,
  sezonlar,
  kariyer,
  basarilar,
}: {
  genel: React.ReactNode;
  maclar: React.ReactNode;
  sezonlar: React.ReactNode;
  kariyer: React.ReactNode;
  basarilar: React.ReactNode;
}) {
  const [active, setActive] = useState('genel');

  // Honour shared links such as ?tab=maclar. Read after mount: the page is cached and identical for every visitor.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    if (fromUrl && tabs.some((t) => t.id === fromUrl)) setActive(fromUrl);
  }, []);

  // Switch instantly on the client and keep the URL shareable without a server round trip
  const selectTab = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === 'genel') url.searchParams.delete('tab');
    else url.searchParams.set('tab', id);
    window.history.replaceState(window.history.state, '', url);
  };

  return (
    <div className="mt-8">
      {/* Tab Navigation */}
      <nav className="sticky top-[60px] z-40 bg-[#01060b]/95 backdrop-blur-md border-b border-white/10 -mx-4 lg:-mx-6 px-4 lg:px-6 mb-6">
        <div className="flex gap-1 md:gap-2 overflow-x-auto custom-scrollbar py-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-pressed={active === tab.id}
              className={`px-4 py-4 text-[11px] font-[900] tracking-widest uppercase whitespace-nowrap transition-all duration-150 active:scale-[0.98] border-b-2 ${
                active === tab.id
                  ? 'text-[#00e5ff] border-[#00e5ff] bg-[#00e5ff]/5 drop-shadow-[0_0_8px_rgba(0,229,255,0.3)]'
                  : 'text-gray-500 hover:text-gray-300 border-transparent hover:border-white/20'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab Contents with smooth fade-in */}
      <div key={active} className="tab-pane-enter">
        {active === 'genel' && genel}
        {active === 'maclar' && maclar}
        {active === 'sezonlar' && sezonlar}
        {active === 'kariyer' && kariyer}
        {active === 'basarilar' && basarilar}
      </div>
    </div>
  );
}
