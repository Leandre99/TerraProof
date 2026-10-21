"""Record the TerraProof demo video from the LIVE site.

Playwright drives https://terraproof-rust.vercel.app like a user (real clicks, real satellite
calls). Overlays injected in the page add a visible cursor, chapter chips, burned-in captions,
highlight rings and title cards. The voice-over (video/voice/*.wav, see make_voice.ps1) is placed
at the start of each scene, with a quiet generated pad underneath, and everything is muxed with ffmpeg.

Usage:  .venv/Scripts/python record.py [URL]        ->  out/terraproof-demo.mp4
"""
import glob
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
URL = (sys.argv[1] if len(sys.argv) > 1 else "https://terraproof-rust.vercel.app").rstrip("/")
SIZE = {"width": 1280, "height": 720}
TRIM = 0.6  # seconds removed from the start of the raw capture
GAP = 1.2   # breathing room after each voiced scene
SR = 44100

NARR = json.loads((ROOT / "narration.json").read_text(encoding="utf-8-sig"))
TEXT = {s["id"]: s["text"] for s in NARR["sections"]}
DUR = json.loads((ROOT / "voice" / "durations.json").read_text(encoding="utf-8-sig"))

CONTRACT = "0xF90808A53E28312b15E9344BA56df1e47E79A820"
ISSUE_TX = "0x41e0936c…8b7f860d6dd"

