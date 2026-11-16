# Snap &amp; Style — cute photo booth (MVP)

Plain HTML + CSS + JavaScript. No build step, no framework, no server code.

```
photo-booth/
├── index.html            # all screens
├── css/app.css           # pastel / glass styling
├── vercel.json           # static deploy + camera permission header
├── js/config.js          # Supabase URL + publishable key
├── js/frames.js          # 10 built-in frames (art + exact window geometry)
├── js/detect.js          # automatic photo-window detection for your artwork
├── js/store.js           # custom frames in IndexedDB (+ localStorage fallback)
├── js/supabase.js        # auth, storage upload, gallery queries, setup check
├── js/app.js             # booth, editor, export, frame studio, gallery
└── supabase/schema.sql   # table + bucket + RLS policies (re-runnable)
```

## Run it locally

ES modules need a real origin, so use a local server (not `file://`):

```bash
cd photo-booth
python3 -m http.server 3000 --bind 0.0.0.0
# → http://localhost:3000
```

Camera capture needs HTTPS or localhost. If the browser blocks the camera,
**Upload photos** still works.

## Using your own frame designs (no redrawing)

Home → **My Frames**:

1. **Upload artwork** — your PNG/JPG design, unchanged.
2. Press **✨ Auto-detect**. The app scans the artwork, finds the flat
   rectangular photo areas (tilted cards included), and drops a window on
   each one.
3. Nudge, resize or rotate only the boxes that need it; delete any extras.
4. **White-on-white frames** — bright and see-through windows switch
   **“Art sits above photos”** on automatically. The artwork is then drawn over
   the photos with every detected window punched out, so the frame's own border
   stays crisp while photos still show through. If a box swallowed the card's
   border, drag **Border trim** until it looks right.
5. Name it, pick a theme, **Save frame**.
6. Tap **✎** on a saved frame to re-open it and adjust its windows — it updates
   in place instead of being recreated.

**Import many frames** does steps 1–2 in bulk: select all your designs at once,
each becomes a frame automatically. Anything it can't read is reported so you
can set it up by hand.

Custom frames are stored in **IndexedDB**, which comfortably holds 60+ designs
(localStorage was capped at ~5 MB). A small thumbnail is stored per frame so the
picker stays fast.

### How detection works

Two masks are scanned — bright/white areas and black areas — because designs use
both white and black photo windows. Each connected region is fitted with a
rotated rectangle from its second moments, and only regions that actually fill
that rectangle are kept. That rejects circles (vinyl records), blobs (flowers),
text and thin strips (film rails) while accepting tilted polaroids.

## Supabase setup (one time)

1. Dashboard → **SQL Editor** → paste `supabase/schema.sql` → **Run**.
   Creates the `snaps` table, the private `snaps` bucket and owner-only RLS
   policies. Re-runnable at any time.
2. **Authentication → Providers → Email**: enabled by default. For instant
   testing you can turn *Confirm email* off.
3. Optional — **Continue with Google**: enable the Google provider, then add
   every origin you use to **Authentication → URL Configuration → Redirect
   URLs** (`http://localhost:3000/**`, `https://<your-app>.vercel.app/**`).
4. The publishable key in `js/config.js` is public by design; your data is
   protected by the RLS policies, not by hiding the key.

**Nothing breaks if the schema isn't there yet.** The frame picker shows a
status line saying exactly what's missing, sign-in still works, and if a cloud
save fails the photo is kept in the on-device gallery instead of being lost.

## Deploy to Vercel

1. Push this branch, then **Add New → Project** and import the repo.
2. **Root Directory: `photo-booth`** (important — the repo root has unrelated
   files). Framework preset: **Other**. Build command: none. Output: the
   `photo-booth` folder itself.
3. Deploy, then add the Vercel domain to Supabase → Authentication → URL
   Configuration (Site URL + Redirect URLs) so Google sign-in returns to the
   right place.

`vercel.json` already sets `camera=(self)` so the booth can use the camera on
the deployed domain, plus a couple of safe security headers.

## Checks

* `?calibrate=1` outlines every photo window over the artwork — handy for
  spotting a slot that is a few pixels off.
* Every slot is validated on load (inside the frame, non-zero size); frames with
  broken slots are ignored rather than rendered crooked.
* Photos always cover-fit and pan/zoom is clamped, so a blank gap can never
  appear inside a window.
