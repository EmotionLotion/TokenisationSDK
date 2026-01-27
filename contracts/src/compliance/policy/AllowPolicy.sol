// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPolicyModule} from "./IPolicyModule.sol";

/**
 * @title AllowPolicy
 * @notice Chainlink ACE Policy Module for allowlist/blocklist enforcement
 * @dev Enforces who can send/receive tokens based on configurable lists
 *
 * Features:
 * - Global allowlist/blocklist for all tokens
 * - Per-token allowlist/blocklist overrides
 * - Jurisdiction-based blocking
 * - KYC verification requirements
 * - Accreditation requirements
 */
contract AllowPolicy is IPolicyModule, Ownable {
    // ============================================================================
    // Constants
    // ============================================================================

    string public constant override moduleName = "AllowPolicy";
    uint256 public constant override moduleVersion = 1;

    // Policy IDs
    bytes32 public constant GLOBAL_ALLOWLIST_POLICY = keccak256("GLOBAL_ALLOWLIST");
    bytes32 public constant GLOBAL_BLOCKLIST_POLICY = keccak256("GLOBAL_BLOCKLIST");
    bytes32 public constant JURISDICTION_POLICY = keccak256("JURISDICTION");
    bytes32 public constant KYC_POLICY = keccak256("KYC_REQUIRED");
    bytes32 public constant ACCREDITATION_POLICY = keccak256("ACCREDITATION_REQUIRED");

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Whether the module is active
    bool public active = true;

    /// @notice Whether to use allowlist mode (true) or blocklist mode (false)
    bool public allowlistMode = false;

    /// @notice Global allowlist
    mapping(address => bool) public globalAllowlist;

    /// @notice Global blocklist
    mapping(address => bool) public globalBlocklist;

    /// @notice Per-token allowlist: token => address => allowed
    mapping(address => mapping(address => bool)) public tokenAllowlist;

    /// @notice Per-token blocklist: token => address => blocked
    mapping(address => mapping(address => bool)) public tokenBlocklist;

    /// @notice Blocked jurisdictions (ISO 3166-1 alpha-2 as bytes2)
    mapping(bytes2 => bool) public blockedJurisdictions;

    /// @notice Address to jurisdiction mapping
    mapping(address => bytes2) public addressJurisdiction;

    /// @notice KYC verified addresses
    mapping(address => bool) public kycVerified;

    /// @notice KYC expiry timestamps
    mapping(address => uint256) public kycExpiry;

    /// @notice Accredited investor addresses
    mapping(address => bool) public accreditedInvestors;

    /// @notice Whether KYC is required for transfers
    bool public kycRequired = true;

    /// @notice Whether accreditation is required
    bool public accreditationRequired = false;

    /// @notice Policy configuration hash (for DON verification)
    bytes32 private _policyHash;

    // ============================================================================
    // Events
    // ============================================================================

    event AddressAllowlisted(address indexed account, bool global);
    event AddressBlocklisted(address indexed account, bool global);
    event JurisdictionBlocked(bytes2 indexed jurisdiction);
    event JurisdictionUnblocked(bytes2 indexed jurisdiction);
    event KYCStatusUpdated(address indexed account, bool verified, uint256 expiry);
    event AccreditationUpdated(address indexed account, bool accredited);
    event PolicyConfigUpdated(bytes32 newHash);

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {
        _updatePolicyHash();
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Set module active status
     */
    function setActive(bool _active) external onlyOwner {
        active = _active;
    }

    /**
     * @notice Set allowlist mode
     * @param _allowlistMode True for allowlist, false for blocklist
     */
    function setAllowlistMode(bool _allowlistMode) external onlyOwner {
        allowlistMode = _allowlistMode;
        _updatePolicyHash();
    }

    /**
     * @notice Set KYC requirement
     */
    function setKYCRequired(bool required) external onlyOwner {
        kycRequired = required;
        _updatePolicyHash();
    }

    /**
     * @notice Set accreditation requirement
     */
    function setAccreditationRequired(bool required) external onlyOwner {
        accreditationRequired = required;
        _updatePolicyHash();
    }

    // ============================================================================
    // Allowlist/Blocklist Management
    // ============================================================================

    /**
     * @notice Add address to global allowlist
     */
    function addToGlobalAllowlist(address account) external onlyOwner {
        globalAllowlist[account] = true;
        emit AddressAllowlisted(account, true);
        _updatePolicyHash();
    }

    /**
     * @notice Remove address from global allowlist
     */
    function removeFromGlobalAllowlist(address account) external onlyOwner {
        globalAllowlist[account] = false;
        _updatePolicyHash();
    }

    /**
     * @notice Add address to global blocklist
     */
    function addToGlobalBlocklist(address account) external onlyOwner {
        globalBlocklist[account] = true;
        emit AddressBlocklisted(account, true);
        _updatePolicyHash();
    }

    /**
     * @notice Remove address from global blocklist
     */
    function removeFromGlobalBlocklist(address account) external onlyOwner {
        globalBlocklist[account] = false;
        _updatePolicyHash();
    }

    /**
     * @notice Batch add to global allowlist
     */
    function batchAddToGlobalAllowlist(address[] calldata accounts) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            globalAllowlist[accounts[i]] = true;
            emit AddressAllowlisted(accounts[i], true);
        }
        _updatePolicyHash();
    }

    /**
     * @notice Add address to token-specific allowlist
     */
    function addToTokenAllowlist(address token, address account) external onlyOwner {
        tokenAllowlist[token][account] = true;
        emit AddressAllowlisted(account, false);
    }

    /**
     * @notice Add address to token-specific blocklist
     */
    function addToTokenBlocklist(address token, address account) external onlyOwner {
        tokenBlocklist[token][account] = true;
        emit AddressBlocklisted(account, false);
    }

    // ============================================================================
    // Jurisdiction Management
    // ============================================================================

    /**
     * @notice Block a jurisdiction
     * @param jurisdiction ISO 3166-1 alpha-2 code
     */
    function blockJurisdiction(bytes2 jurisdiction) external onlyOwner {
        blockedJurisdictions[jurisdiction] = true;
        emit JurisdictionBlocked(jurisdiction);
        _updatePolicyHash();
    }

    /**
     * @notice Unblock a jurisdiction
     */
    function unblockJurisdiction(bytes2 jurisdiction) external onlyOwner {
        blockedJurisdictions[jurisdiction] = false;
        emit JurisdictionUnblocked(jurisdiction);
        _updatePolicyHash();
    }

    /**
     * @notice Set address jurisdiction
     */
    function setAddressJurisdiction(address account, bytes2 jurisdiction) external onlyOwner {
        addressJurisdiction[account] = jurisdiction;
    }

    /**
     * @notice Batch set address jurisdictions
     */
    function batchSetJurisdictions(
        address[] calldata accounts,
        bytes2[] calldata jurisdictions
    ) external onlyOwner {
        require(accounts.length == jurisdictions.length, "Length mismatch");
        for (uint256 i = 0; i < accounts.length; i++) {
            addressJurisdiction[accounts[i]] = jurisdictions[i];
        }
    }

    // ============================================================================
    // KYC/Accreditation Management
    // ============================================================================

    /**
     * @notice Set KYC status for an address
     */
    function setKYCStatus(address account, bool verified, uint256 expiry) external onlyOwner {
        kycVerified[account] = verified;
        kycExpiry[account] = expiry;
        emit KYCStatusUpdated(account, verified, expiry);
    }

    /**
     * @notice Batch set KYC status
     */
    function batchSetKYCStatus(
        address[] calldata accounts,
        bool[] calldata verified,
        uint256[] calldata expiries
    ) external onlyOwner {
        require(accounts.length == verified.length && accounts.length == expiries.length, "Length mismatch");
        for (uint256 i = 0; i < accounts.length; i++) {
            kycVerified[accounts[i]] = verified[i];
            kycExpiry[accounts[i]] = expiries[i];
            emit KYCStatusUpdated(accounts[i], verified[i], expiries[i]);
        }
    }

    /**
     * @notice Set accreditation status
     */
    function setAccreditationStatus(address account, bool accredited) external onlyOwner {
        accreditedInvestors[account] = accredited;
        emit AccreditationUpdated(account, accredited);
    }

    // ============================================================================
    // IPolicyModule Implementation
    // ============================================================================

    /**
     * @notice Evaluate the allow policy
     */
    function evaluate(
        PolicyContext calldata context
    ) external view override returns (PolicyResult memory result) {
        result.policyId = GLOBAL_ALLOWLIST_POLICY;
        result.timestamp = block.timestamp;
        result.allowed = true;

        // Skip evaluation if module is not active
        if (!active) {
            result.proof = abi.encode("MODULE_INACTIVE");
            return result;
        }

        // Check global blocklist first (always enforced)
        if (globalBlocklist[context.from]) {
            result.allowed = false;
            result.policyId = GLOBAL_BLOCKLIST_POLICY;
            result.reason = "Sender is globally blocklisted";
            result.proof = abi.encode(context.from, "SENDER_BLOCKLISTED");
            return result;
        }

        if (globalBlocklist[context.to]) {
            result.allowed = false;
            result.policyId = GLOBAL_BLOCKLIST_POLICY;
            result.reason = "Recipient is globally blocklisted";
            result.proof = abi.encode(context.to, "RECIPIENT_BLOCKLISTED");
            return result;
        }

        // Check token-specific blocklist
        if (tokenBlocklist[context.token][context.from]) {
            result.allowed = false;
            result.reason = "Sender is blocklisted for this token";
            result.proof = abi.encode(context.from, context.token, "TOKEN_SENDER_BLOCKLISTED");
            return result;
        }

        if (tokenBlocklist[context.token][context.to]) {
            result.allowed = false;
            result.reason = "Recipient is blocklisted for this token";
            result.proof = abi.encode(context.to, context.token, "TOKEN_RECIPIENT_BLOCKLISTED");
            return result;
        }

        // Check jurisdiction
        bytes2 fromJurisdiction = addressJurisdiction[context.from];
        bytes2 toJurisdiction = addressJurisdiction[context.to];

        if (fromJurisdiction != bytes2(0) && blockedJurisdictions[fromJurisdiction]) {
            result.allowed = false;
            result.policyId = JURISDICTION_POLICY;
            result.reason = "Sender jurisdiction is blocked";
            result.proof = abi.encode(context.from, fromJurisdiction, "JURISDICTION_BLOCKED");
            return result;
        }

        if (toJurisdiction != bytes2(0) && blockedJurisdictions[toJurisdiction]) {
            result.allowed = false;
            result.policyId = JURISDICTION_POLICY;
            result.reason = "Recipient jurisdiction is blocked";
            result.proof = abi.encode(context.to, toJurisdiction, "JURISDICTION_BLOCKED");
            return result;
        }

        // Check KYC if required
        if (kycRequired) {
            if (!_isKYCValid(context.from)) {
                result.allowed = false;
                result.policyId = KYC_POLICY;
                result.reason = "Sender KYC not verified or expired";
                result.proof = abi.encode(context.from, "KYC_INVALID");
                return result;
            }

            if (!_isKYCValid(context.to)) {
                result.allowed = false;
                result.policyId = KYC_POLICY;
                result.reason = "Recipient KYC not verified or expired";
                result.proof = abi.encode(context.to, "KYC_INVALID");
                return result;
            }
        }

        // Check accreditation if required
        if (accreditationRequired) {
            if (!accreditedInvestors[context.from]) {
                result.allowed = false;
                result.policyId = ACCREDITATION_POLICY;
                result.reason = "Sender is not an accredited investor";
                result.proof = abi.encode(context.from, "NOT_ACCREDITED");
                return result;
            }

            if (!accreditedInvestors[context.to]) {
                result.allowed = false;
                result.policyId = ACCREDITATION_POLICY;
                result.reason = "Recipient is not an accredited investor";
                result.proof = abi.encode(context.to, "NOT_ACCREDITED");
                return result;
            }
        }

        // If in allowlist mode, check allowlist
        if (allowlistMode) {
            bool fromAllowed = globalAllowlist[context.from] || tokenAllowlist[context.token][context.from];
            bool toAllowed = globalAllowlist[context.to] || tokenAllowlist[context.token][context.to];

            if (!fromAllowed) {
                result.allowed = false;
                result.reason = "Sender is not on allowlist";
                result.proof = abi.encode(context.from, "NOT_ALLOWLISTED");
                return result;
            }

            if (!toAllowed) {
                result.allowed = false;
                result.reason = "Recipient is not on allowlist";
                result.proof = abi.encode(context.to, "NOT_ALLOWLISTED");
                return result;
            }
        }

        // All checks passed
        result.proof = abi.encode("ALLOWED", block.timestamp);
        return result;
    }

    /**
     * @notice Check if module is active
     */
    function isActive() external view override returns (bool) {
        return active;
    }

    /**
     * @notice Get the policy hash
     */
    function getPolicyHash() external view override returns (bytes32) {
        return _policyHash;
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Check if KYC is valid for an address
     */
    function _isKYCValid(address account) internal view returns (bool) {
        if (!kycVerified[account]) {
            return false;
        }
        if (kycExpiry[account] != 0 && kycExpiry[account] < block.timestamp) {
            return false;
        }
        return true;
    }

    /**
     * @notice Update the policy hash
     */
    function _updatePolicyHash() internal {
        _policyHash = keccak256(abi.encodePacked(
            allowlistMode,
            kycRequired,
            accreditationRequired,
            block.timestamp
        ));
        emit PolicyConfigUpdated(_policyHash);
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Check if an address is allowed
     */
    function isAddressAllowed(address account, address token) external view returns (bool) {
        if (globalBlocklist[account]) return false;
        if (tokenBlocklist[token][account]) return false;

        bytes2 jurisdiction = addressJurisdiction[account];
        if (jurisdiction != bytes2(0) && blockedJurisdictions[jurisdiction]) return false;

        if (kycRequired && !_isKYCValid(account)) return false;
        if (accreditationRequired && !accreditedInvestors[account]) return false;

        if (allowlistMode) {
            return globalAllowlist[account] || tokenAllowlist[token][account];
        }

        return true;
    }
}
