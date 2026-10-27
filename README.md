# TerraProof

**Carbon credits you can verify from space.**
A carbon-credit registry where double counting is impossible by construction, every credit is backed by satellite evidence that anyone can recompute, and a credit dies when the forest does.

> IEEE ClimateChain Global Hackathon 2026 · Track: **Carbon Markets & Emissions Transparency**
> Live demo: https://terraproof-rust.vercel.app · Français: use the **FR** switch in the top bar.

---

## The problem

Voluntary carbon markets run on trust, and trust is what they lack:

1. **Double counting.** Registries don't talk to each other; the same hectare can back credits in several programmes.
2. **Unverifiable claims.** Verification is a consultant visiting every few years. Buyers can't see what they pay for.
3. **Irreversibility.** A forest cleared after issuance keeps its credits.
4. **Exclusion.** Certification costs tens of thousands of dollars, which shuts out smallholders in West Africa and elsewhere.

## The solution

| Layer | What it does |
|---|---|
| **Land registry** | A parcel is rasterised into geohash cells (precision 8, ~38 × 19 m). A cell can belong to **one parcel, ever**: the smart contract reverts any overlapping registration. |
| **MRV oracle (v1)** | Reads Sentinel-2 (Microsoft Planetary Computer). Inside the polygon it computes **two independent signals**, NDVI (greenness) and NDMI (canopy moisture), masks clouds per pixel, and only declares a parcel eligible when both agree. The report is hashed and the hash is anchored on-chain next to the credits. |
| **Recomputable evidence** | The report lists the exact Sentinel-2 scenes it used. The public proof page has a **Recompute** button: it re-downloads those scenes' statistics, re-runs the decision logic and checks that the result matches the hash stored with the credits. |
| **Living credits** | Monitoring never stops (weekly job). A drop against the **same season one year earlier**, corroborated by the moisture signal, **freezes** the parcel. Confirmed loss → credits are **revoked** (burned). False alarm → the flag is cleared. |
| **Verifier quorum** | `threshold` distinct verifiers must approve an issuance, a revocation or an unfreeze. **Any single verifier can freeze**: the safe direction is fast, the irreversible one is collective. |
| **Community share** | A parcel can reserve a share of every issuance for a village fund or cooperative. The split is enforced by the contract at issuance and cannot be edited later. |
| **Retirement** | Buyers retire credits on-chain with a beneficiary and reason, producing a permanent public **proof page** (QR code included). |

### Architecture

```
 ┌────────────┐   draw polygon    ┌──────────────────────┐
 │  Next.js   │ ────────────────► │  TerraProof.sol      │  ERC-1155 credits (id = parcel)
 │  (Vercel)  │ ◄──────────────── │  cells → parcel map  │  quorum · pause · community share
 └─────┬──────┘   read / retire   └──────────▲───────────┘
       │ /api/mrv /api/oracle /api/recompute │ issue / flag / revoke (verifier votes)
       ▼                                     │
 ┌──────────────────────────────────────────┴─┐
 │ MRV oracle (Next.js route handlers)        │
 │ STAC → NDVI+NDMI+cloud stats → decision    │── Sentinel-2 L2A (Planetary Computer)
 │ weekly cron → freeze if vegetation lost    │
 └────────────────────────────────────────────┘
```

The web app has two interchangeable back-ends behind one `Registry` interface:

* **Simulation** (default, no wallet): a TypeScript port of the contract rules running in the browser, with **live** satellite data, including a *Replay a real clearing* mode that runs the engine on past Sentinel-2 history of a parcel that was really cleared.
* **On-chain**: the same UI talking to the deployed contract through the user's wallet; the oracle route signs issuance / freezing / revocation.

## Accuracy: measured, not claimed

The MRV engine is benchmarked against the **Hansen Global Forest Change** dataset on sites it never saw during calibration. Protocol, sites, per-site outcomes, confidence intervals and limits are in [`web/benchmark/RESULTS.md`](web/benchmark/RESULTS.md); the whole pipeline is reproducible:

```bash
cd web
npx tsx benchmark/scan.ts 8 10N_000E   # find ground-truth sites in Hansen (one run per tile)
npx tsx benchmark/run.ts               # fetch Sentinel-2, calibrate on half, report on the held-out half
npx tsx benchmark/run.ts --offline     # re-evaluate from the cached observations (no network)
```

**Result (Amazon / Mato Grosso, held-out half: 7 cleared + 7 intact sites, 15 ha windows):**

| | previous engine (v0) | **v1** |
|---|---|---|
| Cleared sites wrongly given credits | 100 % (7/7) | **14 % (1/7)** |
| Intact forest correctly accepted | 100 % | **100 % (7/7)** |
| Cleared sites frozen by monitoring | 43 % (3/7) | **86 % (6/7)** |
| False freezes on intact forest | 0 % | **0 % (0/7)** |

With 7 sites per class the 95 % intervals are wide (e.g. 14 % wrongly accepted is [3–51] %), so read these as an order of magnitude. **Not validated in Benin or West Africa:** two West-African tiles were scanned, but the forest there is too fragmented at the scale of a 15 ha window to yield ground-truth sites. The thresholds were calibrated on the other half of the same sites, then reported on the held-out half; a different biome may need its own calibration.

