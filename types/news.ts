export interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  category: string;
  summary: string | null;
  content: string;
  image_url: string | null;
  is_published: boolean;
  published_at: string;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    username: string;
    avatar_url?: string | null;
  } | null;
}
