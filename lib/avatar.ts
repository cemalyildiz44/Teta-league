/**
 * Returns the avatar URL to display. Avatars are stored already small (see the upload in app/profil/ClientAccount.tsx:
 * 320 px WebP, a few tens of KB), so the URL is used as it is. Supabase's image transformation endpoint is not used:
 * it is billed per distinct image and does not exist on the Free plan.
 *
 * `size` is kept so call sites can still say how large the image is shown; it is not used for the URL.
 */
export function avatarSrc(url: string | null | undefined, _size = 96): string | undefined {
  return url || undefined;
}
