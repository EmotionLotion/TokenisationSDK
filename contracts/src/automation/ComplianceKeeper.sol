// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ComplianceKeeper
 * @notice Chainlink Automation compatible contract for automated compliance monitoring
 * @dev Checks for KYC expirations, sanctions updates, and investor eligibility
 */
contract ComplianceKeeper is AutomationCompatibleInterface, Ownable {
    // ============================================================================
    // Errors
    // ============================================================================

    error InvestorNotFound(bytes32 investorId);
    error InvestorAlreadyRegistered(bytes32 investorId);
    error InvalidKYCLevel(string level);
    error NotAuthorizedProvider(address provider);

    // ============================================================================
    // Events
    // ============================================================================

    event InvestorRegistered(
        bytes32 indexed investorId,
        address indexed wallet,
        string kycLevel,
        uint256 kycExpiry
    );
    event KYCExpired(
        bytes32 indexed investorId,
        uint256 expiryTime,
        uint256 currentTime
    );
    event KYCRenewalRequired(
        bytes32 indexed investorId,
        uint256 daysUntilExpiry
    );
    event InvestorSuspended(
        bytes32 indexed investorId,
        string reason
    );
    event InvestorReinstated(bytes32 indexed investorId);
    event KYCUpdated(
        bytes32 indexed investorId,
        string newLevel,
        uint256 newExpiry,
        address provider
    );
    event SanctionsCheckRequired(bytes32 indexed investorId);
    event ProviderAuthorized(address indexed provider, bool authorized);

    // ============================================================================
    // Enums & Structs
    // ============================================================================

    enum InvestorStatus {
        ACTIVE,
        PENDING_RENEWAL,
        EXPIRED,
        SUSPENDED,
        SANCTIONED
    }

    struct Investor {
        address wallet;
        string kycLevel;             // "BASIC", "STANDARD", "ENHANCED"
        uint256 kycExpiry;           // KYC expiration timestamp
        uint256 lastVerified;        // Last verification timestamp
        InvestorStatus status;
        bool isRegistered;
        string jurisdiction;         // Country code
        uint256 investmentLimit;     // Maximum investment allowed
    }

    struct ComplianceCheck {
        bytes32 investorId;
        CheckType checkType;
        uint256 scheduledTime;
        bool isPending;
    }

    enum CheckType {
        KYC_RENEWAL,
        SANCTIONS_SCREEN,
        PERIODIC_REVIEW,
        INVESTMENT_LIMIT
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Mapping from investor ID to investor info
    mapping(bytes32 => Investor) public investors;

    /// @notice All registered investor IDs
    bytes32[] public investorIds;

    /// @notice Authorized KYC providers
    mapping(address => bool) public authorizedProviders;

    /// @notice Days before expiry to trigger renewal warning
    uint256 public renewalWarningDays = 30;

    /// @notice Minimum time between compliance checks
    uint256 public minCheckInterval = 86400; // 24 hours

    /// @notice Last upkeep timestamp
    uint256 public lastUpkeepTime;

    /// @notice Maximum investors to check per upkeep
    uint256 public maxInvestorsPerCheck = 50;

    /// @notice Sanctions check interval (90 days)
    uint256 public sanctionsCheckInterval = 90 days;

    /// @notice Pending compliance checks
    mapping(bytes32 => ComplianceCheck) public pendingChecks;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // Provider Management
    // ============================================================================

    /**
     * @notice Authorize or revoke a KYC provider
     * @param provider The provider address
     * @param authorized Whether to authorize or revoke
     */
    function setProviderAuthorization(address provider, bool authorized) external onlyOwner {
        authorizedProviders[provider] = authorized;
        emit ProviderAuthorized(provider, authorized);
    }

    /**
     * @notice Update configuration parameters
     */
    function setConfig(
        uint256 _renewalWarningDays,
        uint256 _minCheckInterval,
        uint256 _maxInvestorsPerCheck,
        uint256 _sanctionsCheckInterval
    ) external onlyOwner {
        renewalWarningDays = _renewalWarningDays;
        minCheckInterval = _minCheckInterval;
        maxInvestorsPerCheck = _maxInvestorsPerCheck;
        sanctionsCheckInterval = _sanctionsCheckInterval;
    }

    // ============================================================================
    // Investor Management
    // ============================================================================

    /**
     * @notice Register a new investor
     * @param investorId Unique identifier
     * @param wallet Investor wallet address
     * @param kycLevel KYC verification level
     * @param kycExpiry KYC expiration timestamp
     * @param jurisdiction Country code
     * @param investmentLimit Maximum investment amount
     */
    function registerInvestor(
        bytes32 investorId,
        address wallet,
        string calldata kycLevel,
        uint256 kycExpiry,
        string calldata jurisdiction,
        uint256 investmentLimit
    ) external {
        if (!authorizedProviders[msg.sender] && msg.sender != owner()) {
            revert NotAuthorizedProvider(msg.sender);
        }

        if (investors[investorId].isRegistered) {
            revert InvestorAlreadyRegistered(investorId);
        }

        investors[investorId] = Investor({
            wallet: wallet,
            kycLevel: kycLevel,
            kycExpiry: kycExpiry,
            lastVerified: block.timestamp,
            status: InvestorStatus.ACTIVE,
            isRegistered: true,
            jurisdiction: jurisdiction,
            investmentLimit: investmentLimit
        });

        investorIds.push(investorId);

        emit InvestorRegistered(investorId, wallet, kycLevel, kycExpiry);
    }

    /**
     * @notice Update investor KYC
     * @param investorId The investor ID
     * @param newLevel New KYC level
     * @param newExpiry New expiry timestamp
     */
    function updateKYC(
        bytes32 investorId,
        string calldata newLevel,
        uint256 newExpiry
    ) external {
        if (!authorizedProviders[msg.sender] && msg.sender != owner()) {
            revert NotAuthorizedProvider(msg.sender);
        }

        Investor storage investor = investors[investorId];

        if (!investor.isRegistered) {
            revert InvestorNotFound(investorId);
        }

        investor.kycLevel = newLevel;
        investor.kycExpiry = newExpiry;
        investor.lastVerified = block.timestamp;

        // Reinstate if was expired or pending renewal
        if (investor.status == InvestorStatus.EXPIRED ||
            investor.status == InvestorStatus.PENDING_RENEWAL) {
            investor.status = InvestorStatus.ACTIVE;
        }

        emit KYCUpdated(investorId, newLevel, newExpiry, msg.sender);
    }

    /**
     * @notice Suspend an investor
     * @param investorId The investor ID
     * @param reason Suspension reason
     */
    function suspendInvestor(bytes32 investorId, string calldata reason) external onlyOwner {
        Investor storage investor = investors[investorId];

        if (!investor.isRegistered) {
            revert InvestorNotFound(investorId);
        }

        investor.status = InvestorStatus.SUSPENDED;
        emit InvestorSuspended(investorId, reason);
    }

    /**
     * @notice Reinstate a suspended investor
     * @param investorId The investor ID
     */
    function reinstateInvestor(bytes32 investorId) external onlyOwner {
        Investor storage investor = investors[investorId];

        if (!investor.isRegistered) {
            revert InvestorNotFound(investorId);
        }

        investor.status = InvestorStatus.ACTIVE;
        emit InvestorReinstated(investorId);
    }

    /**
     * @notice Mark investor as sanctioned
     * @param investorId The investor ID
     */
    function markSanctioned(bytes32 investorId) external {
        if (!authorizedProviders[msg.sender] && msg.sender != owner()) {
            revert NotAuthorizedProvider(msg.sender);
        }

        Investor storage investor = investors[investorId];

        if (!investor.isRegistered) {
            revert InvestorNotFound(investorId);
        }

        investor.status = InvestorStatus.SANCTIONED;
        emit InvestorSuspended(investorId, "SANCTIONS_MATCH");
    }

    // ============================================================================
    // Chainlink Automation
    // ============================================================================

    /**
     * @notice Check if upkeep is needed (Chainlink Automation)
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Data to pass to performUpkeep
     */
    function checkUpkeep(
        bytes calldata /* checkData */
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        // Check if enough time has passed since last check
        if (block.timestamp < lastUpkeepTime + minCheckInterval) {
            return (false, "");
        }

        // Find investors needing attention
        bytes32[] memory needsAttention = new bytes32[](maxInvestorsPerCheck);
        uint8[] memory checkTypes = new uint8[](maxInvestorsPerCheck);
        uint256 count = 0;

        for (uint256 i = 0; i < investorIds.length && count < maxInvestorsPerCheck; i++) {
            bytes32 investorId = investorIds[i];
            Investor memory investor = investors[investorId];

            if (!investor.isRegistered || investor.status == InvestorStatus.SANCTIONED) {
                continue;
            }

            // Check for KYC expiration
            if (block.timestamp >= investor.kycExpiry) {
                needsAttention[count] = investorId;
                checkTypes[count] = uint8(CheckType.KYC_RENEWAL);
                count++;
                continue;
            }

            // Check for upcoming expiry (warning period)
            uint256 daysUntilExpiry = (investor.kycExpiry - block.timestamp) / 1 days;
            if (daysUntilExpiry <= renewalWarningDays && investor.status == InvestorStatus.ACTIVE) {
                needsAttention[count] = investorId;
                checkTypes[count] = uint8(CheckType.KYC_RENEWAL);
                count++;
                continue;
            }

            // Check for sanctions screening (periodic)
            if (block.timestamp >= investor.lastVerified + sanctionsCheckInterval) {
                needsAttention[count] = investorId;
                checkTypes[count] = uint8(CheckType.SANCTIONS_SCREEN);
                count++;
            }
        }

        if (count > 0) {
            // Trim arrays to actual size
            bytes32[] memory resultIds = new bytes32[](count);
            uint8[] memory resultTypes = new uint8[](count);

            for (uint256 i = 0; i < count; i++) {
                resultIds[i] = needsAttention[i];
                resultTypes[i] = checkTypes[i];
            }

            upkeepNeeded = true;
            performData = abi.encode(resultIds, resultTypes);
        }
    }

    /**
     * @notice Perform upkeep (Chainlink Automation)
     * @param performData Data from checkUpkeep
     */
    function performUpkeep(bytes calldata performData) external override {
        (bytes32[] memory investorIdsToCheck, uint8[] memory checkTypes) =
            abi.decode(performData, (bytes32[], uint8[]));

        for (uint256 i = 0; i < investorIdsToCheck.length; i++) {
            bytes32 investorId = investorIdsToCheck[i];
            CheckType checkType = CheckType(checkTypes[i]);

            _processComplianceCheck(investorId, checkType);
        }

        lastUpkeepTime = block.timestamp;
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Process a compliance check
     */
    function _processComplianceCheck(bytes32 investorId, CheckType checkType) internal {
        Investor storage investor = investors[investorId];

        if (!investor.isRegistered) {
            return;
        }

        if (checkType == CheckType.KYC_RENEWAL) {
            if (block.timestamp >= investor.kycExpiry) {
                // KYC has expired
                investor.status = InvestorStatus.EXPIRED;
                emit KYCExpired(investorId, investor.kycExpiry, block.timestamp);
            } else {
                // KYC expiring soon
                uint256 daysUntilExpiry = (investor.kycExpiry - block.timestamp) / 1 days;
                investor.status = InvestorStatus.PENDING_RENEWAL;
                emit KYCRenewalRequired(investorId, daysUntilExpiry);
            }
        } else if (checkType == CheckType.SANCTIONS_SCREEN) {
            // Flag for off-chain sanctions check
            emit SanctionsCheckRequired(investorId);

            // Create pending check
            pendingChecks[investorId] = ComplianceCheck({
                investorId: investorId,
                checkType: CheckType.SANCTIONS_SCREEN,
                scheduledTime: block.timestamp,
                isPending: true
            });
        }
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get investor info
     * @param investorId The investor ID
     * @return investor The investor info
     */
    function getInvestor(bytes32 investorId) external view returns (Investor memory) {
        return investors[investorId];
    }

    /**
     * @notice Check if investor is compliant
     * @param investorId The investor ID
     * @return compliant Whether investor is compliant
     * @return currentStatus The investor status
     */
    function isCompliant(bytes32 investorId) external view returns (bool compliant, InvestorStatus currentStatus) {
        Investor memory investor = investors[investorId];

        if (!investor.isRegistered) {
            return (false, InvestorStatus.SUSPENDED);
        }

        currentStatus = investor.status;
        compliant = (currentStatus == InvestorStatus.ACTIVE || currentStatus == InvestorStatus.PENDING_RENEWAL) &&
                    block.timestamp < investor.kycExpiry;
    }

    /**
     * @notice Get investors by status
     * @param status The status to filter by
     * @return ids Array of investor IDs
     */
    function getInvestorsByStatus(InvestorStatus status) external view returns (bytes32[] memory) {
        uint256 count = 0;

        for (uint256 i = 0; i < investorIds.length; i++) {
            if (investors[investorIds[i]].status == status) {
                count++;
            }
        }

        bytes32[] memory result = new bytes32[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < investorIds.length; i++) {
            if (investors[investorIds[i]].status == status) {
                result[index] = investorIds[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get total registered investors
     * @return The number of registered investors
     */
    function getInvestorCount() external view returns (uint256) {
        return investorIds.length;
    }

    /**
     * @notice Get investors needing KYC renewal
     * @return ids Investor IDs needing renewal
     * @return expiryTimes Their expiry timestamps
     */
    function getExpiringInvestors() external view returns (
        bytes32[] memory ids,
        uint256[] memory expiryTimes
    ) {
        uint256 count = 0;
        uint256 warningThreshold = block.timestamp + (renewalWarningDays * 1 days);

        for (uint256 i = 0; i < investorIds.length; i++) {
            Investor memory investor = investors[investorIds[i]];
            if (investor.isRegistered &&
                investor.kycExpiry <= warningThreshold &&
                investor.status != InvestorStatus.SANCTIONED) {
                count++;
            }
        }

        ids = new bytes32[](count);
        expiryTimes = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < investorIds.length; i++) {
            Investor memory investor = investors[investorIds[i]];
            if (investor.isRegistered &&
                investor.kycExpiry <= warningThreshold &&
                investor.status != InvestorStatus.SANCTIONED) {
                ids[index] = investorIds[i];
                expiryTimes[index] = investor.kycExpiry;
                index++;
            }
        }
    }
}
