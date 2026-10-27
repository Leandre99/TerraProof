"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Minimal bilingual (EN / FR) layer. English strings are the keys, so a missing French entry simply
 * falls back to English and never breaks the UI. The choice is remembered per browser.
 */

export type Locale = "en" | "fr";
const KEY = "terraproof:locale";

const FR: Record<string, string> = {
  // header / nav
  Problem: "Problème",
  "How it works": "Comment ça marche",
  Vision: "Vision",
  "Field notes": "Notes de terrain",
  "Open the registry": "Ouvrir le registre",
  "Try the live demo": "Essayer la démo",
  Track: "Piste",
  "Carbon Markets & Emissions Transparency · IEEE ClimateChain 2026": "Marchés carbone & transparence des émissions · IEEE ClimateChain 2026",
  // hero
  "Carbon credits": "Des crédits carbone",
  "you can": "que vous pouvez",
  verify: "vérifier",
  "from space.": "depuis l'espace.",
  "TerraProof is a carbon registry where double counting is impossible by construction, every credit is backed by satellite evidence, and a credit dies when the forest does.":
    "TerraProof est un registre carbone où le double comptage est impossible par construction, où chaque crédit repose sur une preuve satellite, et où un crédit s'éteint quand la forêt disparaît.",
  "↑ Not a screenshot. Claim some cells, then try to claim someone else's.": "↑ Ce n'est pas une capture. Réclamez des cellules, puis essayez de prendre celles d'un autre.",
  // ticker
  "SENTINEL-2 · 10 M RESOLUTION": "SENTINEL-2 · RÉSOLUTION 10 M",
  "5-DAY REVISIT": "REVISITE TOUS LES 5 JOURS",
  "GEOHASH/8 CELLS · 38 × 19 M": "CELLULES GEOHASH/8 · 38 × 19 M",
  "1 CELL, 1 OWNER": "1 CELLULE, 1 PROPRIÉTAIRE",
  "ERC-1155 CREDITS": "CRÉDITS ERC-1155",
  "EVIDENCE HASH ON-CHAIN": "EMPREINTE DE PREUVE ON-CHAIN",
  "FREEZE · REVOKE · RETIRE": "GELER · RÉVOQUER · RETIRER",
  "OPEN, PUBLIC PROOFS": "PREUVES PUBLIQUES ET OUVERTES",
  // problem
  "The problem": "Le problème",
  "Carbon markets run on trust. Trust is what they're": "Les marchés carbone reposent sur la confiance. C'est ce qui leur",
  "missing.": "manque.",
  "The same forest, sold twice.": "La même forêt, vendue deux fois.",
  "Registries don't talk to each other. One hectare can back credits in several programmes at once, and nobody can prove it.":
    "Les registres ne se parlent pas. Un même hectare peut garantir des crédits dans plusieurs programmes à la fois, sans que personne ne puisse le prouver.",
  "Claims no one can check.": "Des déclarations que personne ne peut vérifier.",
  "Verification is a consultant visiting once every few years. Buyers pay for carbon they can't see.":
    "La vérification, c'est un consultant qui passe tous les quelques années. Les acheteurs paient un carbone qu'ils ne voient pas.",
  "Credits that outlive the trees.": "Des crédits qui survivent aux arbres.",
  "A forest cleared after issuance keeps its credits. The market has no way to take them back.":
    "Une forêt rasée après l'émission garde ses crédits. Le marché n'a aucun moyen de les reprendre.",
  // how
  "From a drawn polygon to a retired credit,": "D'un polygone dessiné à un crédit retiré,",
  "with proof at every step.": "avec une preuve à chaque étape.",
  Step: "Étape",
  Claim: "Réclamer",
  Audit: "Auditer",
  Mint: "Émettre",
  Watch: "Surveiller",
  Retire: "Retirer",
  "Draw a parcel. It is cut into ~38 × 19 m cells and written to the ledger. A cell has one owner, ever.":
    "Dessinez une parcelle. Elle est découpée en cellules d'environ 38 × 19 m et inscrite au registre. Une cellule n'a qu'un seul propriétaire, pour toujours.",
  "An oracle reads Sentinel-2 over the polygon, computes NDVI and proposes the credits the vegetation supports.":
    "Un oracle lit Sentinel-2 sur le polygone, calcule le NDVI et propose les crédits que la végétation justifie.",
  "The contract issues credits and anchors the hash of the satellite report beside them.":
    "Le contrat émet les crédits et ancre à côté l'empreinte du rapport satellite.",
  "Monitoring never stops. If the canopy collapses, the parcel freezes, then credits are revoked.":
    "La surveillance ne s'arrête jamais. Si le couvert s'effondre, la parcelle est gelée, puis les crédits sont révoqués.",
  "Buyers retire credits on-chain. A public proof page, with QR code, remains forever.":
    "Les acheteurs retirent les crédits sur la chaîne. Une page de preuve publique, avec QR code, reste pour toujours.",
  "Living credits": "Crédits vivants",
  "A carbon credit that can be": "Un crédit carbone qui peut être",
  "switched off.": "éteint.",
  "Today a credit is a PDF. Here it is a token whose parcel is monitored continuously. When the oracle sees vegetation collapse, the parcel is":
    "Aujourd'hui un crédit est un PDF. Ici, c'est un jeton dont la parcelle est surveillée en continu. Quand l'oracle voit la végétation s'effondrer, la parcelle est",
  frozen: "gelée",
  ": transfers and retirement stop instantly. If the loss is confirmed, credits are": " : transferts et retraits s'arrêtent immédiatement. Si la perte est confirmée, les crédits sont",
  revoked: "révoqués",
  ". False alarm? The flag is lifted.": ". Fausse alerte ? Le gel est levé.",
  // vision
  "Where this goes": "Où cela mène",
  "One open ledger of the world's": "Un registre ouvert de toutes les",
  "carbon claims.": "déclarations carbone du monde.",
  "Registry of registries": "Registre des registres",
  "Cross-check Verra, Gold Standard and national registries to catch double counting beyond a single ledger.":
    "Croiser Verra, Gold Standard et les registres nationaux pour détecter le double comptage au-delà d'un seul registre.",
  "Smallholders first": "Les petits exploitants d'abord",
  "Verification that costs cents, not tens of thousands. Starting in Benin and West Africa, where agroforestry is booming and certification is out of reach.":
    "Une vérification qui coûte des centimes, pas des dizaines de milliers. En commençant au Bénin et en Afrique de l'Ouest, où l'agroforesterie explose et où la certification reste hors de portée.",
  "Article 6 ready": "Prêt pour l'article 6",
  "Transparent, auditable units for country-to-country carbon trading, the heart of the COP31 agenda.":
    "Des unités transparentes et auditables pour le commerce de carbone entre pays, au cœur de l'agenda de la COP31.",
  "Open MRV methods": "Méthodes MRV ouvertes",
  "Pluggable, peer-reviewed methods (SAR, allometry, ground truth) so science, not marketing, sets the price.":
    "Des méthodes interchangeables et revues par les pairs (radar SAR, allométrie, vérité terrain) pour que la science, et non le marketing, fixe le prix.",
  // field notes
  "What is real, and what is a proof of concept.": "Ce qui est réel, et ce qui est une preuve de concept.",
  Real: "Réel",
  Proxy: "Approximation",
  "Demo only": "Démo seulement",
  "Sentinel-2 imagery and NDVI computed live from Microsoft Planetary Computer.": "Imagerie Sentinel-2 et NDVI calculés en direct depuis Microsoft Planetary Computer.",
  "Double-counting protection, freezing, revocation and retirement, enforced by a Solidity contract with a full test suite.":
    "Protection contre le double comptage, gel, révocation et retrait, appliqués par un contrat Solidity avec une suite de tests complète.",
  "Credits come from a vegetation-vigour formula, not a validated carbon methodology. A production registry needs accredited science.":
    "Les crédits viennent d'une formule de vigueur de la végétation, pas d'une méthodologie carbone validée. Un registre réel exige une science accréditée.",
  "“Simulate deforestation” injects a synthetic loss so you can watch the whole lifecycle on demand.":
    "« Simulate deforestation » injecte une perte synthétique pour voir tout le cycle de vie à la demande. Le « replay » d'une vraie déforestation, lui, utilise de vraies images.",
  "Accuracy measured against Hansen forest-loss data on held-out sites, published with its limits.":
    "Précision mesurée sur des sites de test mis de côté, face aux données de perte forestière Hansen, publiée avec ses limites.",
  "Two independent signals (greenness and canopy moisture) and a verifier quorum: any verifier can freeze, several must agree to issue or burn.":
    "Deux signaux indépendants (verdure et humidité du couvert) et un quorum de vérificateurs : un seul peut geler, plusieurs doivent s'accorder pour émettre ou brûler.",
  // CTA
  "See a credit live.": "Voyez un crédit en direct.",
  "Then kill one.": "Puis tuez-en un.",
  "Register a parcel on real satellite imagery, try to double-count it, then watch the forest vanish.":
    "Enregistrez une parcelle sur de vraies images satellite, tentez de la compter deux fois, puis regardez la forêt disparaître.",
  "IEEE ClimateChain Global Hackathon 2026 · Carbon Markets & Emissions Transparency": "IEEE ClimateChain Global Hackathon 2026 · Marchés carbone & transparence des émissions",
  // app
  Registry: "Registre",
  Simulation: "Simulation",
  "On-chain": "On-chain",
  Reset: "Réinitialiser",
  Register: "Enregistrer",
  Parcels: "Parcelles",
  Ledger: "Registre public",
  "Register a parcel": "Enregistrer une parcelle",
  "Outline your land. It is split into ~38 × 19 m cells; the contract refuses any cell that is already taken.":
    "Délimitez votre terre. Elle est découpée en cellules d'environ 38 × 19 m ; le contrat refuse toute cellule déjà prise.",
  "Parcel name (e.g. Cajou Adjigo)": "Nom de la parcelle (ex. Cajou Adjigo)",
  Draw: "Dessiner",
  "Drawing…": "Dessin…",
  Undo: "Annuler",
  Clear: "Effacer",
  Corners: "Sommets",
  Hectares: "Hectares",
  "Reserve a share for the community": "Réserver une part à la communauté",
  "A village fund or cooperative receives this share of every issuance. It is written into the contract and cannot be changed later.":
    "Un fonds villageois ou une coopérative reçoit cette part de chaque émission. Elle est inscrite dans le contrat et ne peut plus être modifiée.",
  "Register on the ledger": "Enregistrer sur le registre",
  "Writing to the ledger…": "Écriture sur le registre…",
  "or test the guard rail": "ou testez le garde-fou",
  "Claim land that's already registered": "Réclamer une terre déjà enregistrée",
  "Click the map to place corners": "Cliquez sur la carte pour placer les sommets",
  "Double counting blocked": "Double comptage bloqué",
  Rejected: "Rejeté",
  "Impact · computed from the ledger": "Impact · calculé depuis le registre",
  "Hectares on the ledger": "Hectares au registre",
  "Live credits · tCO₂e": "Crédits actifs · tCO₂e",
  "Credits stopped in time": "Crédits stoppés à temps",
  "Double claims blocked": "Doubles réclamations bloquées",
  "Reserved for communities": "Réservés aux communautés",
  "Public proof page": "Page de preuve publique",
  "Verify with satellite & issue credits": "Vérifier par satellite et émettre les crédits",
  "Re-verify with satellite": "Revérifier par satellite",
  "Run monitoring": "Lancer la surveillance",
  "Simulate deforestation": "Simuler une déforestation",
  "Revoke credits": "Révoquer les crédits",
  "Clear flag": "Lever le gel",
  "Retire credits (buyer view)": "Retirer des crédits (vue acheteur)",
  "Recompute it yourself": "Recalculez-le vous-même",
  "Recompute from the satellite archive": "Recalculer depuis l'archive satellite",
  "Satellite evidence": "Preuve satellite",
  Retirements: "Retraits",
  "Full history": "Historique complet",
  "Check it yourself": "Vérifiez par vous-même",
  "Scan to open this proof and verify the evidence.": "Scannez pour ouvrir cette preuve et vérifier les éléments.",
  "Copy link": "Copier le lien",
  "Replay a real clearing": "Rejouer une vraie déforestation",
};

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (s: string) => string;
}

const LocaleContext = createContext<Ctx>({ locale: "en", setLocale: () => {}, t: (s) => s });

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "fr" || saved === "en") setLocaleState(saved);
      else if (navigator.language?.toLowerCase().startsWith("fr")) setLocaleState("fr");
    } catch {
      /* storage unavailable: keep English */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(() => ({ locale, setLocale, t: (s) => (locale === "fr" ? (FR[s] ?? s) : s) }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useT = () => useContext(LocaleContext).t;
export const useLocale = () => useContext(LocaleContext);

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex rounded-[6px] border-[1.5px] border-ink bg-surface p-0.5 text-xs font-semibold" role="group" aria-label="Language">
      {(["en", "fr"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`rounded-[4px] px-2 py-1 uppercase transition ${locale === l ? "bg-ink text-bg" : "text-mute hover:text-ink"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
