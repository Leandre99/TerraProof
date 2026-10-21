import Link from "next/link";
import { ArrowRight, Boxes, Eye, Globe2, Layers, Satellite, ShieldCheck, Sprout, Timer, Fingerprint, Network, Coins, FlaskConical } from "lucide-react";
import { Logo } from "@/components/ui";
import { HeroVisual } from "@/components/HeroVisual";

const problems = [
  {
    icon: Layers,
    title: "The same forest, sold twice",
    body: "Registries don't talk to each other. One hectare can back credits in several programmes at once and nobody can prove it.",
  },
  {
    icon: Eye,
    title: "Claims no one can check",
    body: "Verification is a consultant visiting once every few years. Buyers pay for carbon they can't see.",
  },
  {
    icon: Timer,
    title: "Credits that outlive the trees",
    body: "A forest cleared after issuance keeps its credits. The market has no way to take them back.",
  },
];

const steps = [
  {
    n: "01",
    icon: Fingerprint,
    title: "Claim land, once",
    body: "A farmer draws a parcel. It is cut into ~38 × 19 m geohash cells and written to the ledger. A cell can only ever belong to one parcel.",
  },
  {
    n: "02",
    icon: Satellite,
    title: "The satellite audits it",
    body: "The MRV oracle reads Sentinel-2 imagery over the polygon, computes NDVI and proposes the credits the vegetation supports.",
  },
  {
    n: "03",
    icon: Coins,
    title: "Credits are minted with evidence",
    body: "The smart contract issues ERC-1155 credits and anchors the hash of the satellite report next to them. Anyone can re-check it.",
  },
  {
    n: "04",
    icon: ShieldCheck,
    title: "Credits stay alive",
    body: "Monitoring never stops. If the canopy disappears, credits freeze, then are revoked. Buyers retire what's left with a public proof page.",
  },
];

const roadmap = [
  { icon: Network, title: "Registry of registries", body: "Cross-check Verra, Gold Standard and national registries to detect double counting beyond a single ledger." },
  { icon: Sprout, title: "Smallholders first", body: "Verification that costs cents, not tens of thousands. Starting in Benin and West Africa, where agroforestry is booming and certification is out of reach." },
  { icon: Globe2, title: "Article 6 ready", body: "Transparent, auditable units for country-to-country carbon trading, the heart of the COP31 agenda." },
  { icon: Boxes, title: "Open MRV methodologies", body: "Pluggable, peer-reviewed methods (allometry, SAR, ground-truth) so science, not marketing, sets the price." },
];

