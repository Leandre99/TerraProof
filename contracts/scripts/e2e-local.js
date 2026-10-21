/**
 * End-to-end check of the full on-chain lifecycle against a LOCAL chain and the running web app.
 *
 *   Terminal 1:  npx hardhat node
 *   Terminal 2:  npx hardhat run scripts/deploy.js --network localhost
 *   Terminal 3:  cd ../web && (set VERIFIER_PRIVATE_KEY to the hardhat account #0 key, RPC_URL=http://127.0.0.1:8545) npm run dev
 *   Terminal 2:  npx hardhat run scripts/e2e-local.js --network localhost
 *
 * It uses the real /api/oracle route (live Sentinel-2 data) and the real contract.
 */
const assert = require("assert");
const hre = require("hardhat");
const deployment = require("../../web/src/contracts/deployment.json");

const WEB = process.env.WEB_URL || "http://localhost:3000";

async function oracle(action, parcelId, extra = {}) {
  const res = await fetch(`${WEB}/api/oracle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, parcelId, ...extra }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`oracle ${action} -> ${res.status}: ${json.error}`);
  return json;
}

const ok = (m) => console.log(`  PASS  ${m}`);

async function main() {
  const [, farmer, rival] = await hre.ethers.getSigners();
  const c = await hre.ethers.getContractAt("TerraProof", deployment.address);

  // A real rectangle near Savalou (Benin); metadata is what the oracle analyses.
  const polygon = [
    [7.9295, 2.0555],
    [7.9312, 2.0555],
    [7.9312, 2.0585],
    [7.9295, 2.0585],
  ];
  const meta = "data:application/json;base64," + Buffer.from(JSON.stringify({ name: "E2E parcel", polygon })).toString("base64");
  const cells = Array.from({ length: 70 }, (_, i) => BigInt(900_000 + i));

  console.log(`Contract ${deployment.address} on chain ${deployment.chainId}`);

  // 1. register
  await (await c.connect(farmer).registerParcel(cells, meta)).wait();
  const id = Number(await c.parcelCount());
  ok(`farmer registered parcel #${id}`);

  // 2. double counting
  await assert.rejects(
    c.connect(rival).registerParcel([cells[5], 123456789n], meta),
    (e) => /CellAlreadyClaimed/.test(String(e.message)),
    "overlap must revert"
  );
  ok("overlapping registration reverted with CellAlreadyClaimed");

  // 3. verify -> issue
  const v = await oracle("verify", id);
  const held = await c.balanceOf(farmer.address, id);
  assert(v.issued > 0 && Number(held) === v.issued, `issued ${v.issued} vs balance ${held}`);
  ok(`oracle issued ${v.issued} credits (source: ${v.report.source}, median NDVI ${v.report.ndviMean})`);

  // 4. monitor with synthetic loss -> flag
  const m = await oracle("monitor", id, { simulateLoss: true });
  assert.strictEqual(m.flagged, true);
  assert.strictEqual(Number((await c.getParcel(id)).status), 2);
  ok(`monitoring flagged the parcel (drop ${m.report.dropPct.toFixed(0)}%)`);

  // 5. frozen
  await assert.rejects(
    c.connect(farmer).safeTransferFrom(farmer.address, rival.address, id, 1n, "0x"),
    (e) => /ParcelFrozen/.test(String(e.message)),
    "frozen parcel must not transfer"
  );
  await assert.rejects(c.connect(farmer).retire(id, 1n, "x", "y"), (e) => /ParcelNotActive/.test(String(e.message)));
  ok("transfer and retirement blocked while frozen");

  // 6. revoke
  const r = await oracle("revoke", id);
  assert.strictEqual(r.revoked, v.issued);
  assert.strictEqual(Number(await c.balanceOf(farmer.address, id)), 0);
  ok(`oracle revoked ${r.revoked} credits`);

  // 7. clear + re-verify + retire
  await oracle("clear", id);
  assert.strictEqual(Number((await c.getParcel(id)).status), 1);
  const v2 = await oracle("verify", id);
  assert(v2.issued > 0);
  await (await c.connect(farmer).retire(id, v2.issued, "ACME Corp", "e2e offset")).wait();
  assert.strictEqual(Number(await c.retirementCount()), 1);
  ok(`flag cleared, re-issued ${v2.issued}, retired by farmer`);

  console.log("\nAll end-to-end checks passed.");
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exitCode = 1;
});
