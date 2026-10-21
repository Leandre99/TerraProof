// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TerraProof
/// @notice Carbon credit registry with built-in double-counting protection and
///         revocable ("living") credits.
///
///  - Every parcel is rasterised off-chain into geohash cells (precision 8, ~38m x 19m).
///    A cell can belong to at most ONE parcel, ever: overlapping registrations revert.
///  - A VERIFIER (the MRV oracle that reads satellite data) issues credits per parcel.
///    Credits are an ERC-1155 token whose id is the parcel id.
///  - If continuous monitoring detects loss of vegetation, the verifier flags the
///    parcel (credits are frozen) and may then revoke credits (burn) or clear the flag.
///  - Buyers retire credits on-chain; each retirement is a permanent public record.
contract TerraProof is ERC1155, AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint256 public constant MAX_CELLS_PER_PARCEL = 256;

    enum Status {
        None,
        Active,
        Flagged
    }

    struct Parcel {
        address owner;
        Status status;
        uint64 registeredAt;
        uint32 cellCount;
        uint256 issued; // cumulative credits issued
        uint256 revoked; // cumulative credits revoked
        uint256 retired; // cumulative credits retired
        bytes32 lastEvidence; // hash of the latest MRV report
        string metadataURI;
    }

    struct Retirement {
        uint256 parcelId;
        address retiree;
        uint256 amount;
        uint64 timestamp;
        string beneficiary;
        string reason;
    }

    /// @notice Hard ceiling on credits per cell and per issuance, limits oracle damage.
    uint256 public maxCreditsPerCell;

    uint256 public parcelCount;
    mapping(uint256 => Parcel) private _parcels;
    /// @dev geohash cell => parcelId that claimed it (0 = free)
    mapping(uint64 => uint256) public cellParcel;

    Retirement[] private _retirements;

    event ParcelRegistered(uint256 indexed parcelId, address indexed owner, uint32 cellCount, string metadataURI);
    event CreditsIssued(uint256 indexed parcelId, address indexed to, uint256 amount, bytes32 evidence, string evidenceURI);
    event ParcelFlagged(uint256 indexed parcelId, bytes32 evidence, string reason);
    event FlagCleared(uint256 indexed parcelId, bytes32 evidence);
    event CreditsRevoked(uint256 indexed parcelId, address indexed holder, uint256 amount, bytes32 evidence);
    event CreditsRetired(
        uint256 indexed retirementId,
        uint256 indexed parcelId,
        address indexed retiree,
        uint256 amount,
        string beneficiary,
        string reason
    );
    event MaxCreditsPerCellUpdated(uint256 value);

    error NoCells();
    error TooManyCells();
    error CellAlreadyClaimed(uint64 cell, uint256 parcelId);
    error UnknownParcel(uint256 parcelId);
    error ParcelNotActive(uint256 parcelId);
    error ParcelNotFlagged(uint256 parcelId);
    error ParcelFrozen(uint256 parcelId);
    error ExceedsCeiling(uint256 requested, uint256 allowed);
    error ZeroAmount();

    constructor(address admin, address verifier, uint256 maxCreditsPerCell_) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, verifier);
        maxCreditsPerCell = maxCreditsPerCell_;
        emit MaxCreditsPerCellUpdated(maxCreditsPerCell_);
    }

    // ------------------------------------------------------------------ admin

    function setMaxCreditsPerCell(uint256 value) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxCreditsPerCell = value;
        emit MaxCreditsPerCellUpdated(value);
    }

    // --------------------------------------------------------------- register

    /// @notice Register a parcel as a set of geohash cells. Reverts if ANY cell is
    ///         already claimed by another parcel (double-counting protection).
    function registerParcel(uint64[] calldata cells, string calldata metadataURI)
        external
        returns (uint256 parcelId)
    {
        if (cells.length == 0) revert NoCells();
        if (cells.length > MAX_CELLS_PER_PARCEL) revert TooManyCells();

        parcelId = ++parcelCount;

        for (uint256 i = 0; i < cells.length; i++) {
            uint256 existing = cellParcel[cells[i]];
            if (existing != 0) revert CellAlreadyClaimed(cells[i], existing);
            cellParcel[cells[i]] = parcelId;
        }

        Parcel storage p = _parcels[parcelId];
        p.owner = msg.sender;
        p.status = Status.Active;
        p.registeredAt = uint64(block.timestamp);
        p.cellCount = uint32(cells.length);
        p.metadataURI = metadataURI;

        emit ParcelRegistered(parcelId, msg.sender, uint32(cells.length), metadataURI);
    }

    // ------------------------------------------------------------------ issue

    /// @notice Issue credits to the parcel owner, backed by an MRV report.
    function issueCredits(uint256 parcelId, uint256 amount, bytes32 evidence, string calldata evidenceURI)
        external
        onlyRole(VERIFIER_ROLE)
    {
        Parcel storage p = _requireParcel(parcelId);
        if (p.status != Status.Active) revert ParcelNotActive(parcelId);
        if (amount == 0) revert ZeroAmount();

        uint256 ceiling = uint256(p.cellCount) * maxCreditsPerCell;
        uint256 outstanding = p.issued - p.revoked;
        if (outstanding + amount > ceiling) revert ExceedsCeiling(outstanding + amount, ceiling);

        p.issued += amount;
        p.lastEvidence = evidence;
        _mint(p.owner, parcelId, amount, "");

        emit CreditsIssued(parcelId, p.owner, amount, evidence, evidenceURI);
    }

    // ------------------------------------------------------------ living credits

    /// @notice Freeze a parcel's credits when monitoring detects vegetation loss.
    function flagParcel(uint256 parcelId, bytes32 evidence, string calldata reason)
        external
        onlyRole(VERIFIER_ROLE)
    {
        Parcel storage p = _requireParcel(parcelId);
        if (p.status != Status.Active) revert ParcelNotActive(parcelId);
        p.status = Status.Flagged;
        p.lastEvidence = evidence;
        emit ParcelFlagged(parcelId, evidence, reason);
    }

    /// @notice Lift a flag after a false alarm or recovery.
    function clearFlag(uint256 parcelId, bytes32 evidence) external onlyRole(VERIFIER_ROLE) {
        Parcel storage p = _requireParcel(parcelId);
        if (p.status != Status.Flagged) revert ParcelNotFlagged(parcelId);
        p.status = Status.Active;
        p.lastEvidence = evidence;
        emit FlagCleared(parcelId, evidence);
    }

    /// @notice Burn credits from a holder of a flagged parcel (confirmed loss).
    ///         Because a flagged parcel is frozen, holders cannot move credits away
    ///         between the flag and the revocation.
    function revokeCredits(uint256 parcelId, address holder, uint256 amount, bytes32 evidence)
        external
        onlyRole(VERIFIER_ROLE)
    {
        Parcel storage p = _requireParcel(parcelId);
        if (p.status != Status.Flagged) revert ParcelNotFlagged(parcelId);
        if (amount == 0) revert ZeroAmount();

        p.revoked += amount;
        p.lastEvidence = evidence;
        _burn(holder, parcelId, amount);

        emit CreditsRevoked(parcelId, holder, amount, evidence);
    }

    // ----------------------------------------------------------------- retire

    /// @notice Permanently retire credits you hold. Leaves a public on-chain record.
    function retire(uint256 parcelId, uint256 amount, string calldata beneficiary, string calldata reason)
        external
        returns (uint256 retirementId)
    {
        Parcel storage p = _requireParcel(parcelId);
        if (p.status != Status.Active) revert ParcelNotActive(parcelId);
        if (amount == 0) revert ZeroAmount();

        p.retired += amount;
        _burn(msg.sender, parcelId, amount);

        retirementId = _retirements.length;
        _retirements.push(
            Retirement({
                parcelId: parcelId,
                retiree: msg.sender,
                amount: amount,
                timestamp: uint64(block.timestamp),
                beneficiary: beneficiary,
                reason: reason
            })
        );

        emit CreditsRetired(retirementId, parcelId, msg.sender, amount, beneficiary, reason);
    }

    // ------------------------------------------------------------------ views

    function getParcel(uint256 parcelId) external view returns (Parcel memory) {
        _requireParcel(parcelId);
        return _parcels[parcelId];
    }

    function retirementCount() external view returns (uint256) {
        return _retirements.length;
    }

    function getRetirement(uint256 retirementId) external view returns (Retirement memory) {
        return _retirements[retirementId];
    }

    function isCellClaimed(uint64 cell) external view returns (bool) {
        return cellParcel[cell] != 0;
    }

    function uri(uint256 parcelId) public view override returns (string memory) {
        return _parcels[parcelId].metadataURI;
    }

    // --------------------------------------------------------------- internals

    function _requireParcel(uint256 parcelId) private view returns (Parcel storage p) {
        p = _parcels[parcelId];
        if (p.status == Status.None) revert UnknownParcel(parcelId);
    }

    /// @dev Block transfers (not mint/burn) of credits from a flagged parcel.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                if (_parcels[ids[i]].status == Status.Flagged) revert ParcelFrozen(ids[i]);
            }
        }
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
