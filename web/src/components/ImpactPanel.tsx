"use client";

import { useMemo } from "react";
import { BadgeCheck, Ban, ShieldX, Trees, Users } from "lucide-react";
import type { LedgerEvent, Parcel, Retirement } from "@/lib/registry/types";
import { useT } from "@/lib/i18n";

/**
 * Impact numbers computed from the ledger itself, so every figure can be traced to registry state.
 * They count credits (a vegetation-vigour proxy, see the methodology), not measured tonnes of CO2.
 */
export function ImpactPanel({ parcels, events, retirements }: { parcels: Parcel[]; events: LedgerEvent[]; retirements: Retirement[] }) {
  const t = useT();
  const m = useMemo(() => {
    const hectares = parcels.reduce((a, p) => a + p.areaHa, 0);
    const live = parcels.reduce((a, p) => a + p.holdings + (p.community?.holdings ?? 0), 0);
    const retired = retirements.reduce((a, r) => a + r.amount, 0);
    const revoked = parcels.reduce((a, p) => a + p.revoked, 0);
    const community = parcels.reduce((a, p) => a + (p.community?.holdings ?? 0), 0);
    const blocked = events.filter((e) => e.type === "RegistrationRejected").length;
    const frozenHa = parcels.filter((p) => p.status === "flagged").reduce((a, p) => a + p.areaHa, 0);
    return { hectares, live, retired, revoked, community, blocked, frozenHa };
  }, [parcels, events, retirements]);

  const items = [
    { icon: Trees, label: "Hectares on the ledger", value: m.hectares.toFixed(1), hint: m.frozenHa ? `${m.frozenHa.toFixed(1)} ha frozen` : "all monitored" },
    { icon: BadgeCheck, label: "Live credits · tCO₂e", value: String(m.live), hint: `${m.retired} retired` },
    { icon: Ban, label: "Credits stopped in time", value: String(m.revoked), hint: "revoked after loss" },
    { icon: ShieldX, label: "Double claims blocked", value: String(m.blocked), hint: "refused by the registry" },
    { icon: Users, label: "Reserved for communities", value: String(m.community), hint: "credits held by villages" },
  ];

  return (
    <div className="card p-3" aria-label="Impact">
      <p className="label mb-2">{t("Impact · computed from the ledger")}</p>
      <dl className="grid grid-cols-5 gap-1.5 text-center">
        {items.map(({ icon: Icon, label, value, hint }) => (
          <div key={label} className="rounded-[6px] border border-ink/20 bg-surface px-1 py-2" title={`${t(label)}: ${hint}`}>
            <Icon className="mx-auto h-3.5 w-3.5 text-brand" />
            <dd className="mt-1 font-display text-xl font-semibold leading-none">{value}</dd>
            <dt className="mt-1 text-[9px] uppercase leading-tight tracking-wider text-mute">{t(label)}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