# ----------------------------------------------------------------------------- overlays (in-page)
OVERLAY_JS = r"""
(() => {
  if (window.__demoInstalled) return;
  window.__demoInstalled = true;
  const css = `
    #demo-cursor{position:fixed;left:-50px;top:-50px;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;
      background:#16140F;border:3px solid #EFEBDD;box-shadow:0 0 0 1.5px #16140F,3px 3px 0 #C8F169;z-index:2147483000;pointer-events:none;transition:transform .12s ease}
    .demo-ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #1F6B4A;z-index:2147482999;pointer-events:none;
      transition:all .55s ease-out;opacity:1}
    #demo-cap{position:fixed;left:50%;bottom:30px;transform:translateX(-50%) translateY(8px);max-width:78%;text-align:center;opacity:0;
      background:#16140F;color:#EFEBDD;border:1.5px solid #16140F;border-radius:6px;box-shadow:4px 4px 0 #C8F169;padding:12px 24px;
      font:500 22px/1.35 var(--font-sans),system-ui,sans-serif;z-index:2147482990;pointer-events:none;transition:opacity .3s ease,transform .3s ease}
    #demo-cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
    #demo-chap{position:fixed;left:24px;bottom:104px;display:flex;gap:10px;align-items:center;background:#EFEBDD;border:1.5px solid #16140F;border-radius:4px;
      box-shadow:3px 3px 0 #16140F;padding:7px 14px;font:500 13px/1 var(--font-mono),ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;
      color:#16140F;z-index:2147482991;pointer-events:none;opacity:0;transform:translateY(8px);transition:opacity .35s ease,transform .35s ease}
    #demo-chap.on{opacity:1;transform:none}
    #demo-chap b{background:#C8F169;padding:3px 7px;border-radius:3px;font-weight:500}
    .demo-ring{position:fixed;border:3px solid #16140F;border-radius:8px;box-shadow:0 0 0 4px #C8F169,0 0 0 1000px rgba(22,20,15,.0);z-index:2147482980;
      pointer-events:none;opacity:0;transition:opacity .3s ease}
    .demo-ring.on{opacity:1;animation:demoPulse 1.4s ease-in-out infinite}
    @keyframes demoPulse{0%,100%{box-shadow:0 0 0 4px #C8F169}50%{box-shadow:0 0 0 9px rgba(200,241,105,.55)}}
    #demo-card{position:fixed;inset:0;z-index:2147482995;background:#EFEBDD;opacity:0;pointer-events:none;transition:opacity .7s ease;
      display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden}
    #demo-card.on{opacity:1}
    #demo-card::before{content:"";position:absolute;inset:0;background:url(/topo.svg) center/cover;opacity:.11}
    #demo-card .inner{position:relative;max-width:1040px;padding:0 40px}
    .dc-label{font:500 15px/1.4 var(--font-mono),monospace;letter-spacing:.18em;text-transform:uppercase;color:#1F6B4A}
    .dc-title{font:400 92px/0.98 var(--font-display),Georgia,serif;letter-spacing:-.02em;color:#16140F;margin:26px 0}
    .dc-title i{font-style:italic}.dc-title mark{background:linear-gradient(transparent 58%,#C8F169 58%,#C8F169 92%,transparent 92%);color:inherit;padding:0 .06em}
    .dc-sub{font:400 22px/1.5 var(--font-sans),sans-serif;color:#4a463a}
    .dc-mono{font:500 18px/1.7 var(--font-mono),monospace;color:#16140F;text-align:left;background:#FDFBF5;border:1.5px solid #16140F;box-shadow:6px 6px 0 #16140F;
      border-radius:6px;padding:22px 28px;display:inline-block}
    .dc-mono .k{color:#68625a}.dc-mono .ok{color:#1F6B4A}
    .dc-row{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:28px}
    .dc-chip{font:500 16px/1 var(--font-mono),monospace;letter-spacing:.1em;text-transform:uppercase;border:1.5px solid #16140F;border-radius:4px;padding:10px 16px;background:#FDFBF5;box-shadow:3px 3px 0 #C8F169}
    .toast-lift{bottom:150px !important}
  `;
  const style = document.createElement('style'); style.textContent = css;
  const mount = () => {
    if (document.getElementById('demo-cursor')) return;
    (document.head || document.documentElement).appendChild(style);
    const root = document.documentElement;
    const mk = (id, cls) => { const e = document.createElement('div'); if (id) e.id = id; if (cls) e.className = cls; root.appendChild(e); return e; };
    const cur = mk('demo-cursor'); const cap = mk('demo-cap'); const chap = mk('demo-chap'); const card = mk('demo-card');
    card.innerHTML = '<div class="inner"></div>';
    document.addEventListener('mousemove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', e => {
      cur.style.transform = 'scale(.72)';
      const r = document.createElement('div'); r.className = 'demo-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; root.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(4.5)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 650);
    }, true);
    document.addEventListener('mouseup', () => { cur.style.transform = 'scale(1)'; }, true);
    // keep toasts above the caption bar
    new MutationObserver(() => { document.querySelectorAll('[aria-live="polite"]').forEach(n => n.classList.add('toast-lift')); })
      .observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) mount(); else document.addEventListener('DOMContentLoaded', mount);
  document.addEventListener('DOMContentLoaded', mount);

  let capTimer = null;
  window.__demo = {
    caps(items) { // [[text, ms], ...]
      const el = document.getElementById('demo-cap'); clearTimeout(capTimer); let i = 0;
      const next = () => {
        if (i >= items.length) { el.classList.remove('on'); return; }
        el.classList.remove('on');
        setTimeout(() => { el.textContent = items[i][0]; el.classList.add('on'); capTimer = setTimeout(() => { i++; next(); }, items[i][1]); }, 160);
      };
      next();
    },
    capsOff() { clearTimeout(capTimer); document.getElementById('demo-cap').classList.remove('on'); },
    chapter(n, label) {
      const el = document.getElementById('demo-chap'); el.classList.remove('on');
      setTimeout(() => { el.innerHTML = '<b>' + n + '</b>' + label; el.classList.add('on'); }, 250);
    },
    chapterOff() { document.getElementById('demo-chap').classList.remove('on'); },
    ring(x, y, w, h, ms) {
      const r = document.createElement('div'); r.className = 'demo-ring';
      r.style.cssText = `left:${x - 6}px;top:${y - 6}px;width:${w + 12}px;height:${h + 12}px`;
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => r.classList.add('on'));
      setTimeout(() => { r.classList.remove('on'); setTimeout(() => r.remove(), 400); }, ms);
    },
    card(html) {
      const el = document.getElementById('demo-card');
      if (html === null) { el.classList.remove('on'); return; }
      el.querySelector('.inner').innerHTML = html; el.classList.add('on');
    },
  };
})();
"""

# ----------------------------------------------------------------------------- helpers
def split_sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.?!:])\s+", text) if s.strip()]


def sentence_plan(sec):
    sents = split_sentences(TEXT[sec])
    weights = [len(s) + 14 for s in sents]  # +14: a spoken sentence also carries a pause
    total = sum(weights)
    t = 0.0
    starts, lens = [], []
    for w in weights:
        starts.append(t)
        lens.append(DUR[sec] * w / total)
        t += DUR[sec] * w / total
    return sents, starts, lens


def find_chrome():
    base = Path(os.environ["LOCALAPPDATA"]) / "ms-playwright"
    for pat in ("chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe",):
        hits = sorted(glob.glob(str(base / pat)))
        if hits:
            return hits[-1]
    return None


