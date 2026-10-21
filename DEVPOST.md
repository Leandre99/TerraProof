# TerraProof: Devpost submission text

Copy each section into the matching Devpost field. Replace the `[...]` placeholders.

---

## Project name
TerraProof

## Tagline (short description)
Carbon credits you can verify from space: double counting blocked by smart contract, credits that die when the forest does.

## Track alignment
**Track: Carbon Markets & Emissions Transparency**

The track asks for blockchain carbon-credit verification, real-time tracking, smart contracts that prevent double counting, and transparent trading. TerraProof delivers each of these:

| Track build item | TerraProof |
|---|---|
| Blockchain-based carbon credit verification | Credits are ERC-1155 tokens issued only against a satellite (Sentinel-2) report whose hash is anchored on-chain next to them |
| Real-time emissions tracking | A monitoring oracle keeps re-reading the parcel and freezes credits when vegetation collapses |
| Smart contracts to prevent double counting | Every parcel is cut into ~38 × 19 m geohash cells; the contract reverts any registration that touches a cell already claimed |
| Transparent carbon trading platform | Every issuance, freeze, revocation and retirement is a public event, with a shareable proof page and QR code |

## The problem
Voluntary carbon markets run on trust, and trust is what they lack.

1. **Double counting.** Registries don't talk to each other, so the same hectare can back credits in several programmes.
2. **Claims nobody can check.** Verification is a consultant visiting every few years; buyers cannot see what they pay for.
3. **Credits that outlive the trees.** A forest cleared after issuance keeps its credits, because the market has no way to take them back.
4. **Exclusion.** Certification costs tens of thousands of dollars, which shuts out smallholders in West Africa and elsewhere, the people most able to restore land.

## What it does
TerraProof is a carbon registry where the three failure modes above are handled by construction.

1. **Claim land once.** A farmer draws a parcel on satellite imagery. It is rasterised into geohash cells and written to the ledger. A cell can only ever belong to one parcel; an overlapping claim is rejected by the contract itself.
2. **The satellite audits it.** An MRV oracle reads Sentinel-2 imagery over the polygon, computes the median NDVI and proposes the credits the vegetation supports.
3. **Credits are minted with evidence.** The contract issues the credits and stores the hash of the satellite report next to them, so anyone can re-check it.
4. **Living credits.** Monitoring never stops. A sharp NDVI drop freezes the parcel (no transfer, no retirement). Confirmed loss revokes the credits; a false alarm clears the flag.
5. **Retire with proof.** Buyers retire credits on-chain with a beneficiary and reason, producing a permanent public proof page with a QR code.

## How we built it
- **Smart contract:** Solidity 0.8.24, OpenZeppelin ERC-1155 + AccessControl. A verifier role issues, freezes and revokes; an on-chain per-cell ceiling bounds what a compromised oracle could ever mint. 17 Hardhat tests cover double counting, ceilings, freezing, revocation and retirement.
- **MRV oracle:** Next.js route handlers query Microsoft Planetary Computer (STAC + statistics API) for Sentinel-2 L2A scenes over the polygon, compute the median NDVI per scene, and hash the report. In on-chain mode the oracle re-runs the analysis itself and signs the transaction; it never trusts a report sent by the browser.
- **Web app:** Next.js 14, React, Tailwind, Leaflet on Esri satellite imagery, ethers v6. Landing page, registry app with a guided demo, and public proof pages.
- **Two interchangeable back-ends behind one interface:** a browser simulation that applies the exact same rules as the contract (so anyone can try the product without a wallet, still on live satellite data), and an on-chain adapter that talks to the deployed contract.
- **Verified end to end:** a script drives the full lifecycle against a local chain, the real oracle route and live Sentinel-2 data.

## Challenges we ran into
- Turning a free-form polygon into a deterministic set of on-chain cells, so that two different drawings of the same land collide.
- Keeping evidence verifiable: the full satellite report travels in the issuance event, so the chain alone is enough to re-check a credit.
- Being honest about science: NDVI is a vegetation-vigour proxy, not a carbon stock. We label it as such everywhere.

## Accomplishments we're proud of
- Double counting is blocked by the contract, not by a policy.
- Credits that can be switched off when the forest disappears.
- The whole lifecycle runs on real satellite data, with a demo anyone can click through in a few minutes.

## What we learned
Trust in carbon markets is a data-integrity problem as much as a financial one. A ledger alone doesn't fix it: it needs independent physical evidence tied to every unit.

## What's next
- **Registry of registries:** cross-check Verra, Gold Standard and national registries to catch double counting beyond a single ledger.
- **Validated methodologies:** pluggable, peer-reviewed MRV methods (SAR for cloudy regions, allometry, ground-truth uploads, permanence buffers).
- **Decentralised oracle:** multiple verifiers with staking and slashing instead of a single trusted one.
- **Smallholders first:** USSD / WhatsApp onboarding and verification that costs cents, starting in Benin and West Africa.
- **Article 6 ready:** transparent, auditable units for country-to-country carbon trading, aligned with the COP31 agenda.

## Target users, scalability and adoption
- **Users:** smallholder farmers and cooperatives (issuers), companies and funds buying offsets (buyers), registries, auditors and regulators (verifiers).
- **Scale:** satellite data is free and global; the cost of verifying a parcel is a few API calls. Cells are a global grid, so the same registry works anywhere.
- **Adoption:** a farmer needs only a phone and a drawn polygon; a buyer needs only a link to a proof page. The registry can sit in front of existing programmes as a double-counting check before it replaces anything.

## Honest limitations
- Credits come from `area_ha × max(0, median NDVI − 0.15) × 60 tCO₂e`. This is a proof of concept, not a validated carbon methodology.
- The "Simulate deforestation" button injects a synthetic loss so the full lifecycle can be shown on demand. It is labelled "simulated" everywhere.
- The oracle is a single trusted verifier for now (bounded by the on-chain ceiling).

## Built with
Solidity, Hardhat, OpenZeppelin, Next.js, React, TypeScript, Tailwind CSS, Leaflet, ethers.js, Sentinel-2, Microsoft Planetary Computer, Base Sepolia, Vercel

## Links
- **Live demo:** https://terraproof-rust.vercel.app
- **Code repository:** https://github.com/Leandre99/TerraProof
- **Demo video (3 to 5 min):** [your video URL]
- **Contract on Base Sepolia:** https://sepolia.basescan.org/address/0xF90808A53E28312b15E9344BA56df1e47E79A820
