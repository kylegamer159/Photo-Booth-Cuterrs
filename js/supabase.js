import { SUPABASE_URL, SUPABASE_KEY, BUCKET, TABLE } from './config.js';

let client = null;
let loading = null;

/** Load supabase-js lazily so the booth still works offline / as a guest. */
async function load() {
  if (client) return client;
  if (loading) return loading;
  loading = (async () => {
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      client = mod.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      return client;
    } catch (err) {
      console.warn('[cloud] supabase-js unavailable', err);
      return null;
    }
  })();
  return loading;
}

const uid = () =>
  globalThis.crypto && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `snap-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function friendly(error) {
  const m = (error && (error.message || error.error_description || error.msg)) || '';
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first — check your inbox.';
  if (/already registered|already exists/i.test(m)) return 'That email already has an account — try signing in.';
  if (/password should be at least/i.test(m)) return 'Password needs at least 6 characters.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries — give it a minute.';
  if (/fetch|network|Failed to fetch/i.test(m)) return 'Network problem — check your connection.';
  if (/row-level security|permission/i.test(m)) return 'Supabase blocked that — run supabase/schema.sql to add policies.';
  if (/bucket|not found/i.test(m)) return 'Storage bucket “snaps” is missing — run supabase/schema.sql.';
  return m || 'Something went wrong.';
}

export const cloud = {
  get isReady() {
    return !!client;
  },

  async init() {
    return !!(await load());
  },

  onAuth(cb) {
    load().then((c) => {
      if (!c) {
        cb(null);
        return;
      }
      c.auth.getSession().then(({ data }) => cb(data?.session?.user ?? null));
      c.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
    });
  },

  async signIn(email, password) {
    const c = await load();
    if (!c) throw new Error('Cloud login is unavailable right now.');
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendly(error));
    return data.user;
  },

  async signUp(email, password) {
    const c = await load();
    if (!c) throw new Error('Cloud login is unavailable right now.');
    const { data, error } = await c.auth.signUp({ email, password });
    if (error) throw new Error(friendly(error));
    return data;
  },

  async signInWithGoogle() {
    const c = await load();
    if (!c) throw new Error('Cloud login is unavailable right now.');
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw new Error(friendly(error));
  },

  async signOut() {
    const c = await load();
    if (c) await c.auth.signOut();
  },

  async currentUser() {
    const c = await load();
    if (!c) return null;
    const { data } = await c.auth.getUser();
    return data?.user ?? null;
  },

  /**
   * Cheap probe used by the UI: is the table / bucket actually there?
   * Never throws — a missing schema should warn, not break the app.
   */
  async checkSetup() {
    const c = await load();
    if (!c) return { sdk: false, table: 'missing', bucket: 'missing' };
    const out = { sdk: true, table: 'ok', bucket: 'ok' };

    // NOTE: a `head: true` select returns 204 with no body, so a missing table
    // would look successful. A normal GET surfaces the real PostgREST error.
    try {
      const t = await c.from(TABLE).select('id').limit(1);
      if (t.error) {
        const msg = `${t.error.message || ''} ${t.error.code || ''}`;
        if (/does not exist|schema cache|relation|PGRST20\d|42P01/i.test(msg)) out.table = 'missing';
      }
    } catch {
      /* network trouble — leave as ok so we don't cry wolf */
    }

    // `storage.list()` silently returns [] for a missing bucket, so probe the
    // bucket metadata endpoint instead and only trust an explicit 404.
    try {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (r.status === 404) {
        out.bucket = 'missing';
      } else if (!r.ok) {
        const body = await r.text();
        if (/NoSuchBucket|bucket.*not.*found/i.test(body)) out.bucket = 'missing';
      }
    } catch {
      /* offline — leave as ok */
    }

    return out;
  },

  /** Save a rendered PNG for the signed-in user. */
  async saveSnap(blob, meta = {}) {
    const c = await load();
    if (!c) throw new Error('Cloud save is unavailable.');
    const user = await this.currentUser();
    if (!user) throw new Error('Sign in to save to your gallery.');

    const path = `${user.id}/${uid()}.png`;
    const up = await c.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/png',
      upsert: false,
    });
    if (up.error) throw new Error(friendly(up.error));

    const ins = await c
      .from(TABLE)
      .insert({
        user_id: user.id,
        frame_id: meta.frameId ?? null,
        frame_name: meta.frameName ?? null,
        storage_path: path,
        width: meta.width ?? null,
        height: meta.height ?? null,
      })
      .select()
      .single();
    if (ins.error) {
      // Don't leave an orphaned file behind if the row can't be written.
      try {
        await c.storage.from(BUCKET).remove([path]);
      } catch {
        /* best effort */
      }
      throw new Error(friendly(ins.error));
    }
    return ins.data;
  },

  /** List saved snaps with signed image URLs. */
  async listSnaps() {
    const c = await load();
    if (!c) return [];
    const user = await this.currentUser();
    if (!user) return [];

    const { data, error } = await c
      .from(TABLE)
      .select('id, storage_path, frame_name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw new Error(friendly(error));
    if (!data?.length) return [];

    const { data: signed, error: sErr } = await c.storage
      .from(BUCKET)
      .createSignedUrls(data.map((r) => r.storage_path), 3600);
    if (sErr) throw new Error(friendly(sErr));

    const byPath = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
    return data
      .map((r) => ({
        id: r.id,
        url: byPath.get(r.storage_path),
        name: r.frame_name,
        created_at: r.created_at,
      }))
      .filter((r) => r.url);
  },

  async deleteSnap(row) {
    const c = await load();
    if (!c) return;
    await c.from(TABLE).delete().eq('id', row.id);
  },
};
