import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const AVATAR_BUCKET = 'profile-avatars';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_URL_TTL_SECONDS = 60 * 60 * 6;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function detectImageMime(bytes: Uint8Array) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

async function signedUrl(
  supabase: ReturnType<typeof createClient>,
  path: string | null | undefined,
) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_URL_TTL_SECONDS);

  if (error) {
    console.error('Could not create avatar signed URL:', error);
    return null;
  }

  return data.signedUrl;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: 'The selected image is empty.' }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: 'Profile pictures must be 5 MB or smaller.' }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const detectedMime = detectImageMime(bytes);

  if (!detectedMime || !EXTENSIONS[detectedMime]) {
    return NextResponse.json(
      { error: 'Use a JPG, PNG or WebP image.' },
      { status: 415 },
    );
  }

  if (file.type && file.type !== detectedMime) {
    return NextResponse.json(
      { error: 'The selected file does not match its reported image type.' },
      { status: 415 },
    );
  }

  const { data: currentProfile, error: currentProfileError } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();

  if (currentProfileError) {
    return NextResponse.json({ error: currentProfileError.message }, { status: 500 });
  }

  const extension = EXTENSIONS[detectedMime];
  const newPath = `${user.id}/avatar-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(newPath, arrayBuffer, {
      contentType: detectedMime,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: user.id,
        avatar_url: newPath,
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single();

  if (profileError) {
    await supabase.storage.from(AVATAR_BUCKET).remove([newPath]);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const oldPath = currentProfile?.avatar_url;
  if (oldPath && oldPath !== newPath) {
    const { error: cleanupError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([oldPath]);

    if (cleanupError) {
      console.error('Could not remove previous avatar:', cleanupError);
    }
  }

  return NextResponse.json({
    ...profile,
    avatar_signed_url: await signedUrl(supabase, newPath),
  });
}

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: currentProfile, error: currentProfileError } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();

  if (currentProfileError) {
    return NextResponse.json({ error: currentProfileError.message }, { status: 500 });
  }

  if (currentProfile?.avatar_url) {
    const { error: removeError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([currentProfile.avatar_url]);

    if (removeError) {
      return NextResponse.json({ error: removeError.message }, { status: 500 });
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: user.id,
        avatar_url: null,
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    ...profile,
    avatar_signed_url: null,
  });
}
