'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function updateProfileAction(prevState: any, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 1. Auth kontrolü
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Bu işlemi gerçekleştirme yetkiniz yok.' };
    }

    // 2. Form verilerini alma
    const username = (formData.get('username') as string)?.trim();
    const full_name = (formData.get('full_name') as string)?.trim();
    const bio = (formData.get('bio') as string)?.trim();
    const avatar_url = (formData.get('avatar_url') as string)?.trim();
    const primary_position = (formData.get('primary_position') as string)?.trim();
    const platform = (formData.get('platform') as string)?.trim() || 'common-gen5';
    let current_ea_player_id = (formData.get('current_ea_player_id') as string)?.trim();
    
    // Alternative positions (JSON parsed)
    let alternative_positions: string[] = [];
    try {
      const altPosStr = formData.get('alternative_positions') as string;
      if (altPosStr) {
        alternative_positions = JSON.parse(altPosStr);
      }
    } catch(e) {
      console.error('Failed to parse alternative_positions', e);
    }
    
    const twitter = (formData.get('twitter') as string)?.trim();
    const twitch = (formData.get('twitch') as string)?.trim();
    const discord = (formData.get('discord') as string)?.trim();

    // 3. Validasyon
    if (!username) {
      return { error: 'Kullanıcı adı boş bırakılamaz.' };
    }
    if (bio && bio.length > 300) {
      return { error: 'Biyografi en fazla 300 karakter olabilir.' };
    }

    // Boş stringleri NULL'a çevir
    if (current_ea_player_id === '') {
      current_ea_player_id = undefined as any;
    } else if (current_ea_player_id) {
      // 3b. Duplicate EA ID kontrolü
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('current_ea_player_id', current_ea_player_id)
        .neq('id', user.id) // Kendi profili hariç
        .maybeSingle();

      if (existingProfile) {
        return { error: 'Bu EA kimliği başka bir kullanıcı tarafından kullanılıyor.' };
      }
    }

    // 4. Güncellenecek veri objesi
    const updates = {
      username,
      full_name: full_name || null,
      bio: bio || null,
      avatar_url: avatar_url || null,
      primary_position: primary_position || null,
      alternative_positions: alternative_positions,
      platform,
      current_ea_player_id: current_ea_player_id || null,
      social_links: {
        twitter: twitter || '',
        twitch: twitch || '',
        discord: discord || ''
      },
      updated_at: new Date().toISOString(),
    };

    // 5. Veritabanına yazma
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (error) {
      if (error.code === '23505') {
        return { error: 'Bu Kullanıcı Adı veya EA kimliği zaten kullanımda.' };
      }
      return { error: 'Profil güncellenirken bir hata oluştu: ' + error.message };
    }

    // 6. Cache yenileme
    revalidatePath('/profil');
    revalidatePath('/');
    revalidatePath('/oyuncular');
    revalidatePath('/istatistikler');
    
    return { success: 'Profil başarıyla kaydedildi.' };
  } catch (error) {
    console.error('updateProfileAction error:', error);
    return {
      error: 'Profil kaydedilirken beklenmeyen bir hata oluştu.'
    };
  }
}

export async function changePasswordAction(prevState: any, formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return { error: 'Yetkisiz işlem.' };
    }

    const currentPassword = formData.get('currentPassword') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (!currentPassword) return { error: 'Mevcut şifrenizi girin.' };
    if (!password) return { error: 'Yeni şifrenizi girin.' };
    if (!confirmPassword) return { error: 'Yeni şifrenizi tekrar girin.' };

    if (password !== confirmPassword) return { error: 'Şifreler eşleşmiyor.' };
    if (password.length < 8) return { error: 'Şifre en az 8 karakter olmalıdır.' };
    if (currentPassword === password) return { error: 'Yeni şifreniz mevcut şifrenizden farklı olmalıdır.' };

    // Mevcut şifreyi doğrula
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      return { error: 'Mevcut şifreniz yanlış.' };
    }

    // Şifreyi güncelle
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) return { error: updateError.message };

    return { success: 'Şifreniz başarıyla güncellendi.' };
  } catch (error) {
    return { error: 'Beklenmeyen bir hata oluştu.' };
  }
}
