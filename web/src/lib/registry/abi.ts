/** Human-readable ABI of the parts of TerraProof.sol the web app uses. */
export const TERRAPROOF_ABI = [
  "function registerParcel(uint64[] cells, string metadataURI) returns (uint256 parcelId)",
  "function issueCredits(uint256 parcelId, uint256 amount, bytes32 evidence, string evidenceURI)",
  "function flagParcel(uint256 parcelId, bytes32 evidence, string reason)",
  "function clearFlag(uint256 parcelId, bytes32 evidence)",
  "function revokeCredits(uint256 parcelId, address holder, uint256 amount, bytes32 evidence)",
  "function retire(uint256 parcelId, uint256 amount, string beneficiary, string reason) returns (uint256 retirementId)",
  "function parcelCount() view returns (uint256)",
  "function maxCreditsPerCell() view returns (uint256)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function getParcel(uint256 parcelId) view returns (tuple(address owner, uint8 status, uint64 registeredAt, uint32 cellCount, uint256 issued, uint256 revoked, uint256 retired, bytes32 lastEvidence, string metadataURI))",
  "event ParcelRegistered(uint256 indexed parcelId, address indexed owner, uint32 cellCount, string metadataURI)",
  "event CreditsIssued(uint256 indexed parcelId, address indexed to, uint256 amount, bytes32 evidence, string evidenceURI)",
  "event ParcelFlagged(uint256 indexed parcelId, bytes32 evidence, string reason)",
  "event FlagCleared(uint256 indexed parcelId, bytes32 evidence)",
  "event CreditsRevoked(uint256 indexed parcelId, address indexed holder, uint256 amount, bytes32 evidence)",
  "event CreditsRetired(uint256 indexed retirementId, uint256 indexed parcelId, address indexed retiree, uint256 amount, string beneficiary, string reason)",
  "error CellAlreadyClaimed(uint64 cell, uint256 parcelId)",
  "error NoCells()",
  "error TooManyCells()",
  "error UnknownParcel(uint256 parcelId)",
  "error ParcelNotActive(uint256 parcelId)",
  "error ParcelNotFlagged(uint256 parcelId)",
  "error ParcelFrozen(uint256 parcelId)",
  "error ExceedsCeiling(uint256 requested, uint256 allowed)",
  "error ZeroAmount()",
] as const;

export const STATUS_BY_INDEX = ["none", "active", "flagged"] as const;

export function encodeDataUri(value: unknown): string {
  const json = JSON.stringify(value);
  const b64 = typeof window === "undefined" ? Buffer.from(json).toString("base64") : btoa(unescape(encodeURIComponent(json)));
  return `data:application/json;base64,${b64}`;
}

export function decodeDataUri<T>(uri: string): T | null {
  try {
    const b64 = uri.split(",")[1];
    const json = typeof window === "undefined" ? Buffer.from(b64, "base64").toString("utf8") : decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Parcel metadata stored in `metadataURI` as a base64 data URI (no IPFS dependency for the demo). */
export function encodeMetadata(meta: { name: string; polygon: [number, number][] }): string {
  const json = JSON.stringify(meta);
  const b64 = typeof window === "undefined" ? Buffer.from(json).toString("base64") : btoa(unescape(encodeURIComponent(json)));
  return `data:application/json;base64,${b64}`;
}

export function decodeMetadata(uri: string): { name: string; polygon: [number, number][] } | null {
  try {
    const b64 = uri.split(",")[1];
    const json = typeof window === "undefined" ? Buffer.from(b64, "base64").toString("utf8") : decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
