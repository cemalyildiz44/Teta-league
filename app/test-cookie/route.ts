export async function GET() { const { cookies } = await import('next/headers'); const cookieStore = await cookies(); cookieStore.set('test', '123'); return new Response('ok'); }
