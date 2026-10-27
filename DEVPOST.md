# TerraProof: Devpost submission text

Copy each section into the matching Devpost field. Replace the `[...]` placeholders.

---

## Project name
TerraProof

## Tagline (short description)
Carbon credits you can verify from space: double counting blocked by smart contract, evidence anyone can recompute, credits that die when the forest does.

## Track alignment
**Track: Carbon Markets & Emissions Transparency**

| Track build item | TerraProof |
|---|---|
| Blockchain-based carbon credit verification | Credits are ERC-1155 tokens issued only against a Sentinel-2 report whose hash is anchored on-chain, listing the exact scenes used. A public page recomputes it from the satellite archive and checks the hash. |
| Real-time emissions tracking | A weekly monitoring job re-reads each parcel against the same season one year earlier and freezes credits when vegetation collapses. |
| Smart contracts to prevent double counting | Every parcel is cut into ~38 × 19 m geohash cells; the contract reverts any registration that touches a cell already claimed. |
| Transparent carbon trading platform | Every issuance, freeze, revocation and retirement is a public event, with a shareable proof page and QR code. |

## The problem
Voluntary carbon markets run on trust, and trust is what they lack.

1. **Double counting.** Registries don't talk to each other, so the same hectare can back credits in several programmes.
2. **Claims nobody can check.** Verification is a consultant visiting every few years; buyers cannot see what they pay for.
3. **Credits that outlive the trees.** A forest cleared after issuance keeps its credits.
4. **Exclusion.** Certification costs tens of thousands of dollars, which shuts out smallholders in West Africa and elsewhere, the people most able to restore land.

## What it does
1. **Claim land once.** A farmer draws a parcel on satellite imagery. It becomes geohash cells on the ledger; an overlapping claim is rejected by the contract itself.
2. **Two independent signals audit it.** The oracle reads Sentinel-2 over the polygon and computes greenness (NDVI) and canopy moisture (NDMI), with per-pixel cloud masking. A parcel is eligible only if both agree. This matters: forest replaced by green pasture keeps a high NDVI, but loses its moisture signal.
3. **Credits are minted with recomputable evidence.** The report lists the exact scenes; anyone can press *Recompute* on the proof page and get the same hash back.
4. **Living credits.** A weekly job compares each parcel with the same season a year earlier. A confirmed drop freezes it (no transfer, no retirement); confirmed loss revokes the credits; a false alarm clears the flag.
5. **A quorum, but a fast brake.** Issuing, revoking or unfreezing needs several distinct verifiers; any single verifier can freeze.
6. **Value for the people who restore land.** A parcel can reserve a share of every issuance for its village fund or cooperative, written into the contract and unchangeable.
7. **Retire with proof.** Buyers retire credits on-chain with a beneficiary and reason, producing a permanent public proof page with a QR code.

## How we built it
- **Smart contract:** Solidity 0.8.24, OpenZeppelin ERC-1155 + AccessControlEnumerable + Pausable. Verifier quorum with single-use votes, community share enforced at issuance, emergency pause that never blocks freezing or revoking, and a per-cell issuance ceiling that bounds a compromised oracle. 30 Hardhat tests, including a randomised invariant test (supply conservation, ceiling and cell uniqueness hold over 300 random operations).
- **MRV oracle (v1):** Next.js route handlers query Microsoft Planetary Computer (STAC + statistics) for Sentinel-2 L2A. The decision logic is a pure function shared by the API and the benchmark. In on-chain mode the oracle re-runs the analysis itself and never trusts a report sent by the browser.
- **Measured accuracy:** a reproducible benchmark against the Hansen Global Forest Change dataset, with a calibration half and a held-out test half; results, intervals and limits are published in the repository.
- **Web app:** Next.js 14, React, Tailwind, Leaflet on satellite imagery, ethers v6, bilingual English / French. A browser simulation applies the exact contract rules (so anyone can try the product without a wallet, still on live satellite data), and an on-chain adapter talks to the deployed contract.
- **Real-clearing replay:** the demo can replay a parcel that was really cleared, using the real Sentinel-2 history: credits issued with the forest standing, then frozen from real imagery. Nothing injected.