**A bug the benchmark exposed (fixed here).** Sentinel-2 L2A scenes processed with baseline ≥ 04.00 (acquired since 25 January 2022) carry a +1000 offset on raw values. The first version of the oracle ignored it, so every NDVI from 2022 onward was biased low: a dense forest read ~0.5 instead of ~0.85. v1 reads the scene's processing baseline and removes the offset. Reports issued by the previous version cannot be recomputed and are flagged as such on the proof page.

## What is real, and what is a proof of concept

* **Real:** Sentinel-2 imagery, NDVI/NDMI and cloud statistics computed live; double-counting protection, freezing, quorum, revocation, community share, pause and retirement enforced by Solidity and covered by tests (including a randomised invariant test); evidence that anyone can recompute.
* **Proxy:** credits come from `area_ha × max(0, mean NDVI − 0.15) × 60 tCO₂e`. NDVI measures vegetation vigour, not a carbon stock, and the benchmark validates *presence and loss of standing vegetation*, **not** the carbon quantity. A production registry needs an accredited methodology (allometry, ground truth, permanence buffers).
* **Demo-only:** *Simulate deforestation* injects a synthetic loss. It is labelled "simulated" everywhere and can be disabled with `ALLOW_SIMULATED_LOSS=false`. *Replay a real clearing* is **not** simulated: it uses the real archive.
* **Trust model:** the contract supports independent verifiers and a quorum. In this deployment the verifier keys are held by the same server, so the quorum demonstrates the mechanism, not independence. Giving each key to a different organisation is a configuration change, not a code change. The oracle is also bounded by an on-chain per-cell issuance ceiling.
* **Not done:** an external security audit, a formal static-analysis run, staking/slashing of verifiers.

## Live deployment

| | |
|---|---|
| **Network** | Base Sepolia testnet (chain id `84532`) |
| **Contract (v1, deployed)** | [`0xF90808A53E28312b15E9344BA56df1e47E79A820`](https://sepolia.basescan.org/address/0xF90808A53E28312b15E9344BA56df1e47E79A820) |
| **Verifier (oracle) wallet** | [`0xcd645F95254F557aB0DcaFa1acD429b3Dd5Ca645`](https://sepolia.basescan.org/address/0xcd645F95254F557aB0DcaFa1acD429b3Dd5Ca645) (test-only wallet) |
| **Live demo** | https://terraproof-rust.vercel.app |

The address and deploy block are also stored in [`web/src/contracts/deployment.json`](web/src/contracts/deployment.json).

> The contract in `contracts/` (quorum, community share, pause) is an upgrade of the one deployed above. It keeps the same function signatures, so the web app works with both; the quorum and community-share features need the upgraded contract to be redeployed (see below).

## Repository layout

```
contracts/   Hardhat project: TerraProof.sol, tests (unit + randomised invariants), deploy script
web/         Next.js 14 app: landing, registry app, public proof pages, MRV oracle API, weekly cron
web/benchmark/   Reproducible accuracy benchmark against Hansen Global Forest Change
.github/     CI: contract tests, type-check, lint, build, offline benchmark
```

## Run it locally

```bash
# 1. Smart contract tests (local in-memory chain, no wallet needed)
cd contracts
npm install --legacy-peer-deps
npx hardhat test

# 2. Web app (simulation mode works out of the box)
cd ../web
npm install --legacy-peer-deps
npm run dev          # http://localhost:3000
```

## Deploy on a testnet (optional, for On-chain mode)

1. Create a **fresh, test-only** wallet and fund it from a Base Sepolia faucet.
2. `cp contracts/.env.example contracts/.env` and set `DEPLOYER_PRIVATE_KEY` (never commit it). Optionally set `EXTRA_VERIFIERS` (comma-separated) and `THRESHOLD` for a quorum.
3. `cd contracts && npx hardhat run scripts/deploy.js --network baseSepolia`
   This writes `web/src/contracts/deployment.json` (address, chain, deploy block).
4. In Vercel / `web/.env.local` set `NEXT_PUBLIC_CHAIN_ENABLED=true`, `VERIFIER_PRIVATE_KEYS`, `RPC_URL`, and `CRON_SECRET` to enable the weekly monitoring job.

## Demo script (≈4 minutes)

1. **Problem (30 s):** one hectare, two buyers, no way to know.
2. **Register (40 s):** draw a parcel on satellite imagery, reserve 20 % for the village → cells claimed on the ledger.
3. **Verify (40 s):** satellite verification → live NDVI and moisture curves, credits minted with the evidence hash.
4. **Attack (30 s):** *Claim land that's already registered* → **Double counting blocked**.
5. **Real clearing (60 s):** *Replay a real clearing* → credits issued with the forest standing, then frozen from real Sentinel-2 history → *Revoke credits*.
6. **Proof (40 s):** retire credits as a buyer → open the public proof page, press **Recompute** and watch the hashes match.
7. **Vision (20 s):** registry of registries, smallholders in Benin, Article 6 / COP31.

## Roadmap

* Registry-of-registries: cross-check Verra, Gold Standard and national registries to catch double counting beyond one ledger.
* Pluggable, peer-reviewed MRV methodologies (SAR for cloudy regions, allometry, ground-truth uploads).
* Independent verifiers run by different organisations, with staking and slashing.
* USSD / WhatsApp onboarding for smallholders; fiat off-ramp.

## License

MIT
