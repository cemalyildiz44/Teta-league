export const MENTION_REGEX = /(?<=\s|^|[([{"'<])@([a-zA-Z0-9_]+(?:[.-][a-zA-Z0-9_]+)*)/g;

/**
 * Extracts unique candidate usernames mentioned in one or more texts.
 */
export function extractMentionCandidates(texts: Array<string | null | undefined> | string | null | undefined): string[] {
  const textArray = Array.isArray(texts) ? texts : [texts];
  const candidates = new Set<string>();

  for (const text of textArray) {
    if (!text) continue;
    const matches = text.matchAll(MENTION_REGEX);
    for (const match of matches) {
      if (match[1]) {
        candidates.add(match[1].toLowerCase());
      }
    }
  }

  return Array.from(candidates);
}

/**
 * Verifies which candidate usernames actually exist in the profiles table in a single batch query.
 * Prevents N+1 database queries.
 */
export async function getValidMentionUsernames(
  candidates: string[],
  supabaseClient: any
): Promise<Set<string>> {
  if (!candidates || candidates.length === 0) {
    return new Set<string>();
  }

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('username')
      .in('username', candidates);

    if (error || !data) {
      return new Set<string>();
    }

    return new Set<string>(
      data
        .map((p: { username: string | null }) => p.username?.toLowerCase())
        .filter((u: string | undefined): u is string => Boolean(u))
    );
  } catch {
    return new Set<string>();
  }
}

export interface MentionToken {
  type: 'text' | 'mention';
  content?: string;
  username?: string;
}

/**
 * Safely parses text into tokens of regular text and validated mentions.
 * Unmatched or invalid mentions remain safe regular text.
 */
export function parseMentions(text: string, validSet: Set<string>): MentionToken[] {
  if (!text) return [];

  const tokens: MentionToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MENTION_REGEX)) {
    const fullMatch = match[0]; // e.g. "@cemallyldz44"
    const username = match[1];  // e.g. "cemallyldz44"
    const matchIndex = match.index ?? 0;

    // Append preceding text if any
    if (matchIndex > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, matchIndex) });
    }

    if (validSet.has(username.toLowerCase())) {
      tokens.push({ type: 'mention', username: username });
    } else {
      tokens.push({ type: 'text', content: fullMatch });
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // Append remaining trailing text
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return tokens;
}
