/* eslint-disable @typescript-eslint/no-explicit-any -- untrusted JSON is validated at runtime */
import { canonicalJson, sha256, UUID_RE } from './fixture-weekly.ts';

/**
 * `teta.weekly-matches` v1 (kind: "week-results") — produced by the local weekly tool, imported here.
 * Contract (taken from the local tool's reference implementation, not guessed):
 *   checksum = sha256(canonical JSON of { schemaVersion, kind, target, matches })
 *   exportId = "twm_" + checksum[0..32]
 *   exportId, generatedAt, generator and source are NOT part of the checksum.
 * A checksum identifies *content*, it is not a signature: it never proves who produced the file, so every
 * business rule (teams, club ids, window, fixture state) is re-checked against live data by the planner.
 */

export const RESULTS_SCHEMA = 'teta.weekly-matches';
export const RESULTS_VERSION = 1;
export const RESULTS_KIND = 'week-results';
export const MAX_RESULT_MATCHES = 200;
export const MAX_PLAYERS_PER_MATCH = 30;

export interface ResultsPlayer {
  side: 'home' | 'away';
  eaClubId: number;
  eaPlayerId: string;
  eaPlayerName: string | null;
  position: string | null;
  goals: number;
  assists: number;
  rating: number | null;
  shots: number;
  passesMade: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  saves: number;
  goalsConceded: number;
  cleanSheetsGk: number;
  cleanSheetsDef: number;
  redCards: number;
  mom: boolean;
}
export interface ResultsMatch {
  fixtureId: string;
  fixtureUpdatedAt: string;
  kind: 'EA_MATCH';
  eaMatchId: string;
  playedAt: string;
  home: { teamId: string; eaClubId: number; score: number };
  away: { teamId: string; eaClubId: number; score: number };
  players: ResultsPlayer[];
}
export interface ResultsDoc {
  schema: typeof RESULTS_SCHEMA;
  schemaVersion: typeof RESULTS_VERSION;
  kind: typeof RESULTS_KIND;
  exportId: string;
  checksum: string;
  generatedAt: string;
  generator: { name: string; version: string };
  source: { fixturesExportId: string; fixturesChecksum: string; fixturesGeneratedAt: string };
  target: { seasonId: string; seasonSlug: string; leagueId: string; leagueName: string; weekNumber: number };
  matches: ResultsMatch[];
}

export const COUNT_KEYS = [
  'goals', 'assists', 'shots', 'passesMade', 'passAttempts', 'tacklesMade',
  'tackleAttempts', 'saves', 'goalsConceded', 'cleanSheetsGk', 'cleanSheetsDef', 'redCards',
] as const;

const HEX64 = /^[0-9a-f]{64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && ISO_RE.test(v) && !Number.isNaN(Date.parse(v));
const isParsable = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(new Date(v).getTime());
const isCount = (v: unknown, max = 1000) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const isDigits = (v: unknown, maxLen: number): v is string => typeof v === 'string' && new RegExp(`^[1-9][0-9]{0,${maxLen - 1}}$`).test(v);
const isClubId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

export function computeResultsChecksum(d: Pick<ResultsDoc, 'target' | 'matches'>): string {
  return sha256(canonicalJson({ schemaVersion: RESULTS_VERSION, kind: RESULTS_KIND, target: d.target, matches: d.matches }));
}
export const derivedResultsExportId = (checksum: string) => 'twm_' + checksum.slice(0, 32);

export interface ResultsValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  doc?: ResultsDoc;
}

