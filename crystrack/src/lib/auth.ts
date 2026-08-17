import { createClient } from './supabase/server';
import { redirect } from 'next/navigation';

export async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    redirect('/auth');
  }
  return user;
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/auth');
}
