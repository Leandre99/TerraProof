"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/ui";
import { ClaimBoard } from "@/components/ClaimBoard";
import { CreditCertificate } from "@/components/CreditCertificate";
import { LanguageToggle, useT } from "@/lib/i18n";

const ticker = [
  "SENTINEL-2 · 10 M RESOLUTION",
  "5-DAY REVISIT",
  "GEOHASH/8 CELLS · 38 × 19 M",
  "1 CELL, 1 OWNER",
  "ERC-1155 CREDITS",
  "EVIDENCE HASH ON-CHAIN",
  "FREEZE · REVOKE · RETIRE",
  "OPEN, PUBLIC PROOFS",
];

const problems = [
  {
    n: "01",
    title: "The same forest, sold twice.",
    body: "Registries don't talk to each other. One hectare can back credits in several programmes at once, and nobody can prove it.",
  },
  {
    n: "02",
    title: "Claims no one can check.",
    body: "Verification is a consultant visiting once every few years. Buyers pay for carbon they can't see.",
  },
  {
    n: "03",
    title: "Credits that outlive the trees.",
    body: "A forest cleared after issuance keeps its credits. The market has no way to take them back.",
  },
];

const steps = [
  ["Claim", "Draw a parcel. It is cut into ~38 × 19 m cells and written to the ledger. A cell has one owner, ever."],
  ["Audit", "An oracle reads Sentinel-2 over the polygon, computes NDVI and proposes the credits the vegetation supports."],
  ["Mint", "The contract issues credits and anchors the hash of the satellite report beside them."],
  ["Watch", "Monitoring never stops. If the canopy collapses, the parcel freezes, then credits are revoked."],
  ["Retire", "Buyers retire credits on-chain. A public proof page, with QR code, remains forever."],
];

const roadmap = [
  ["Registry of registries", "Cross-check Verra, Gold Standard and national registries to catch double counting beyond a single ledger."],
  ["Smallholders first", "Verification that costs cents, not tens of thousands. Starting in Benin and West Africa, where agroforestry is booming and certification is out of reach."],
  ["Article 6 ready", "Transparent, auditable units for country-to-country carbon trading, the heart of the COP31 agenda."],
  ["Open MRV methods", "Pluggable, peer-reviewed methods (SAR, allometry, ground truth) so science, not marketing, sets the price."],
];

const notes = [
  ["stamp-brand", "Real", "Sentinel-2 imagery and NDVI computed live from Microsoft Planetary Computer."],
  ["stamp-brand", "Real", "Double-counting protection, freezing, revocation and retirement, enforced by a Solidity contract with a full test suite."],
  ["stamp-brand", "Real", "Accuracy measured against Hansen forest-loss data on held-out sites, published with its limits."],
  ["stamp-brand", "Real", "Two independent signals (greenness and canopy moisture) and a verifier quorum: any verifier can freeze, several must agree to issue or burn."],
  ["stamp-amber", "Proxy", "Credits come from a vegetation-vigour formula, not a validated carbon methodology. A production registry needs accredited science."],
  ["stamp-danger", "Demo only", "“Simulate deforestation” injects a synthetic loss so you can watch the whole lifecycle on demand."],
];