/** Structural + self-consistency validation. Never trusts the file; checksum/exportId mismatch is an error. */
export function validateResultsDoc(raw: unknown): ResultsValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['Dosya bir JSON nesnesi değil.'], warnings };
  if (raw.schema === 'teta.fixtures') {
    return { ok: false, errors: ['Bu bir fikstür dosyası (teta.fixtures). Maç sonuçları için teta.weekly-matches dosyası gerekir.'], warnings };
  }
  if (raw.schema !== RESULTS_SCHEMA) errors.push(`schema "${RESULTS_SCHEMA}" olmalı.`);
  if (raw.schemaVersion !== RESULTS_VERSION) errors.push(`Desteklenmeyen schemaVersion: ${JSON.stringify(raw.schemaVersion)} (desteklenen ${RESULTS_VERSION}).`);
  if (raw.kind !== RESULTS_KIND) errors.push(`kind "${RESULTS_KIND}" olmalı.`);
  if (typeof raw.exportId !== 'string' || !/^twm_[0-9a-f]{32}$/.test(raw.exportId)) errors.push('exportId twm_ + 32 onaltılık karakter olmalı.');
  if (typeof raw.checksum !== 'string' || !HEX64.test(raw.checksum)) errors.push('checksum 64 karakterlik onaltılık SHA-256 olmalı.');
  if (!isIso(raw.generatedAt)) errors.push('generatedAt saat dilimli ISO tarih-saat olmalı.');
  if (!isObj(raw.generator) || typeof raw.generator.name !== 'string' || typeof raw.generator.version !== 'string') errors.push('generator {name, version} olmalı.');
  const src = raw.source;
  if (!isObj(src) || typeof src.fixturesExportId !== 'string' || !src.fixturesExportId || typeof src.fixturesChecksum !== 'string' || !HEX64.test(src.fixturesChecksum) || !isParsable(src.fixturesGeneratedAt)) {
    errors.push('source {fixturesExportId, fixturesChecksum (SHA-256), fixturesGeneratedAt} geçerli olmalı.');
  }
  const t = raw.target;
  if (!isObj(t) || !UUID_RE.test(String(t.seasonId)) || !UUID_RE.test(String(t.leagueId)) || typeof t.seasonSlug !== 'string' || !t.seasonSlug || typeof t.leagueName !== 'string' || !t.leagueName || !Number.isInteger(t.weekNumber) || t.weekNumber < 1 || t.weekNumber > 200) {
    errors.push('target {seasonId, seasonSlug, leagueId, leagueName, weekNumber (1-200)} geçerli olmalı.');
  }

  const eaMatchIds = new Set<string>();
  const fixtureIds = new Set<string>();
  if (!Array.isArray(raw.matches)) {
    errors.push('matches dizi olmalı.');
  } else {
    if (raw.matches.length === 0) errors.push('Dosyada hiç maç yok.');
    if (raw.matches.length > MAX_RESULT_MATCHES) errors.push(`Bir dosyada en fazla ${MAX_RESULT_MATCHES} maç olabilir.`);
    raw.matches.forEach((m: any, i: number) => {
      const p = `matches[${i}]`;
      if (!isObj(m)) return void errors.push(`${p} nesne olmalı.`);
      if (!UUID_RE.test(String(m.fixtureId))) errors.push(`${p}.fixtureId UUID olmalı.`);
      else if (fixtureIds.has(m.fixtureId)) errors.push(`${p}.fixtureId: aynı fikstür dosyada iki kez.`);
      else fixtureIds.add(m.fixtureId);
      if (!isIso(m.fixtureUpdatedAt)) errors.push(`${p}.fixtureUpdatedAt saat dilimli ISO tarih-saat olmalı.`);
      if (m.kind !== 'EA_MATCH') errors.push(`${p}.kind v1'de yalnızca "EA_MATCH" olabilir.`);
      if (!isDigits(m.eaMatchId, 24)) errors.push(`${p}.eaMatchId rakamlardan oluşan metin olmalı.`);
      else if (eaMatchIds.has(m.eaMatchId)) errors.push(`${p}.eaMatchId: aynı EA maçı dosyada iki kez.`);
      else eaMatchIds.add(m.eaMatchId);
      if (!isIso(m.playedAt)) errors.push(`${p}.playedAt saat dilimli ISO tarih-saat olmalı.`);
      if ('rawEa' in m || 'raw' in m) warnings.push(`${p}: ham EA alanı v1'de yoktur; yok sayılır.`);

      const sides: Record<string, number> = {};
      for (const side of ['home', 'away'] as const) {
        const s = m[side];
        if (!isObj(s)) {
          errors.push(`${p}.${side} nesnesi zorunlu.`);
          continue;
        }
        if (!UUID_RE.test(String(s.teamId))) errors.push(`${p}.${side}.teamId UUID olmalı.`);
        if (!isClubId(s.eaClubId)) errors.push(`${p}.${side}.eaClubId pozitif tam sayı (JSON sayısı) olmalı.`);
        else sides[side] = s.eaClubId;
        if (!isCount(s.score, 99)) errors.push(`${p}.${side}.score 0-99 arası tamsayı olmalı.`);
      }
      if (sides.home !== undefined && sides.home === sides.away) errors.push(`${p}: ev ve deplasman kulübü aynı olamaz.`);
      if (isObj(m.home) && isObj(m.away) && m.home.teamId === m.away.teamId) errors.push(`${p}: ev ve deplasman takımı aynı olamaz.`);

      if (!Array.isArray(m.players)) return void errors.push(`${p}.players dizi olmalı.`);
      if (m.players.length > MAX_PLAYERS_PER_MATCH) errors.push(`${p}.players: bir maçta en fazla ${MAX_PLAYERS_PER_MATCH} oyuncu satırı.`);
      const ids = new Set<string>();
      m.players.forEach((pl: any, j: number) => {
        const pp = `${p}.players[${j}]`;
        if (!isObj(pl)) return void errors.push(`${pp} nesne olmalı.`);
        if (pl.side !== 'home' && pl.side !== 'away') errors.push(`${pp}.side "home" veya "away" olmalı.`);
        else if (sides[pl.side] !== undefined && pl.eaClubId !== sides[pl.side]) errors.push(`${pp}.eaClubId tarafın kulüp kimliğiyle uyuşmuyor.`);
        if (typeof pl.eaPlayerId !== 'string' || pl.eaPlayerId.length === 0 || pl.eaPlayerId.length > 24) errors.push(`${pp}.eaPlayerId boş olmayan metin (en çok 24 karakter) olmalı.`);
        else if (ids.has(pl.eaPlayerId)) errors.push(`${pp}.eaPlayerId: aynı oyuncu maçta iki kez.`);
        else ids.add(pl.eaPlayerId);
        if (pl.eaPlayerName !== null && (typeof pl.eaPlayerName !== 'string' || pl.eaPlayerName.length > 64)) errors.push(`${pp}.eaPlayerName null veya en çok 64 karakter olmalı.`);
        if (pl.position !== null && (typeof pl.position !== 'string' || pl.position.length > 32)) errors.push(`${pp}.position null veya en çok 32 karakter olmalı.`);
        for (const k of COUNT_KEYS) if (!isCount(pl[k])) errors.push(`${pp}.${k} 0-1000 arası tamsayı olmalı.`);
        if (pl.rating !== null && !(typeof pl.rating === 'number' && pl.rating >= 0 && pl.rating <= 10)) errors.push(`${pp}.rating null veya 0-10 arası sayı olmalı.`);
        if (typeof pl.mom !== 'boolean') errors.push(`${pp}.mom true/false olmalı.`);
      });
    });
  }
  if (errors.length) return { ok: false, errors, warnings };

  const doc = raw as unknown as ResultsDoc;
  if (computeResultsChecksum(doc) !== doc.checksum) return { ok: false, errors: ['checksum içerikle uyuşmuyor (dosya değiştirilmiş veya bozulmuş).'], warnings };
  if (doc.exportId !== derivedResultsExportId(doc.checksum)) return { ok: false, errors: ['exportId, checksum\'tan türeyen değerle (twm_…) aynı değil.'], warnings };
  return { ok: true, errors: [], warnings, doc };
}