## Challenges we ran into
- **A silent data bug.** Since January 2022, Sentinel-2 scenes carry a +1000 offset on raw values. Our first oracle ignored it, so NDVI was biased low: dense forest read ~0.5 instead of ~0.85. The benchmark exposed it; v1 reads each scene's processing baseline and corrects it.
- **NDVI alone is fooled.** Many cleared forests turn into green pasture; their NDVI stays high. Adding an independent moisture signal and calibrating the freeze rule on held-out data fixed the largest class of misses.
- Turning a free-form polygon into a deterministic set of on-chain cells, so two drawings of the same land collide.
- Being honest about science: NDVI is a vegetation-vigour proxy, not a carbon stock. We label it as such everywhere.

## Measured accuracy
Benchmark against Hansen Global Forest Change, Amazon (Mato Grosso), held-out half, 7 cleared + 7 intact 15 ha sites: the previous engine gave credits to 7 of 7 cleared sites; v1 wrongly accepts 1 of 7 (95 % interval 3 to 51 %), accepts all 7 intact forests, freezes 6 of 7 cleared sites and raises 0 false alarms on 7 intact ones. Few sites, so wide intervals; not validated in Benin or West Africa (the forest there was too fragmented to yield ground-truth sites). Details: web/benchmark/RESULTS.md.

## What we learned
Trust in carbon markets is a data-integrity problem as much as a financial one. A ledger alone doesn't fix it: it needs independent physical evidence tied to every unit, evidence that anyone can recompute, and a measured error rate published next to the product.

## What's next
- **Registry of registries:** cross-check Verra, Gold Standard and national registries to catch double counting beyond a single ledger.
- **Validated methodologies:** pluggable, peer-reviewed MRV methods (SAR for cloudy regions, allometry, ground-truth uploads, permanence buffers).
- **Independent verifiers:** the contract already supports a quorum; the next step is running the keys at different organisations, with staking and slashing.
- **Smallholders first:** USSD / WhatsApp onboarding and verification that costs cents, starting in Benin and West Africa.
- **Article 6 ready:** transparent, auditable units for country-to-country carbon trading, aligned with the COP31 agenda.

## Target users, scalability and adoption
- **Users:** smallholder farmers and cooperatives (issuers), companies and funds buying offsets (buyers), registries, auditors and regulators (verifiers).
- **Scale:** satellite data is free and global; verifying a parcel is a handful of API calls. Cells are a global grid, so the same registry works anywhere.
- **Adoption:** a farmer needs only a phone and a drawn polygon; a buyer needs only a link to a proof page. The registry can sit in front of existing programmes as a double-counting check before it replaces anything.

## Honest limitations
- Credits come from `area_ha × max(0, mean NDVI − 0.15) × 60 tCO₂e`. This is a proof of concept, not a validated carbon methodology, and the benchmark validates presence and loss of standing vegetation, **not** the carbon quantity.
- The verifier quorum is real in the contract, but in this deployment all verifier keys live on one server: it shows the mechanism, not independence.
- The accuracy benchmark uses few sites per class (see the confidence intervals) and could not find enough ground-truth sites in the Benin / Togo / Nigeria forest belt, which is fragmented at the scale of a 15 ha window. Results from the Amazon and Côte d'Ivoire / Liberia may not transfer to other biomes.
- *Simulate deforestation* injects a synthetic loss and is labelled "simulated"; *Replay a real clearing* is not simulated.
- No external security audit has been done.

## Built with
Solidity, Hardhat, OpenZeppelin, Next.js, React, TypeScript, Tailwind CSS, Leaflet, ethers.js, Sentinel-2, Microsoft Planetary Computer, Hansen Global Forest Change, Base Sepolia, Vercel

## Links
- **Live demo:** https://terraproof-rust.vercel.app
- **Code repository:** https://github.com/Leandre99/TerraProof
- **Benchmark and results:** https://github.com/Leandre99/TerraProof/tree/main/web/benchmark
- **Demo video (3 to 5 min):** [your video URL]
- **Contract on Base Sepolia:** https://sepolia.basescan.org/address/0xF90808A53E28312b15E9344BA56df1e47E79A820