def main():
    OUT.mkdir(exist_ok=True)
    raw_dir = OUT / "raw"
    shutil.rmtree(raw_dir, ignore_errors=True)
    scene_t0 = {}

    with sync_playwright() as p:
        chrome = find_chrome()
        launch = {"executable_path": chrome} if chrome else {}
        browser = p.chromium.launch(args=["--force-color-profile=srgb"], **launch)
        ctx = browser.new_context(viewport=SIZE, record_video_dir=str(raw_dir), record_video_size=SIZE,
                                  device_scale_factor=1, locale="en-US")
        ctx.add_init_script(OVERLAY_JS)
        page = ctx.new_page()
        t0 = time.monotonic()
        now = lambda: time.monotonic() - t0  # noqa: E731

        def sleep_until(t):
            d = t - now()
            if d > 0:
                time.sleep(d)

        def begin(sec, num=None, label=None):
            scene_t0[sec] = now()
            sents, starts, lens = sentence_plan(sec)
            page.evaluate("items => window.__demo.caps(items)", [[s, int(l * 1000)] for s, l in zip(sents, lens)])
            if num:
                page.evaluate("([n, l]) => window.__demo.chapter(n, l)", [num, label])
            print(f"[{now():6.1f}s] scene {sec} ({DUR[sec]:.1f}s voice)")
            return starts

        def at(sec, starts, idx, off=0.0):
            sleep_until(scene_t0[sec] + starts[idx] + off)

        def end(sec, extra=0.0):
            sleep_until(scene_t0[sec] + DUR[sec] + GAP + extra)

        def glide(x, y, settle=0.3, steps=26):
            page.mouse.move(x, y, steps=steps)
            time.sleep(settle)

        def center(loc):
            b = loc.bounding_box()
            return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

        def click(loc, settle=0.3):
            loc.scroll_into_view_if_needed()
            x, y = center(loc)
            glide(x, y, settle)
            page.mouse.down()
            page.mouse.up()

        def ring(loc, ms=3000):
            b = loc.bounding_box()
            if b:
                page.evaluate("([x,y,w,h,ms]) => window.__demo.ring(x,y,w,h,ms)", [b["x"], b["y"], b["width"], b["height"], ms])

        def smooth_scroll(y, wait=1.0):
            page.evaluate("y => window.scrollTo({top: y, behavior: 'smooth'})", y)
            time.sleep(wait)

        def role(r, name, exact=False):
            return page.get_by_role(r, name=name, exact=exact)

        # ---------------------------------------------------------------- 0. intro card over the landing page
        page.goto(URL + "/", wait_until="networkidle")
        page.mouse.move(900, 500)
        time.sleep(1.0)
        page.evaluate("""() => window.__demo.card(`
          <div class="dc-label">IEEE ClimateChain Global Hackathon · Carbon Markets &amp; Emissions Transparency</div>
          <div class="dc-title">Carbon credits<br>you can <i><mark>verify</mark></i><br>from space.</div>
          <div class="dc-sub">TerraProof · a registry where double counting is impossible by construction</div>`)""")
        s = begin("intro")
        end("intro", 1.0)
        page.evaluate("() => { window.__demo.card(null); window.__demo.capsOff(); }")
        time.sleep(1.0)

        # ---------------------------------------------------------------- 1. the problem + the claim board toy
        st = begin("problem", "01", "The problem")
        at("problem", st, 4)
        page.evaluate("() => document.querySelector('[role=grid]').scrollIntoView({block:'center', behavior:'smooth'})")
        time.sleep(1.2)
        at("problem", st, 5)
        free = page.locator("[role=grid] button[title$='free']")
        for i in (38, 39, 40):  # three free cells in a row
            click(free.nth(i), settle=0.25)
            time.sleep(0.45)
        at("problem", st, 6, 0.3)
        taken = page.locator("[role=grid] button[title*='parcel #1']").nth(8)
        glide(*center(taken), settle=0.4)
        at("problem", st, 7)
        page.mouse.down(); page.mouse.up()
        time.sleep(0.6)
        ring(page.locator("[aria-live=polite]").first, 4000)
        end("problem")

        # ---------------------------------------------------------------- 2. how it works
        st = begin("how", "02", "How it works")
        page.evaluate("() => document.getElementById('how').scrollIntoView({behavior:'smooth'})")
        at("how", st, 3)
        smooth_scroll(page.evaluate("() => document.getElementById('how').offsetTop + 330"), 1.0)
        at("how", st, 4)
        smooth_scroll(page.evaluate("() => document.getElementById('how').offsetTop + 640"), 1.0)
        end("how")

        # ---------------------------------------------------------------- 3. register a parcel
        st = begin("register", "03", "Claim land")
        smooth_scroll(0, 0.8)
        click(role("link", re.compile("Open the registry")).first)
        page.wait_for_selector("input[placeholder^='Parcel name']", timeout=30000)
        time.sleep(1.5)
        at("register", st, 1)
        click(page.get_by_placeholder(re.compile("Parcel name")))
        page.keyboard.type("Cajou Adjigo, Savalou", delay=75)
        time.sleep(0.4)
        click(role("button", "Draw", exact=True))
        mb = page.locator(".leaflet-container").bounding_box()
        for fx, fy in ((0.14, 0.66), (0.31, 0.66), (0.31, 0.79), (0.14, 0.79)):
            glide(mb["x"] + mb["width"] * fx, mb["y"] + mb["height"] * fy, settle=0.35)
            page.mouse.down(); page.mouse.up()
            time.sleep(0.25)
        at("register", st, 2, 0.3)
        ring(page.locator("dl").first, 3800)
        at("register", st, 3, 0.2)
        click(role("button", "Register on the ledger"))
        page.wait_for_selector("text=PARCEL #3", timeout=20000)
        end("register")

        # ---------------------------------------------------------------- 4. satellite verification
        st = begin("verify", "04", "Satellite audit")
        at("verify", st, 1, 0.5)
        verify_btn = role("button", re.compile("Verify with satellite"))
        click(verify_btn)
        page.wait_for_selector("text=Sentinel-2 live", timeout=40000)
        time.sleep(0.8)
        chart = page.locator("svg[aria-label='NDVI timeline']")
        ring(chart, 4200)
        at("verify", st, 2, 0.4)
        ev = page.get_by_text(re.compile(r"Evidence hash"))
        ring(ev.first, 4500)
        at("verify", st, 3)
        ring(page.locator("text=Sentinel-2 live").first, 4000)
        end("verify")

        # ---------------------------------------------------------------- 5. the attack
        st = begin("attack", "05", "Double counting")
        at("attack", st, 0, 0.6)
        click(role("tab", re.compile("Register")))
        at("attack", st, 1)
        guard = role("button", re.compile("already registered"))
        glide(*center(guard), settle=0.4)
        at("attack", st, 2, 0.1)
        page.mouse.down(); page.mouse.up()
        time.sleep(1.2)
        end("attack")

        # ---------------------------------------------------------------- 6. living credits
        st = begin("living", "06", "Living credits")
        click(role("tab", re.compile("Parcels")))
        time.sleep(0.5)
        sel = role("button", re.compile("Cajou Adjigo"))
        if sel.count():
            click(sel.first)
        at("living", st, 1)
        click(role("button", re.compile("Simulate deforestation")))
        page.wait_for_selector("text=Credits are frozen", timeout=40000)
        time.sleep(0.6)
        ring(page.locator("svg[aria-label='NDVI timeline']"), 4200)
        at("living", st, 3)
        click(role("button", re.compile("Revoke credits")))
        time.sleep(1.0)
        end("living")

        # ---------------------------------------------------------------- 7. retire + proof page
        st = begin("retire", "07", "Retire and prove")
        click(role("button", re.compile("Clear flag")))
        time.sleep(0.8)
        click(role("button", re.compile("Re-verify with satellite")))
        page.wait_for_selector("button:has-text('Retire credits (buyer view)')", timeout=40000)
        at("retire", st, 1)
        click(role("button", re.compile("Retire credits")))
        click(page.get_by_placeholder(re.compile("Beneficiary")))
        page.keyboard.type("ACME Corp", delay=80)
        click(role("button", re.compile(r"^Retire \d+ credits")))
        time.sleep(1.4)
        at("retire", st, 2)
        click(role("link", re.compile("Public proof page")))
        page.wait_for_selector("text=Check it yourself", timeout=20000)
        time.sleep(1.6)
        smooth_scroll(560, 1.6)
        smooth_scroll(1000, 1.2)
        end("retire")

        # ---------------------------------------------------------------- 8. on-chain
        st = begin("onchain", "08", "On-chain")
        page.evaluate(f"""() => window.__demo.card(`
          <div class="dc-label">Deployed on Base Sepolia · chain 84532</div>
          <div class="dc-title" style="font-size:64px;margin:22px 0">TerraProof.sol<br><i>on-chain</i></div>
          <div class="dc-mono"><span class="k">contract </span>{CONTRACT}<br><span class="k">issued   </span>36 credits · Sentinel-2 evidence hash anchored<br><span class="k">tx       </span>{ISSUE_TX}</div>`)""")
        at("onchain", st, 1)
        page.evaluate("() => window.__demo.card(null)")
        time.sleep(0.9)
        click(role("link", re.compile("Back to registry")))
        page.wait_for_selector("button:has-text('On-chain')", timeout=20000)
        time.sleep(1.0)
        click(role("button", "On-chain", exact=True))
        page.wait_for_selector("text=Parcels · 1", timeout=40000)
        time.sleep(0.6)
        click(role("tab", re.compile("Parcels")))
        click(role("button", re.compile("Savalou demo parcel")))
        time.sleep(1.0)
        ring(page.get_by_text(re.compile("Evidence hash")).first, 3500)
        at("onchain", st, 2)
        page.evaluate("""() => window.__demo.card(`
          <div class="dc-label">Smart contract tests</div>
          <div class="dc-title" style="font-size:80px;margin:22px 0"><i>17</i> passing</div>
          <div class="dc-mono"><span class="ok">✓</span> rejects overlapping parcels (double counting)<br><span class="ok">✓</span> enforces the per-cell issuance ceiling<br><span class="ok">✓</span> freezes transfers and retirement when flagged<br><span class="ok">✓</span> revokes credits of a flagged parcel<br><span class="ok">✓</span> burns credits and records the retirement</div>`)""")
        end("onchain")

        # ---------------------------------------------------------------- 9. outro
        st = begin("outro", "09", "What's next")
        page.evaluate("""() => window.__demo.card(`
          <div class="dc-label">What's next</div>
          <div class="dc-row" style="margin-top:34px">
            <span class="dc-chip">Registry of registries</span><span class="dc-chip">Smallholders first</span><span class="dc-chip">Article 6 · COP31</span></div>
          <div class="dc-title" style="margin-top:44px">Terra<i>Proof</i></div>
          <div class="dc-sub">Carbon credits you can verify from space.</div>
          <div class="dc-row"><span class="dc-chip">terraproof-rust.vercel.app</span><span class="dc-chip">github.com/Leandre99/TerraProof</span></div>`)""")
        page.evaluate("() => window.__demo.chapterOff()")
        end("outro", 2.5)
        total = now()

        page.close()
        vid_path = page.video.path()
        ctx.close()
        browser.close()

    print(f"capture done: {total:.1f}s")
    build(vid_path, scene_t0, total)


