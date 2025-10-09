import { createServerSupabaseClient } from './supabase';
import { redirect } from 'next/navigation';

export async function getUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    redirect('/auth/signin');
  }
  return user;
}

