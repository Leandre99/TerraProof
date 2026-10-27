const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Credits (tCO2e) per geohash cell (~38m x 19m) that can ever be outstanding.
const MAX_CREDITS_PER_CELL = 50n;

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  // Admin = deployer. Verifier = the MRV oracle wallet (defaults to deployer for the demo).
  const verifier = process.env.VERIFIER_ADDRESS || deployer.address;

  console.log(`Deploying TerraProof on ${network} with ${deployer.address}`);
  const Factory = await hre.ethers.getContractFactory("TerraProof");
  const registry = await Factory.deploy(deployer.address, verifier, MAX_CREDITS_PER_CELL);
  await registry.waitForDeployment();

  // Optional independent verifiers + quorum, e.g. EXTRA_VERIFIERS=0xAAA,0xBBB THRESHOLD=2
  // Issuing, revoking and unfreezing then need THRESHOLD distinct verifiers; any single one can still freeze.
  const extra = (process.env.EXTRA_VERIFIERS || "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const v of extra) {
    await (await registry.grantRole(await registry.VERIFIER_ROLE(), v)).wait();
    console.log(`Granted VERIFIER_ROLE to ${v}`);
  }
  const threshold = Number(process.env.THRESHOLD || 1);
  if (threshold > 1) {
    await (await registry.setThreshold(threshold)).wait();
    console.log(`Quorum set to ${threshold} verifiers`);
  }

  const address = await registry.getAddress();
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
  console.log(`TerraProof deployed to ${address} (chain ${chainId})`);

  // Share address + deploy block with the web app (the ABI is inlined in web/src/lib/registry/abi.ts).
  const receipt = await registry.deploymentTransaction().wait();
  const rpcUrl = hre.network.config.url || "";
  const outFile = process.env.DEPLOYMENT_OUT || path.join(__dirname, "..", "..", "web", "src", "contracts", "deployment.json");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(
    outFile,
    JSON.stringify({ network, chainId, address, verifier, deployBlock: receipt.blockNumber, rpcUrl }, null, 2) + "\n"
  );
  console.log(`Wrote ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