# ----------------------------------------------------------------------------- audio + mux
def read_wav(path):
    with wave.open(str(path), "rb") as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    return data


def make_pad(n, sr=SR):
    """A very quiet generated pad (Am - F - C - G) so the video is not dry."""
    t = np.arange(n) / sr
    chords = [(110.0, 164.81, 220.0, 261.63), (87.31, 174.61, 220.0, 261.63), (130.81, 196.0, 261.63, 329.63), (98.0, 196.0, 246.94, 293.66)]
    out = np.zeros(n, dtype=np.float32)
    seg = 8.0
    for i in range(int(t[-1] // seg) + 1):
        a, b = int(i * seg * sr), min(n, int((i + 1) * seg * sr))
        if a >= n:
            break
        tt = t[a:b] - t[a]
        env = np.minimum(1, np.minimum(tt / 1.8, (seg - tt) / 1.8 + 0.0))
        env = np.clip(env, 0, 1)
        chord = np.zeros(b - a, dtype=np.float32)
        for f in chords[i % 4]:
            for det in (-0.6, 0.6):
                chord += np.sin(2 * math.pi * (f + det) * tt) / 8
        out[a:b] += chord * env
    out *= 0.5 * (0.85 + 0.15 * np.sin(2 * math.pi * t / 17.0))
    return out


def build(video, scene_t0, total):
    n = int((total - TRIM + 1.0) * SR)
    voice = np.zeros(n, dtype=np.float32)
    for sec, t in scene_t0.items():
        clip = read_wav(ROOT / "voice" / f"{sec}.wav")
        a = int(max(0.0, t - TRIM) * SR)
        voice[a:a + len(clip)] += clip[: max(0, n - a)]
    pad = make_pad(n)
    fade = np.ones(n, dtype=np.float32)
    f = int(2.5 * SR)
    fade[:f] = np.linspace(0, 1, f)
    fade[-f:] = np.linspace(1, 0, f)
    mix = voice * 0.95 + pad * 0.075 * fade
    mix = np.clip(mix, -1, 1)
    wav_path = OUT / "mix.wav"
    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    final = OUT / "terraproof-demo.mp4"
    cmd = [ff, "-y", "-ss", str(TRIM), "-i", str(video), "-i", str(wav_path),
           "-map", "0:v:0", "-map", "1:a:0", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(final)]
    subprocess.run(cmd, check=True, capture_output=True)
    print("wrote", final, f"{final.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
