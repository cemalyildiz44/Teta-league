import { publicApiHandlers } from '@/lib/public-api-next';
import { getPlayers } from '@/lib/public-api-routes';

export const dynamic = 'force-dynamic';

const h = publicApiHandlers(getPlayers);
export const GET = h.GET;
export const POST = h.POST;
export const PUT = h.PUT;
export const PATCH = h.PATCH;
export const DELETE = h.DELETE;
export const HEAD = h.HEAD;
export const OPTIONS = h.OPTIONS;
