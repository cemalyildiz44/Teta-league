'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

function slugify(text: string): string {
  const trMap: Record<string, string> = {
    'ç': 'c', 'Ç': 'c',
    'ğ': 'g', 'Ğ': 'g',
    'ı': 'i', 'I': 'i', 'İ': 'i',
    'ö': 'o', 'Ö': 'o',
    'ş': 's', 'Ş': 's',
    'ü': 'u', 'Ü': 'u',
  };
  return text
    .split('')
    .map(c => trMap[c] || c)
    .join('')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function checkAdmin(supabase: any, user: any) {
  if (!user) return false;
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

export async function createNewsAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user))) {
    return { error: 'Yetkisiz erişim.' };
  }

  const title = (formData.get('title') as string || '').trim();
  let slug = (formData.get('slug') as string || '').trim();
  const category = (formData.get('category') as string || 'LİG HABERİ').trim();
  const summary = (formData.get('summary') as string || '').trim();
  const content = (formData.get('content') as string || '').trim();
  const is_published = formData.get('is_published') === 'true' || formData.get('is_published') === 'on';
  const image_file = formData.get('image_file') as File | null;
  const manual_image_url = (formData.get('image_url') as string || '').trim();

  if (!title) return { error: 'Haber başlığı zorunludur.' };
  if (!content) return { error: 'Haber içeriği zorunludur.' };

  if (!slug) {
    slug = slugify(title);
  } else {
    slug = slugify(slug);
  }

  if (!slug) {
    slug = `haber-${Date.now()}`;
  }

  let final_image_url = manual_image_url || null;

  if (image_file && image_file.size > 0) {
    if (image_file.size > 5 * 1024 * 1024) {
      return { error: 'Görsel boyutu 5MB sınırını aşamaz.' };
    }
    const ext = image_file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `news_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('news-images')
      .upload(fileName, image_file, { upsert: true });

    if (uploadError) {
      return { error: 'Görsel yüklenemedi: ' + uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from('news-images')
      .getPublicUrl(fileName);

    final_image_url = urlData.publicUrl;
  }

  const { error: insertError } = await supabase.from('news').insert({
    title,
    slug,
    category,
    summary: summary || null,
    content,
    image_url: final_image_url,
    is_published,
    published_at: new Date().toISOString(),
    author_id: user?.id || null,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      return { error: 'Bu slug zaten başka bir haberde kullanılıyor. Lütfen benzersiz bir slug belirleyin.' };
    }
    return { error: 'Haber oluşturulamadı: ' + insertError.message };
  }

  revalidatePath('/');
  revalidatePath('/haberler');
  revalidatePath('/admin/news');

  return { success: 'Haber başarıyla oluşturuldu.' };
}

export async function updateNewsAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user))) {
    return { error: 'Yetkisiz erişim.' };
  }

  const id = formData.get('id') as string;
  const title = (formData.get('title') as string || '').trim();
  let slug = (formData.get('slug') as string || '').trim();
  const category = (formData.get('category') as string || 'LİG HABERİ').trim();
  const summary = (formData.get('summary') as string || '').trim();
  const content = (formData.get('content') as string || '').trim();
  const is_published = formData.get('is_published') === 'true' || formData.get('is_published') === 'on';
  const image_file = formData.get('image_file') as File | null;
  const existing_image_url = (formData.get('existing_image_url') as string || '').trim();
  const manual_image_url = (formData.get('image_url') as string || '').trim();

  if (!id) return { error: 'Haber ID bulunamadı.' };
  if (!title) return { error: 'Haber başlığı zorunludur.' };
  if (!content) return { error: 'Haber içeriği zorunludur.' };

  if (!slug) {
    slug = slugify(title);
  } else {
    slug = slugify(slug);
  }

  let final_image_url = manual_image_url || existing_image_url || null;

  if (image_file && image_file.size > 0) {
    if (image_file.size > 5 * 1024 * 1024) {
      return { error: 'Görsel boyutu 5MB sınırını aşamaz.' };
    }
    const ext = image_file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `news_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('news-images')
      .upload(fileName, image_file, { upsert: true });

    if (uploadError) {
      return { error: 'Görsel yüklenemedi: ' + uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from('news-images')
      .getPublicUrl(fileName);

    final_image_url = urlData.publicUrl;
  }

  const { error: updateError } = await supabase
    .from('news')
    .update({
      title,
      slug,
      category,
      summary: summary || null,
      content,
      image_url: final_image_url,
      is_published,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    if (updateError.code === '23505') {
      return { error: 'Bu slug zaten başka bir haberde kullanılıyor.' };
    }
    return { error: 'Haber güncellenemedi: ' + updateError.message };
  }

  revalidatePath('/');
  revalidatePath('/haberler');
  revalidatePath(`/haberler/${slug}`);
  revalidatePath('/admin/news');

  return { success: 'Haber başarıyla güncellendi.' };
}

export async function deleteNewsAction(id: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user))) {
    return { error: 'Yetkisiz erişim.' };
  }

  if (!id) return { error: 'Haber ID bulunamadı.' };

  const { error } = await supabase.from('news').delete().eq('id', id);

  if (error) {
    return { error: 'Haber silinemedi: ' + error.message };
  }

  revalidatePath('/');
  revalidatePath('/haberler');
  revalidatePath('/admin/news');

  return { success: 'Haber başarıyla silindi.' };
}

export async function togglePublishNewsAction(id: string, newPublishedState: boolean) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user))) {
    return { error: 'Yetkisiz erişim.' };
  }

  if (!id) return { error: 'Haber ID bulunamadı.' };

  const updatePayload: Record<string, any> = {
    is_published: newPublishedState,
    updated_at: new Date().toISOString(),
  };

  if (newPublishedState) {
    updatePayload.published_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('news')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    return { error: 'Durum güncellenemedi: ' + error.message };
  }

  revalidatePath('/');
  revalidatePath('/haberler');
  revalidatePath('/admin/news');

  return { success: newPublishedState ? 'Haber yayınlandı.' : 'Haber yayından kaldırıldı.' };
}
