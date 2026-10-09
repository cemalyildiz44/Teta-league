'use client';

import React from 'react';
import { Trophy, Medal, Swords, Clock, CheckCircle2, Edit2, Sparkles, ChevronRight } from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';
import { getTournamentStageLabel } from '@/lib/tournament-engine';

interface TournamentKnockoutBracketProps {
  tournament: any;
  matches: any[];
  winners?: any[];
  isAdmin?: boolean;
  onEditMatch?: (match: any) => void;
}

export default function TournamentKnockoutBracket({
  tournament,
  matches,
  winners = [],
  isAdmin = false,
  onEditMatch,
}: TournamentKnockoutBracketProps) {
  // Filter knockout matches
  const knockoutMatches = matches.filter(
    (m) => m.stage && m.stage !== 'GROUP'
  );

  if (knockoutMatches.length === 0) {
    return (
      <div className="bg-[#0a1628]/80 border border-white/10 rounded-[2rem] p-8 md:p-12 backdrop-blur-md text-center max-w-2xl mx-auto space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
          <Trophy className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest bg-white/10 text-amber-400 border border-white/10">
            ELEME AŞAMASI BEKLENİYOR
          </span>
          <h3 className="text-2xl font-black text-white uppercase tracking-wider">
            Night Cup Eleme Ağacı (Bracket)
          </h3>
        </div>

        <p className="text-zinc-400 text-sm leading-relaxed">
          Grup aşaması maçları tamamlandıktan ve sonuçlar yönetici tarafından onaylandıktan sonra Şampiyonlar Ligi
          formatında çapraz eşleşmeli eleme ağacı burada aktif hale gelecektir.
        </p>
      </div>
    );
  }

  // Stages hierarchy
  const stageOrder = ['ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'];
  const presentStages = stageOrder.filter((stg) =>
    knockoutMatches.some((m) => m.stage === stg)
  );
  const thirdPlaceMatches = knockoutMatches.filter((m) => m.stage === 'THIRD_PLACE');

  // Determine champion and runner up from tournament_winners or Final match
  const finalMatch = knockoutMatches.find((m) => m.stage === 'FINAL');
  const winner1 = winners.find((w) => w.placement === 1);
  const winner2 = winners.find((w) => w.placement === 2);
  const winner3 = winners.find((w) => w.placement === 3);

  // If winner1 is missing from table, check if final match has winner
  const championTeam = winner1?.tournament_applications || (finalMatch?.winner_application_id
    ? (finalMatch.winner_application_id === finalMatch.home_application_id ? finalMatch.home : finalMatch.away)
    : null);

  const runnerUpTeam = winner2?.tournament_applications || (finalMatch?.winner_application_id
    ? (finalMatch.winner_application_id === finalMatch.home_application_id ? finalMatch.away : finalMatch.home)
    : null);

  const thirdPlaceMatch = thirdPlaceMatches[0];
  const thirdPlaceTeam = winner3?.tournament_applications || (thirdPlaceMatch?.winner_application_id
    ? (thirdPlaceMatch.winner_application_id === thirdPlaceMatch.home_application_id ? thirdPlaceMatch.home : thirdPlaceMatch.away)
    : null);

  return (
    <div className="space-y-8">
      {/* 1. CHAMPION SHOWCASE BANNER (IF FINAL COMPLETED OR WINNERS EXIST) */}
      {championTeam && (
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-amber-500/20 via-[#0a1628] to-purple-500/20 border-2 border-amber-500/40 p-6 md:p-8 shadow-[0_0_50px_rgba(245,158,11,0.2)]">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Left: Champion */}
            <div className="flex items-center gap-5 text-center md:text-left">
              <div className="relative">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 p-1 shadow-lg shadow-amber-500/30 flex items-center justify-center">
                  <div className="w-full h-full rounded-[1.3rem] bg-[#060d18] flex items-center justify-center overflow-hidden">
                    <TeamLogo
                      src={championTeam.logo_url}
                      name={championTeam.team_name}
                      size="lg"
                    />
                  </div>
                </div>
                <div className="absolute -top-3 -right-2 bg-amber-400 text-black p-1.5 rounded-full shadow-md">
                  <Trophy className="w-4 h-4" />
                </div>
              </div>

              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-amber-500/20 text-amber-400 border border-amber-500/30 mb-2">
                  <Sparkles className="w-3.5 h-3.5" /> NIGHT CUP ŞAMPİYONU
                </span>
                <h2 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tight">
                  {championTeam.team_name}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {tournament.name} turnuvasını zaferle tamamladı!
                </p>
              </div>
            </div>

            {/* Right: Podium details (2nd & 3rd Place) */}
            <div className="flex items-center gap-4 w-full md:w-auto justify-center md:justify-end">
              {runnerUpTeam && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-black/40 border border-white/10">
                  <div className="w-7 h-7 rounded-xl bg-slate-300/20 text-slate-300 flex items-center justify-center font-black text-xs">
                    2.
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                      İKİNCİ
                    </span>
                    <span className="text-xs font-black text-white uppercase truncate max-w-[120px] block">
                      {runnerUpTeam.team_name}
                    </span>
                  </div>
                </div>
              )}

              {thirdPlaceTeam && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-black/40 border border-white/10">
                  <div className="w-7 h-7 rounded-xl bg-amber-700/20 text-amber-600 flex items-center justify-center font-black text-xs">
                    3.
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                      ÜÇÜNCÜ
                    </span>
                    <span className="text-xs font-black text-white uppercase truncate max-w-[120px] block">
                      {thirdPlaceTeam.team_name}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. BRACKET TREE COLUMNS */}
      <div className="overflow-x-auto pb-6 scrollbar-thin">
        <div className="flex items-start gap-8 min-w-[850px] px-2 py-4">
          {presentStages.map((stageKey, sIndex) => {
            const stageMatches = knockoutMatches
              .filter((m) => m.stage === stageKey)
              .sort((a, b) => (a.match_order || 0) - (b.match_order || 0));

            return (
              <div
                key={stageKey}
                className="flex-1 min-w-[280px] max-w-[340px] flex flex-col gap-6"
              >
                {/* Column Stage Header */}
                <div className="p-3.5 rounded-2xl bg-[#0a1628] border border-white/10 text-center flex items-center justify-between shadow-md">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#00e5ff]" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">
                      {getTournamentStageLabel(stageKey)}
                    </span>
                  </div>
                  <span className="text-[10px] font-black text-zinc-500 uppercase">
                    {stageMatches.length} Maç
                  </span>
                </div>

                {/* Match Cards List */}
                <div
                  className="flex flex-col gap-6 justify-around flex-1"
                  style={{ minHeight: `${stageMatches.length * 150}px` }}
                >
                  {stageMatches.map((match) => (
                    <KnockoutMatchCard
                      key={match.id}
                      match={match}
                      isAdmin={isAdmin}
                      onEdit={onEditMatch}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Third Place Match Column (if exists) */}
          {thirdPlaceMatches.length > 0 && (
            <div className="w-[280px] shrink-0 flex flex-col gap-6">
              <div className="p-3.5 rounded-2xl bg-[#0a1628] border border-amber-500/20 text-center flex items-center justify-between shadow-md">
                <div className="flex items-center gap-2">
                  <Medal className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                    3.lük Maçı
                  </span>
                </div>
                <span className="text-[10px] font-black text-zinc-500 uppercase">Teselli</span>
              </div>

              <div className="flex flex-col gap-6">
                {thirdPlaceMatches.map((match) => (
                  <KnockoutMatchCard
                    key={match.id}
                    match={match}
                    isAdmin={isAdmin}
                    onEdit={onEditMatch}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Subcomponent: Knockout Match Card
function KnockoutMatchCard({
  match,
  isAdmin,
  onEdit,
}: {
  match: any;
  isAdmin?: boolean;
  onEdit?: (match: any) => void;
}) {
  const isApproved = match.status === 'APPROVED' || match.status === 'COMPLETED';
  const isPlaying = match.status === 'PLAYING';
  const isBye = match.is_bye;

  const homeWinner = match.winner_application_id && match.winner_application_id === match.home_application_id;
  const awayWinner = match.winner_application_id && match.winner_application_id === match.away_application_id;

  const hasPenalties =
    match.penalty_home_score !== null &&
    match.penalty_home_score !== undefined &&
    match.penalty_away_score !== null &&
    match.penalty_away_score !== undefined;

  return (
    <div
      className={`relative rounded-2xl bg-[#0a1628]/95 border transition-all shadow-xl overflow-hidden ${
        isApproved
          ? 'border-white/10 hover:border-[#00e5ff]/40'
          : isPlaying
          ? 'border-[#00e5ff] shadow-[0_0_20px_rgba(0,229,255,0.2)]'
          : 'border-white/5 hover:border-white/20'
      }`}
    >
      {/* Top info badge */}
      <div className="px-3.5 py-2 border-b border-white/5 flex items-center justify-between text-[10px] font-bold bg-[#060d18]/60">
        <span className="text-zinc-400 tracking-wider">
          {match.bracket_slot || `Maç #${match.match_order}`}
        </span>

        <div className="flex items-center gap-2">
          {isBye ? (
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              BYE
            </span>
          ) : (
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                isApproved
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : isPlaying
                  ? 'bg-[#00e5ff]/20 text-[#00e5ff] animate-pulse'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {isApproved ? 'BİTTİ' : isPlaying ? 'CANLI' : 'PLANLANDI'}
            </span>
          )}

          {isAdmin && onEdit && (
            <button
              onClick={() => onEdit(match)}
              className="p-1 rounded-md bg-white/5 hover:bg-[#00e5ff]/20 text-zinc-400 hover:text-[#00e5ff] transition-colors"
              title="Skor ve Kazananı Düzenle"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Teams and Scores */}
      <div className="p-3.5 space-y-2">
        {/* HOME TEAM */}
        <div
          className={`flex items-center justify-between gap-2 p-2 rounded-xl transition-colors ${
            homeWinner
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : 'bg-black/30'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {match.home ? (
              <>
                <TeamLogo src={match.home.logo_url} name={match.home.team_name} size="xs" />
                <span
                  className={`text-xs font-black uppercase truncate ${
                    homeWinner ? 'text-white font-black' : 'text-zinc-300'
                  }`}
                >
                  {match.home.team_name}
                </span>
                {homeWinner && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
              </>
            ) : (
              <span className="text-xs font-bold text-zinc-500 italic">
                Bekleniyor...
              </span>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-1.5 font-mono">
            {isApproved && match.home_score !== null ? (
              <div className="text-right">
                <span
                  className={`text-sm font-black ${
                    homeWinner ? 'text-emerald-400' : 'text-zinc-400'
                  }`}
                >
                  {match.home_score}
                </span>
                {hasPenalties && (
                  <span className="text-[10px] text-zinc-500 ml-1">
                    ({match.penalty_home_score}p)
                  </span>
                )}
              </div>
            ) : isBye ? (
              <span className="text-[10px] text-emerald-400 font-bold uppercase">
                BYE
              </span>
            ) : (
              <span className="text-xs text-zinc-600">-</span>
            )}
          </div>
        </div>

        {/* AWAY TEAM */}
        <div
          className={`flex items-center justify-between gap-2 p-2 rounded-xl transition-colors ${
            awayWinner
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : 'bg-black/30'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {match.away ? (
              <>
                <TeamLogo src={match.away.logo_url} name={match.away.team_name} size="xs" />
                <span
                  className={`text-xs font-black uppercase truncate ${
                    awayWinner ? 'text-white font-black' : 'text-zinc-300'
                  }`}
                >
                  {match.away.team_name}
                </span>
                {awayWinner && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
              </>
            ) : (
              <span className="text-xs font-bold text-zinc-500 italic">
                {isBye ? '—' : 'Bekleniyor...'}
              </span>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-1.5 font-mono">
            {isApproved && match.away_score !== null ? (
              <div className="text-right">
                <span
                  className={`text-sm font-black ${
                    awayWinner ? 'text-emerald-400' : 'text-zinc-400'
                  }`}
                >
                  {match.away_score}
                </span>
                {hasPenalties && (
                  <span className="text-[10px] text-zinc-500 ml-1">
                    ({match.penalty_away_score}p)
                  </span>
                )}
              </div>
            ) : isBye ? (
              <span className="text-[10px] text-zinc-600 font-mono">—</span>
            ) : (
              <span className="text-xs text-zinc-600">-</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