export default function Landing() {
  return (
    <div className="bg-aurora relative min-h-screen overflow-x-hidden">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[720px]" aria-hidden />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-mute md:flex">
          <a href="#problem" className="hover:text-ink">Problem</a>
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#vision" className="hover:text-ink">Vision</a>
          <a href="#honesty" className="hover:text-ink">Limits</a>
        </nav>
        <Link href="/app" className="btn btn-primary btn-sm">
          Launch demo <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* HERO */}
      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div className="animate-rise">
          <span className="pill pill-brand mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> IEEE ClimateChain · Carbon Markets &amp; Emissions Transparency
          </span>
          <h1 className="font-display text-[44px] font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[68px]">
            Carbon credits you can <span className="text-gradient">verify from space.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-mute">
            TerraProof is a carbon registry where double counting is impossible by construction, every credit is backed by satellite
            evidence, and a credit dies when the forest does.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/app" className="btn btn-primary h-12 px-6 text-[15px]">
              Try the live demo <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how" className="btn btn-ghost h-12 px-6 text-[15px]">
              See how it works
            </a>
          </div>
          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line/60 pt-6">
            {[
              ["10 m", "Sentinel-2 resolution"],
              ["5 days", "satellite revisit"],
              ["1 cell, 1 owner", "enforced by contract"],
            ].map(([v, k]) => (
              <div key={k}>
                <dt className="font-display text-xl font-semibold sm:text-2xl">{v}</dt>
                <dd className="mt-1 text-xs text-mute">{k}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="animate-rise [animation-delay:150ms]">
          <HeroVisual />
          <p className="mt-3 text-center text-[11px] text-mute/80">Illustration. Open the demo to run it on real imagery.</p>
        </div>
      </section>

      {/* PROBLEM */}
      <section id="problem" className="relative z-10 mx-auto max-w-6xl scroll-mt-16 px-5 py-20">
        <p className="eyebrow">The problem</p>
        <h2 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight tracking-tight">
          Carbon markets run on trust. Trust is what they're missing.
        </h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {problems.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-bg/60">
                <Icon className="h-5 w-5 text-brand" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-mute">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl scroll-mt-16 px-5 py-20">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight tracking-tight">
          From a drawn polygon to a retired credit, with proof at every step.
        </h2>
        <ol className="mt-12 grid gap-4 md:grid-cols-2">
          {steps.map(({ n, icon: Icon, title, body }) => (
            <li key={n} className="card relative overflow-hidden p-6">
              <span className="absolute right-5 top-4 font-display text-6xl font-semibold text-white/[0.04]">{n}</span>
              <Icon className="h-6 w-6 text-brand" />
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-mute">{body}</p>
            </li>
          ))}
        </ol>

        <div className="card mt-6 grid items-center gap-8 p-8 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="eyebrow">Living credits</p>
            <h3 className="mt-3 font-display text-3xl font-semibold leading-tight">
              A carbon credit that can be switched off.
            </h3>
            <p className="mt-4 leading-relaxed text-mute">
              Today a credit is a PDF. In TerraProof it is a token whose parcel is monitored continuously. When the oracle detects a
              sharp drop in vegetation, the parcel is <span className="font-semibold text-amber">frozen</span>: transfers and
              retirement stop instantly. If the loss is confirmed, credits are <span className="font-semibold text-danger">revoked</span>.
              False alarm? The flag is lifted.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 text-center text-xs font-semibold">
            {[
              ["Active", "pill-brand"],
              ["Frozen", "pill-amber"],
              ["Revoked", "pill-danger"],
            ].map(([label, cls], i, a) => (
              <div key={label} className="flex flex-1 items-center gap-2">
                <span className={`pill ${cls} flex-1 justify-center`}>{label}</span>
                {i < a.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-mute" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VISION */}
      <section id="vision" className="relative z-10 mx-auto max-w-6xl scroll-mt-16 px-5 py-20">
        <p className="eyebrow">Where this goes</p>
        <h2 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight">
          One open ledger of the world's carbon claims.
        </h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roadmap.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-5">
              <Icon className="h-5 w-5 text-sky" />
              <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HONESTY */}
      <section id="honesty" className="relative z-10 mx-auto max-w-6xl scroll-mt-16 px-5 py-20">
        <div className="card flex flex-col gap-6 border-amber/30 p-8 md:flex-row md:items-start">
          <FlaskConical className="h-8 w-8 shrink-0 text-amber" />
          <div>
            <h2 className="font-display text-2xl font-semibold">What is real, and what is a proof of concept</h2>
            <ul className="mt-4 grid gap-x-10 gap-y-2 text-[15px] leading-relaxed text-mute md:grid-cols-2">
              <li><span className="font-semibold text-ink">Real:</span> Sentinel-2 imagery and NDVI computed live from Microsoft Planetary Computer.</li>
              <li><span className="font-semibold text-ink">Real:</span> double-counting protection, freezing, revocation and retirement, enforced by a Solidity contract with a full test suite.</li>
              <li><span className="font-semibold text-ink">Proxy:</span> credits come from a vegetation-vigour formula, not a validated carbon methodology. A production registry needs accredited science.</li>
              <li><span className="font-semibold text-ink">Demo-only:</span> the "simulate deforestation" button injects a synthetic loss so you can watch the full lifecycle on demand.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-24">
        <div className="card relative overflow-hidden p-10 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(var(--brand)/0.16),transparent)]" aria-hidden />
          <h2 className="relative font-display text-4xl font-semibold tracking-tight">See a credit live, and kill one.</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-mute">Register a parcel on real satellite imagery, try to double-count it, then watch the forest vanish.</p>
          <Link href="/app" className="btn btn-primary relative mt-7 h-12 px-7 text-[15px]">
            Launch the demo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-mute sm:flex-row">
          <Logo size={22} />
          <p>Built for the IEEE ClimateChain Global Hackathon 2026 · Carbon Markets &amp; Emissions Transparency</p>
        </div>
      </footer>
    </div>
  );
}
