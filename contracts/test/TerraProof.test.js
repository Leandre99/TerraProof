const { expect } = require("chai");
const { ethers } = require("hardhat");

const CEILING = 50n; // credits per cell
const EVIDENCE = ethers.keccak256(ethers.toUtf8Bytes("ndvi-report-1"));
const EVIDENCE_2 = ethers.keccak256(ethers.toUtf8Bytes("ndvi-report-2"));

describe("TerraProof", () => {
  let registry, admin, verifier, farmer, buyer, other;

  beforeEach(async () => {
    [admin, verifier, farmer, buyer, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("TerraProof");
    registry = await F.deploy(admin.address, verifier.address, CEILING);
  });

  async function register(signer, cells, uri = "ipfs://parcel") {
    const tx = await registry.connect(signer).registerParcel(cells, uri);
    await tx.wait();
    return await registry.parcelCount();
  }

  describe("registration & double-counting protection", () => {
    it("registers a parcel and claims its cells", async () => {
      const id = await register(farmer, [1n, 2n, 3n]);
      expect(id).to.equal(1n);
      const p = await registry.getParcel(id);
      expect(p.owner).to.equal(farmer.address);
      expect(p.cellCount).to.equal(3n);
      expect(await registry.isCellClaimed(2n)).to.equal(true);
      expect(await registry.isCellClaimed(99n)).to.equal(false);
    });

    it("rejects a parcel that overlaps an existing one (double counting)", async () => {
      await register(farmer, [10n, 11n, 12n]);
      await expect(registry.connect(other).registerParcel([12n, 13n], "ipfs://x"))
        .to.be.revertedWithCustomError(registry, "CellAlreadyClaimed")
        .withArgs(12n, 1n);
      // nothing from the rejected attempt is claimed
      expect(await registry.isCellClaimed(13n)).to.equal(false);
    });

    it("rejects the same owner re-registering the same cells", async () => {
      await register(farmer, [5n]);
      await expect(registry.connect(farmer).registerParcel([5n], "ipfs://again"))
        .to.be.revertedWithCustomError(registry, "CellAlreadyClaimed");
    });

    it("rejects duplicate cells inside one registration", async () => {
      await expect(registry.connect(farmer).registerParcel([7n, 7n], "ipfs://dup"))
        .to.be.revertedWithCustomError(registry, "CellAlreadyClaimed");
    });

    it("rejects empty and oversized parcels", async () => {
      await expect(registry.connect(farmer).registerParcel([], "")).to.be.revertedWithCustomError(registry, "NoCells");
      const many = Array.from({ length: 257 }, (_, i) => BigInt(i + 1));
      await expect(registry.connect(farmer).registerParcel(many, "")).to.be.revertedWithCustomError(
        registry,
        "TooManyCells"
      );
    });
  });

  describe("issuance", () => {
    let id;
    beforeEach(async () => {
      id = await register(farmer, [1n, 2n]); // ceiling = 100
    });

    it("lets only the verifier issue credits to the parcel owner", async () => {
      await expect(registry.connect(farmer).issueCredits(id, 10n, EVIDENCE, "ipfs://r")).to.be.reverted;
      await expect(registry.connect(verifier).issueCredits(id, 40n, EVIDENCE, "ipfs://r"))
        .to.emit(registry, "CreditsIssued")
        .withArgs(id, farmer.address, 40n, EVIDENCE, "ipfs://r");
      expect(await registry.balanceOf(farmer.address, id)).to.equal(40n);
    });

    it("enforces the per-cell ceiling", async () => {
      await registry.connect(verifier).issueCredits(id, 100n, EVIDENCE, "");
      await expect(registry.connect(verifier).issueCredits(id, 1n, EVIDENCE, ""))
        .to.be.revertedWithCustomError(registry, "ExceedsCeiling")
        .withArgs(101n, 100n);
    });

    it("rejects zero amount and unknown parcels", async () => {
      await expect(registry.connect(verifier).issueCredits(id, 0n, EVIDENCE, "")).to.be.revertedWithCustomError(
        registry,
        "ZeroAmount"
      );
      await expect(registry.connect(verifier).issueCredits(99n, 1n, EVIDENCE, "")).to.be.revertedWithCustomError(
        registry,
        "UnknownParcel"
      );
    });
  });

  describe("living credits: flag, clear, revoke", () => {
    let id;
    beforeEach(async () => {
      id = await register(farmer, [1n, 2n]);
      await registry.connect(verifier).issueCredits(id, 60n, EVIDENCE, "");
      await registry.connect(farmer).safeTransferFrom(farmer.address, buyer.address, id, 20n, "0x");
    });

    it("freezes transfers and retirement when flagged", async () => {
      await expect(registry.connect(verifier).flagParcel(id, EVIDENCE_2, "NDVI drop 38%"))
        .to.emit(registry, "ParcelFlagged")
        .withArgs(id, EVIDENCE_2, "NDVI drop 38%");

      await expect(
        registry.connect(buyer).safeTransferFrom(buyer.address, other.address, id, 5n, "0x")
      ).to.be.revertedWithCustomError(registry, "ParcelFrozen");
      await expect(registry.connect(buyer).retire(id, 5n, "ACME", "offset")).to.be.revertedWithCustomError(
        registry,
        "ParcelNotActive"
      );
      await expect(registry.connect(verifier).issueCredits(id, 1n, EVIDENCE, "")).to.be.revertedWithCustomError(
        registry,
        "ParcelNotActive"
      );
    });

    it("revokes credits from holders of a flagged parcel", async () => {
      await registry.connect(verifier).flagParcel(id, EVIDENCE_2, "deforestation");
      await expect(registry.connect(verifier).revokeCredits(id, buyer.address, 20n, EVIDENCE_2))
        .to.emit(registry, "CreditsRevoked")
        .withArgs(id, buyer.address, 20n, EVIDENCE_2);
      await registry.connect(verifier).revokeCredits(id, farmer.address, 10n, EVIDENCE_2);

      expect(await registry.balanceOf(buyer.address, id)).to.equal(0n);
      expect(await registry.balanceOf(farmer.address, id)).to.equal(30n);
      expect((await registry.getParcel(id)).revoked).to.equal(30n);
    });

    it("cannot revoke an active (unflagged) parcel", async () => {
      await expect(
        registry.connect(verifier).revokeCredits(id, buyer.address, 1n, EVIDENCE_2)
      ).to.be.revertedWithCustomError(registry, "ParcelNotFlagged");
    });

    it("restores normal operation after clearing a flag", async () => {
      await registry.connect(verifier).flagParcel(id, EVIDENCE_2, "false alarm");
      await registry.connect(verifier).clearFlag(id, EVIDENCE_2);
      await registry.connect(buyer).safeTransferFrom(buyer.address, other.address, id, 5n, "0x");
      expect(await registry.balanceOf(other.address, id)).to.equal(5n);
    });

    it("restricts flagging to the verifier", async () => {
      await expect(registry.connect(farmer).flagParcel(id, EVIDENCE_2, "x")).to.be.reverted;
    });

    it("lets revoked capacity be re-issued only within the ceiling", async () => {
      await registry.connect(verifier).flagParcel(id, EVIDENCE_2, "loss");
      await registry.connect(verifier).revokeCredits(id, farmer.address, 40n, EVIDENCE_2);
      await registry.connect(verifier).clearFlag(id, EVIDENCE_2);
      // outstanding is now 20, ceiling 100 -> can issue 80, not 81
      await registry.connect(verifier).issueCredits(id, 80n, EVIDENCE, "");
      await expect(registry.connect(verifier).issueCredits(id, 1n, EVIDENCE, "")).to.be.revertedWithCustomError(
        registry,
        "ExceedsCeiling"
      );
    });
  });

  describe("retirement", () => {
    it("burns credits and leaves a permanent public record", async () => {
      const id = await register(farmer, [1n, 2n]);
      await registry.connect(verifier).issueCredits(id, 30n, EVIDENCE, "");
      await registry.connect(farmer).safeTransferFrom(farmer.address, buyer.address, id, 12n, "0x");

      await expect(registry.connect(buyer).retire(id, 12n, "ACME Corp", "2026 Scope 3 offset"))
        .to.emit(registry, "CreditsRetired")
        .withArgs(0n, id, buyer.address, 12n, "ACME Corp", "2026 Scope 3 offset");

      expect(await registry.balanceOf(buyer.address, id)).to.equal(0n);
      expect(await registry.retirementCount()).to.equal(1n);
      const r = await registry.getRetirement(0n);
      expect(r.beneficiary).to.equal("ACME Corp");
      expect(r.amount).to.equal(12n);
      expect((await registry.getParcel(id)).retired).to.equal(12n);
    });

    it("cannot retire credits you do not hold", async () => {
      const id = await register(farmer, [1n]);
      await registry.connect(verifier).issueCredits(id, 10n, EVIDENCE, "");
      await expect(registry.connect(buyer).retire(id, 1n, "x", "y")).to.be.reverted;
    });
  });

  describe("admin", () => {
    it("only admin can change the ceiling", async () => {
      await expect(registry.connect(farmer).setMaxCreditsPerCell(1n)).to.be.reverted;
      await registry.connect(admin).setMaxCreditsPerCell(5n);
      expect(await registry.maxCreditsPerCell()).to.equal(5n);
    });
  });
});
