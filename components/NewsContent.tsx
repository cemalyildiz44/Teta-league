import Link from 'next/link';
import { parseMentions } from '@/utils/mentions';

interface NewsContentProps {
  content: string;
  validUsernames?: Set<string> | string[];
  className?: string;
}

export default function NewsContent({
  content,
  validUsernames,
  className = '',
}: NewsContentProps) {
  if (!content) return null;

  const validSet = validUsernames instanceof Set
    ? validUsernames
    : new Set((validUsernames || []).map((u) => u.toLowerCase()));

  const tokens = parseMentions(content, validSet);

  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (token.type === 'mention' && token.username) {
          return (
            <Link
              key={index}
              href={`/oyuncular/${token.username}`}
              className="text-[#00e5ff] font-bold hover:underline hover:text-white transition-colors cursor-pointer inline-flex items-baseline break-all"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              @{token.username}
            </Link>
          );
        }
        return <span key={index}>{token.content}</span>;
      })}
    </span>
  );
}
