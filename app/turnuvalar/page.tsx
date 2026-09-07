
import { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import TournamentTabs from './TournamentTabs';

export const metadata: Metadata = {
  title: 'Turnuvalar | Teta League',
  description: 'Teta League\'in en prestijli turnuvalarını ve efsaneleşmiş kazananlarını keşfet.',
};

export const revalidate = 0;

export default async function TurnuvalarPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: tournamentsData },
    { data: winnersData },
    { data: applicationsData },
    { data: profilesData }
  ] = await Promise.all([
    supabase.from('tournaments').select('*, seasons(name)').order('created_at', { ascending: false }),
    supabase.from('tournament_winners').select('*, profiles(username, avatar_url), teams(name, logo_url), tournament_applications(team_name, logo_url)').order('placement', { ascending: true }),
    supabase.from('tournament_applications').select('id, tournament_id, applicant_id, status').neq('status', 'REJECTED'),
    supabase.from('profiles').select('id, username, avatar_url').order('username', { ascending: true })
  ]);

  const tData = tournamentsData || [];
  const wData = winnersData || [];
  const aData = applicationsData || [];
  const pData = profilesData || [];

  return (
    <div className='mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16'>
      <div className='mb-12 md:mb-16 text-center fade-in-up flex flex-col items-center'>
        <span className='text-[#00e5ff] text-[11px] font-[900] tracking-[0.3em] uppercase bg-[#00e5ff]/10 px-4 py-1.5 rounded-full border border-[#00e5ff]/30 mb-6 glow-cyan-strong shadow-[0_0_20px_rgba(0,229,255,0.2)]'>
          Teta League Tournament Hub
        </span>
        <h1 className='text-[42px] md:text-[64px] font-[900] text-white tracking-widest uppercase mb-4 drop-shadow-[0_0_15px_rgba(0,229,255,0.4)] leading-tight'>
          TURNUVALAR
        </h1>
        <p className='text-[#a0b0c0] font-medium max-w-2xl mx-auto text-[15px] md:text-[17px] leading-relaxed'>
          Teta League'in en prestijli turnuvalarını ve efsaneleşmiş kazananlarını keşfet.
        </p>
      </div>

      <div className='fade-in-up' style={{ animationDelay: '0.2s' }}>
        <TournamentTabs 
          tournaments={tData} 
          winners={wData} 
          applications={aData} 
          profiles={pData} 
          currentUser={user} 
        />
      </div>
    </div>
  );
}

