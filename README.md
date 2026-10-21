# TerraProof

**Carbon credits you can verify from space.**
A carbon-credit registry where double counting is impossible by construction, every credit is backed by satellite evidence, and a credit dies when the forest does.

> IEEE ClimateChain Global Hackathon 2026 · Track: **Carbon Markets & Emissions Transparency**

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
| **MRV oracle** | Reads Sentinel-2 imagery (Microsoft Planetary Computer), computes the median NDVI inside the polygon and proposes the credits the vegetation supports. The report is hashed and the hash is anchored on-chain next to the credits. |
| **Living credits** | Monitoring never stops. A sharp NDVI drop **freezes** the parcel (no transfer, no retirement). Confirmed loss → credits are **revoked** (burned). False alarm → the flag is cleared. |
| **Retirement** | Buyers retire credits on-chain with a beneficiary and reason, producing a permanent public **proof page** (QR code included). |

### Architecture

```
 ┌────────────┐   draw polygon    ┌──────────────────────┐
 │  Next.js   │ ────────────────► │  TerraProof.sol      │  ERC-1155 credits (id = parcel)
 │  (Vercel)  │ ◄──────────────── │  cells → parcel map  │  AccessControl: VERIFIER role
 └─────┬──────┘   read / retire   └──────────▲───────────┘
       │ /api/mrv  /api/oracle               │ issue / flag / revoke
       ▼                                     │ (signed by the oracle wallet)
 ┌──────────────────────────────────────────┴─┐
 │ MRV oracle (Next.js route handlers)        │
 │ STAC search → NDVI statistics → report+hash│── Sentinel-2 L2A (Planetary Computer)
 └────────────────────────────────────────────┘
```

The web app has two interchangeable back-ends behind one `Registry` interface:

* **Simulation** (default, no wallet): a TypeScript port of the contract rules running in the browser, with **live** satellite data. Anyone can explore the full product from the Vercel link.
* **On-chain**: the same UI talking to the deployed contract through the user's wallet; the oracle route signs issuance / freezing / revocation.

## What is real, and what is a proof of concept

* **Real:** Sentinel-2 imagery and NDVI computed live; double-counting protection, freezing, revocation and retirement enforced by Solidity and covered by tests.
* **Proxy:** credits come from `area_ha × max(0, median NDVI − 0.15) × 60 tCO₂e`. NDVI measures vegetation vigour, not a carbon stock. A production registry needs an accredited methodology (allometry, ground truth, permanence buffers).
* **Demo-only:** the *Simulate deforestation* button injects a synthetic loss so the full lifecycle can be shown on demand. It is labelled "simulated" everywhere and can be disabled with `ALLOW_SIMULATED_LOSS=false`.
* **Trust model:** the oracle is a single trusted verifier, bounded by an on-chain per-cell issuance ceiling. Decentralising it (multiple verifiers, staking) is on the roadmap.

## Live deployment

| | |
|---|---|
| **Network** | Base Sepolia testnet (chain id `84532`) |
| **Contract** | [`0xF90808A53E28312b15E9344BA56df1e47E79A820`](https://sepolia.basescan.org/address/0xF90808A53E28312b15E9344BA56df1e47E79A820) |
| **Verifier (oracle) wallet** | [`0xcd645F95254F557aB0DcaFa1acD429b3Dd5Ca645`](https://sepolia.basescan.org/address/0xcd645F95254F557aB0DcaFa1acD429b3Dd5Ca645) (test-only wallet) |
| **Live demo** | https://terraproof-rust.vercel.app |

The address and deploy block are also stored in [`web/src/contracts/deployment.json`](web/src/contracts/deployment.json).

## Repository layout

```
contracts/   Hardhat project: TerraProof.sol, tests, deploy script
web/         Next.js 14 app: landing, registry app, public proof pages, MRV oracle API
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
2. `cp contracts/.env.example contracts/.env` and set `DEPLOYER_PRIVATE_KEY` (never commit it).
3. `cd contracts && npx hardhat run scripts/deploy.js --network baseSepolia`
   This writes `web/src/contracts/deployment.json` (address, chain, deploy block).
4. In Vercel / `web/.env.local` set `NEXT_PUBLIC_CHAIN_ENABLED=true`, `VERIFIER_PRIVATE_KEY`, `RPC_URL`.

## Demo script (≈4 minutes)

1. **Problem (30 s):** one hectare, two buyers, no way to know.
2. **Register (45 s):** draw a parcel on satellite imagery → cells claimed on the ledger.
3. **Verify (45 s):** run the satellite verification → live NDVI chart, credits minted with the evidence hash.
4. **Attack (40 s):** *Claim land that's already registered* → **Double counting blocked**.
5. **Living credits (60 s):** *Simulate deforestation* → parcel frozen → *Revoke credits*.
6. **Proof (30 s):** retire credits as a buyer → open the public proof page with its QR code.
7. **Vision (30 s):** registry of registries, smallholders in Benin, Article 6 / COP31.

## Roadmap

* Registry-of-registries: cross-check Verra, Gold Standard and national registries to catch double counting beyond one ledger.
* Pluggable, peer-reviewed MRV methodologies (SAR for cloudy regions, allometry, ground-truth uploads).
* Multi-verifier oracle with staking and slashing.
* USSD / WhatsApp onboarding for smallholders; fiat off-ramp.

## License

MIT
