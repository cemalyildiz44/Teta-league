export interface UpcomingFixtureLike {
  id: string;
  week_number: number;
  scheduled_at: string;
}

/**
 * Bir ligin yaklaşan maçlarından gösterilecek `count` maçı seçer. Rastgele değildir:
 * 1. Maçlar `scheduled_at` artan (eşitse hafta, sonra id) sıralanır.
 * 2. İlk yaklaşan maçın haftası ligin güncel haftasıdır; önce o haftanın maçları alınır.
 * 3. O haftada `count`'tan az maç varsa, sonraki yaklaşan maçlarla tamamlanır.
 * Yeterli maç yoksa mevcut olanlar döner (hata üretmez).
 */
export function pickUpcomingFixtures<T extends UpcomingFixtureLike>(upcoming: T[], count: number): T[] {
  if (count <= 0 || upcoming.length === 0) return [];

  const ordered = [...upcoming].sort((a, b) => {
    const byTime = Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at);
    if (byTime !== 0) return byTime;
    if (a.week_number !== b.week_number) return a.week_number - b.week_number;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const currentWeek = ordered[0].week_number;
  const sameWeek = ordered.filter((f) => f.week_number === currentWeek);
  const rest = ordered.filter((f) => f.week_number !== currentWeek);

  return [...sameWeek, ...rest].slice(0, count);
}
