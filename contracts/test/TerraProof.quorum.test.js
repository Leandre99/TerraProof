const { expect } = require("chai");
const { ethers } = require("hardhat");

const CEILING = 50n;
const EV = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

describe("TerraProof v2: quorum, community share, pause, invariants", () => {
  let registry, admin, v1, v2, v3, farmer, village, buyer, outsider;

  beforeEach(async () => {
    [admin, v1, v2, v3, farmer, village, buyer, outsider] = await ethers.getSigners();
    const F = await ethers.getContractFactory("TerraProof");
    registry = await F.deploy(admin.address, v1.address, CEILING);
    await registry.grantRole(await registry.VERIFIER_ROLE(), v2.address);
    await registry.grantRole(await registry.VERIFIER_ROLE(), v3.address);
  });

  async function register(signer, cells) {
    await (await registry.connect(signer).registerParcel(cells, "ipfs://p")).wait();
    return registry.parcelCount();
  }

  describe("verifier quorum", () => {
    beforeEach(async () => {
      await registry.setThreshold(2);
    });

    it("does not mint on a single approval, mints on the second distinct one", async () => {
      const id = await register(farmer, [1n, 2n, 3n]);
      await registry.connect(v1).issueCredits(id, 100n, EV("r1"), "uri");
      expect(await registry.balanceOf(farmer.address, id)).to.equal(0n);
      expect((await registry.getParcel(id)).issued).to.equal(0n);

      await expect(registry.connect(v2).issueCredits(id, 100n, EV("r1"), "uri"))
        .to.emit(registry, "CreditsIssued")
        .withArgs(id, farmer.address, 100n, EV("r1"), "uri");
      expect(await registry.balanceOf(farmer.address, id)).to.equal(100n);
    });

    it("the same verifier cannot approve twice", async () => {
      const id = await register(farmer, [1n]);
      await registry.connect(v1).issueCredits(id, 10n, EV("r1"), "");
      await expect(registry.connect(v1).issueCredits(id, 10n, EV("r1"), "")).to.be.revertedWithCustomError(
        registry,
        "AlreadyApproved"
      );
    });

    it("approvals only count for the exact same (amount, evidence)", async () => {
      const id = await register(farmer, [1n, 2n]);
      await registry.connect(v1).issueCredits(id, 10n, EV("r1"), "");
      await registry.connect(v2).issueCredits(id, 20n, EV("r1"), ""); // different amount
      await registry.connect(v3).issueCredits(id, 10n, EV("other"), ""); // different evidence
      expect(await registry.balanceOf(farmer.address, id)).to.equal(0n);
    });

    it("a minted vote cannot be replayed (issued acts as a nonce)", async () => {
      const id = await register(farmer, [1n, 2n]);
      await registry.connect(v1).issueCredits(id, 10n, EV("r1"), "");
      await registry.connect(v2).issueCredits(id, 10n, EV("r1"), "");
      // v3 now voting the same payload starts a NEW round (issued changed), it must not mint alone.
      await registry.connect(v3).issueCredits(id, 10n, EV("r1"), "");
      expect(await registry.balanceOf(farmer.address, id)).to.equal(10n);
    });

    it("one verifier can freeze alone, but unfreezing and revoking need the quorum", async () => {
      const id = await register(farmer, [1n, 2n]);
      await registry.connect(v1).issueCredits(id, 40n, EV("r1"), "");
      await registry.connect(v2).issueCredits(id, 40n, EV("r1"), "");

      await registry.connect(v3).flagParcel(id, EV("loss"), "NDVI drop");
      expect((await registry.getParcel(id)).status).to.equal(2n);

      await registry.connect(v1).revokeCredits(id, farmer.address, 40n, EV("loss"));
      expect(await registry.balanceOf(farmer.address, id)).to.equal(40n); // still there
      await registry.connect(v2).revokeCredits(id, farmer.address, 40n, EV("loss"));
      expect(await registry.balanceOf(farmer.address, id)).to.equal(0n);
      expect((await registry.getParcel(id)).revoked).to.equal(40n);
    });

    it("clearing a flag needs the quorum and is single-use per flag epoch", async () => {
      const id = await register(farmer, [1n]);
      await registry.connect(v1).flagParcel(id, EV("f"), "x");
      await registry.connect(v2).clearFlag(id, EV("ok"));
      expect((await registry.getParcel(id)).status).to.equal(2n); // still flagged
      await registry.connect(v3).clearFlag(id, EV("ok"));
      expect((await registry.getParcel(id)).status).to.equal(1n);
    });

    it("non-verifiers cannot vote and the threshold cannot exceed the verifier count", async () => {
      const id = await register(farmer, [1n]);
      await expect(registry.connect(outsider).issueCredits(id, 1n, EV("r"), "")).to.be.reverted;
      await expect(registry.setThreshold(0)).to.be.revertedWithCustomError(registry, "InvalidThreshold");
      await expect(registry.setThreshold(4)).to.be.revertedWithCustomError(registry, "InvalidThreshold");
      await expect(registry.connect(outsider).setThreshold(1)).to.be.reverted;
    });
  });

  describe("community share", () => {
    it("splits every issuance between owner and community, enforced by the contract", async () => {
      await registry
        .connect(farmer)
        .registerParcelWithCommunity([1n, 2n, 3n, 4n], "ipfs://p", village.address, 2000);
      const id = await registry.parcelCount();
      await registry.connect(v1).issueCredits(id, 101n, EV("r1"), "");
      // 20% of 101 = 20 (rounded down); owner receives the rest
      expect(await registry.balanceOf(village.address, id)).to.equal(20n);
      expect(await registry.balanceOf(farmer.address, id)).to.equal(81n);
      expect((await registry.getParcel(id)).issued).to.equal(101n);
    });

    it("rejects an invalid community configuration", async () => {
      await expect(
        registry.connect(farmer).registerParcelWithCommunity([1n], "u", ethers.ZeroAddress, 1000)
      ).to.be.revertedWithCustomError(registry, "InvalidCommunity");
      await expect(
        registry.connect(farmer).registerParcelWithCommunity([1n], "u", farmer.address, 1000)
      ).to.be.revertedWithCustomError(registry, "InvalidCommunity");
      await expect(
        registry.connect(farmer).registerParcelWithCommunity([1n], "u", village.address, 0)
      ).to.be.revertedWithCustomError(registry, "InvalidCommunity");
      await expect(
        registry.connect(farmer).registerParcelWithCommunity([1n], "u", village.address, 10_001)
      ).to.be.revertedWithCustomError(registry, "InvalidCommunity");
    });

    it("community credits are revocable and frozen like any others", async () => {
      await registry.connect(farmer).registerParcelWithCommunity([1n, 2n], "u", village.address, 5000);
      const id = await registry.parcelCount();
      await registry.connect(v1).issueCredits(id, 60n, EV("r1"), "");
      await registry.connect(v1).flagParcel(id, EV("loss"), "x");
      await expect(
        registry.connect(village).safeTransferFrom(village.address, buyer.address, id, 5n, "0x")
      ).to.be.revertedWithCustomError(registry, "ParcelFrozen");
      await registry.connect(v1).revokeCredits(id, village.address, 30n, EV("loss"));
      await registry.connect(v1).revokeCredits(id, farmer.address, 30n, EV("loss"));
      expect(await registry.balanceOf(village.address, id)).to.equal(0n);
      expect((await registry.getParcel(id)).revoked).to.equal(60n);
    });
  });

  describe("pause", () => {
    it("blocks registration, issuance, retirement and transfers, but not freezing or revoking", async () => {
      const id = await register(farmer, [1n, 2n]);
      await registry.connect(v1).issueCredits(id, 20n, EV("r1"), "");
      await registry.pause();

      await expect(registry.connect(farmer).registerParcel([9n], "u")).to.be.revertedWithCustomError(
        registry,
        "EnforcedPause"
      );
      await expect(registry.connect(v1).issueCredits(id, 5n, EV("r2"), "")).to.be.revertedWithCustomError(
        registry,
        "EnforcedPause"
      );
      await expect(registry.connect(farmer).retire(id, 1n, "b", "r")).to.be.revertedWithCustomError(
        registry,
        "EnforcedPause"
      );
      await expect(
        registry.connect(farmer).safeTransferFrom(farmer.address, buyer.address, id, 1n, "0x")
      ).to.be.revertedWithCustomError(registry, "EnforcedPause");

      await registry.connect(v1).flagParcel(id, EV("loss"), "x");
      await registry.connect(v1).revokeCredits(id, farmer.address, 20n, EV("loss"));
      expect(await registry.balanceOf(farmer.address, id)).to.equal(0n);

      await registry.unpause();
      await registry.connect(farmer).registerParcel([9n], "u");
    });

    it("only the admin can pause", async () => {
      await expect(registry.connect(v1).pause()).to.be.reverted;
    });
  });

  describe("invariants under random action sequences", () => {
    // Deterministic PRNG so a failure is reproducible.
    function prng(seed) {
      let s = seed >>> 0;
      return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    }

    it("conservation, ceiling and cell uniqueness hold for 300 random operations", async function () {
      this.timeout(120_000);
      await registry.setThreshold(2);
      const rnd = prng(20260527);
      const signers = [farmer, village, buyer, outsider];
      const verifiers = [v1, v2, v3];
      const claimed = new Map(); // cell -> parcel id
      let nextCell = 1n;

      for (let step = 0; step < 300; step++) {
        const n = Number(await registry.parcelCount());
        const roll = rnd();
        try {
          if (roll < 0.2 || n === 0) {
            // register: sometimes reuse an existing cell on purpose
            const reuse = claimed.size > 0 && rnd() < 0.3;
            const cell = reuse ? [...claimed.keys()][Math.floor(rnd() * claimed.size)] : nextCell++;
            const s = signers[Math.floor(rnd() * signers.length)];
            const before = await registry.parcelCount();
            try {
              await registry.connect(s).registerParcel([cell], "u");
              expect(reuse).to.equal(false); // a reused cell must have reverted
              claimed.set(cell, Number(before) + 1);
            } catch (e) {
              expect(reuse).to.equal(true);
              expect(await registry.parcelCount()).to.equal(before);
            }
          } else {
            const id = 1 + Math.floor(rnd() * n);
            const v = verifiers[Math.floor(rnd() * 3)];
            const amount = BigInt(1 + Math.floor(rnd() * 30));
            const ev = EV("e" + Math.floor(rnd() * 3));
            const p = await registry.getParcel(id);
            if (roll < 0.55) await registry.connect(v).issueCredits(id, amount, ev, "");
            else if (roll < 0.65) await registry.connect(v).flagParcel(id, ev, "x");
            else if (roll < 0.75) await registry.connect(v).clearFlag(id, ev);
            else if (roll < 0.85) await registry.connect(v).revokeCredits(id, p.owner, amount, ev);
            else await registry.connect(signers[0]).retire(id, amount, "b", "r");
          }
        } catch {
          /* reverts are expected for illegal moves; invariants are checked below either way */
        }

        const count = Number(await registry.parcelCount());
        for (let id = 1; id <= count; id++) {
          const p = await registry.getParcel(id);
          let supply = 0n;
          for (const s of signers) supply += await registry.balanceOf(s.address, id);
          // conservation: what exists = issued - revoked - retired
          expect(p.issued - p.revoked - p.retired).to.equal(supply);
          // ceiling on what is outstanding
          expect(p.issued - p.revoked).to.be.lte(BigInt(p.cellCount) * CEILING);
        }
      }
      // cell uniqueness
      for (const [cell, id] of claimed) expect(await registry.cellParcel(cell)).to.equal(BigInt(id));
    });
  });
});