export default function Landing() {
  const t = useT();
  return (
    <div className="relative overflow-x-hidden">
      {/* HEADER */}
      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm md:flex">
          {[
            ["#problem", "Problem"],
            ["#how", "How it works"],
            ["#vision", "Vision"],
            ["#field-notes", "Field notes"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="label !text-ink hover:underline hover:decoration-lime hover:decoration-[3px] hover:underline-offset-4">
              {t(label)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link href="/app" className="btn btn-primary btn-sm">
            {t("Open the registry")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-7xl px-5 pb-10 pt-6 sm:px-8 lg:pt-12">
        <div className="bg-topo pointer-events-none absolute inset-x-0 -top-24 h-[640px] opacity-[0.09]" aria-hidden />
        <div className="relative grid items-end gap-8 lg:grid-cols-[1fr_300px]">
          <div className="animate-rise">
            <p className="label mb-6 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="stamp stamp-brand">{t("Track")}</span> {t("Carbon Markets & Emissions Transparency · IEEE ClimateChain 2026")}
            </p>
            <h1 className="font-display text-[56px] leading-[0.95] tracking-[-0.02em] sm:text-[88px] lg:text-[112px]">
              {t("Carbon credits")}
              <br />
              {t("you can")}{" "}
              <span className="relative inline-block italic">
                <span className="text-marker">{t("verify")}</span>
              </span>
              <br />
              {t("from space.")}
            </h1>
          </div>
          <div className="animate-rise pb-3 [animation-delay:150ms]">
            <p className="text-[17px] leading-relaxed text-ink/80">
              {t(
                "TerraProof is a carbon registry where double counting is impossible by construction, every credit is backed by satellite evidence, and a credit dies when the forest does."
              )}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/app" className="btn btn-primary h-12 px-6 text-[15px]">
                {t("Try the live demo")} <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="btn btn-ghost h-12 px-5 text-[15px]">
                {t("How it works")}
              </a>
            </div>
          </div>
        </div>

        <div className="animate-rise mt-12 [animation-delay:250ms]">
          <ClaimBoard />
          <p className="label mt-3 text-center">{t("↑ Not a screenshot. Claim some cells, then try to claim someone else's.")}</p>
        </div>
      </section>

      {/* TICKER */}
      <div className="relative z-10 mt-6 overflow-hidden border-y-[1.5px] border-ink bg-ink py-3 text-bg" aria-hidden>
        <div className="flex w-max animate-marquee whitespace-nowrap">
          {[...ticker, ...ticker].map((s, i) => (
            <span key={i} className="mx-6 font-mono text-[12px] tracking-[0.16em]">
              {t(s)} <span className="ml-6 text-lime">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* PROBLEM */}
      <section id="problem" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-24 sm:px-8">
        <p className="eyebrow">{t("The problem")}</p>
        <h2 className="mt-4 max-w-3xl font-display text-5xl leading-[1.02] tracking-[-0.015em] sm:text-7xl">
          {t("Carbon markets run on trust. Trust is what they're")} <span className="italic">{t("missing.")}</span>
        </h2>
        <div className="mt-16 grid border-y-[1.5px] border-ink md:grid-cols-3 md:divide-x-[1.5px] md:divide-ink">
          {problems.map((p) => (
            <article key={p.n} className="px-0 py-8 md:px-8 md:first:pl-0 md:last:pr-0">
              <p className="font-display text-[72px] leading-none text-brand">{p.n}</p>
              <h3 className="mt-5 font-display text-3xl leading-tight">{t(p.title)}</h3>
              <p className="mt-3 leading-relaxed text-ink/75">{t(p.body)}</p>
            </article>
          ))}
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="relative scroll-mt-8 border-y-[1.5px] border-ink bg-raised/60 py-24">
        <div className="bg-topo-soft absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
          <p className="eyebrow">{t("How it works")}</p>
          <h2 className="mt-4 max-w-3xl font-display text-5xl leading-[1.02] tracking-[-0.015em] sm:text-7xl">
            {t("From a drawn polygon to a retired credit,")} <span className="italic">{t("with proof at every step.")}</span>
          </h2>

          <ol className="mt-16 grid gap-0 md:grid-cols-5">
            {steps.map(([title, body], i) => (
              <li key={title} className="relative border-t-[1.5px] border-ink pb-8 pr-6 pt-6 md:border-t-0 md:pt-0">
                <div className="hidden items-center md:flex">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-ink bg-lime font-mono text-sm font-medium">{i + 1}</span>
                  {i < steps.length - 1 && <span className="h-[1.5px] flex-1 bg-ink" />}
                </div>
                <p className="label mb-1 md:hidden">
                  {t("Step")} {i + 1}
                </p>
                <h3 className="font-display text-4xl leading-none md:mt-5">{t(title)}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink/75">{t(body)}</p>
              </li>
            ))}
          </ol>

          {/* LIVING CREDITS */}
          <div className="mt-24 grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="eyebrow">{t("Living credits")}</p>
              <h3 className="mt-4 font-display text-5xl leading-[1.02] tracking-[-0.015em] sm:text-6xl">
                {t("A carbon credit that can be")} <span className="italic">{t("switched off.")}</span>
              </h3>
              <p className="mt-6 text-[17px] leading-relaxed text-ink/80">
                {t("Today a credit is a PDF. Here it is a token whose parcel is monitored continuously. When the oracle sees vegetation collapse, the parcel is")}{" "}
                <b>{t("frozen")}</b>
                {t(": transfers and retirement stop instantly. If the loss is confirmed, credits are")} <b>{t("revoked")}</b>
                {t(". False alarm? The flag is lifted.")}
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              <CreditCertificate state="active" serial="TP-0003" parcel="Cajou Adjigo" tonnes={88} rotate={-1.5} />
              <CreditCertificate state="frozen" serial="TP-0003" parcel="Cajou Adjigo" tonnes={88} rotate={1} />
              <CreditCertificate state="revoked" serial="TP-0003" parcel="Cajou Adjigo" tonnes={88} rotate={-0.5} />
            </div>
          </div>
        </div>
      </section>

      {/* VISION */}
      <section id="vision" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-24 sm:px-8">
        <p className="eyebrow">{t("Where this goes")}</p>
        <h2 className="mt-4 max-w-4xl font-display text-5xl leading-[1.02] tracking-[-0.015em] sm:text-7xl">
          {t("One open ledger of the world's")} <span className="italic">{t("carbon claims.")}</span>
        </h2>
        <ul className="mt-14 grid border-t-[1.5px] border-ink md:grid-cols-2">
          {roadmap.map(([title, body], i) => (
            <li key={title} className="group flex gap-6 border-b-[1.5px] border-ink py-8 md:pr-10 md:[&:nth-child(odd)]:border-r-[1.5px] md:[&:nth-child(even)]:pl-10">
              <span className="label pt-2">0{i + 1}</span>
              <div>
                <h3 className="font-display text-3xl leading-tight">
                  {t(title)} <ArrowUpRight className="inline h-5 w-5 -translate-y-1 text-brand transition group-hover:translate-x-1 group-hover:-translate-y-2" />
                </h3>
                <p className="mt-2 leading-relaxed text-ink/75">{t(body)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* FIELD NOTES (honesty) */}
      <section id="field-notes" className="mx-auto max-w-7xl scroll-mt-8 px-5 pb-24 sm:px-8">
        <div className="border-[1.5px] border-dashed border-ink/60 bg-raised/50 p-8 sm:p-12">
          <p className="eyebrow !text-amber">{t("Field notes")}</p>
          <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">{t("What is real, and what is a proof of concept.")}</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {notes.map(([cls, tag, text]) => (
              <div key={text} className="flex items-start gap-4">
                <dt className="pt-0.5">
                  <span className={`stamp ${cls}`}>{t(tag)}</span>
                </dt>
                <dd className="leading-relaxed text-ink/80">{t(text)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="relative overflow-hidden rounded-[6px] border-[1.5px] border-ink bg-ink px-8 py-16 text-center text-bg sm:py-24">
          <div className="bg-topo-light absolute inset-0 opacity-[0.14]" aria-hidden />
          <h2 className="relative font-display text-5xl leading-none sm:text-8xl">
            {t("See a credit live.")}
            <br />
            <span className="italic text-lime">{t("Then kill one.")}</span>
          </h2>
          <p className="relative mx-auto mt-6 max-w-xl text-bg/75">
            {t("Register a parcel on real satellite imagery, try to double-count it, then watch the forest vanish.")}
          </p>
          <Link href="/app" className="btn btn-lime relative mt-10 h-14 px-8 text-base">
            {t("Open the registry")} <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t-[1.5px] border-ink">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
          <Logo size={24} />
          <p className="label text-center">{t("IEEE ClimateChain Global Hackathon 2026 · Carbon Markets & Emissions Transparency")}</p>
        </div>
      </footer>
    </div>
  );
}
