// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPolicyModule} from "./IPolicyModule.sol";

/**
 * @title VolumePolicy
 * @notice Chainlink ACE Policy Module for volume and amount restrictions
 * @dev Enforces transfer limits, holding limits, and trading volume caps
 *
 * Features:
 * - Minimum/maximum transfer amounts
 * - Maximum holding per address
 * - Daily/weekly/monthly volume limits per address
 * - Global daily volume caps
 * - Cooling-off periods between transfers
 */
contract VolumePolicy is IPolicyModule, Ownable {
    // ============================================================================
    // Constants
    // ============================================================================

    string public constant override moduleName = "VolumePolicy";
    uint256 public constant override moduleVersion = 1;

    bytes32 public constant MIN_TRANSFER_POLICY = keccak256("MIN_TRANSFER");
    bytes32 public constant MAX_TRANSFER_POLICY = keccak256("MAX_TRANSFER");
    bytes32 public constant MAX_HOLDING_POLICY = keccak256("MAX_HOLDING");
    bytes32 public constant DAILY_VOLUME_POLICY = keccak256("DAILY_VOLUME");
    bytes32 public constant COOLDOWN_POLICY = keccak256("COOLDOWN");

    uint256 public constant SECONDS_PER_DAY = 86400;
    uint256 public constant SECONDS_PER_WEEK = 604800;

    // ============================================================================
    // Structs
    // ============================================================================

    struct TokenLimits {
        uint256 minTransferAmount;
        uint256 maxTransferAmount;
        uint256 maxHoldingAmount;
        uint256 dailyVolumeLimit;      // Per-address daily limit
        uint256 weeklyVolumeLimit;     // Per-address weekly limit
        uint256 globalDailyLimit;      // Global daily cap
        uint256 cooldownPeriod;        // Seconds between transfers
        bool enforceMinTransfer;
        bool enforceMaxTransfer;
        bool enforceMaxHolding;
        bool enforceDailyVolume;
        bool enforceWeeklyVolume;
        bool enforceGlobalDaily;
        bool enforceCooldown;
    }

    struct AddressVolume {
        uint256 dailyVolume;
        uint256 weeklyVolume;
        uint256 lastTransferTime;
        uint256 dayStartTime;
        uint256 weekStartTime;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Whether the module is active
    bool public active = true;

    /// @notice Token-specific limits
    mapping(address => TokenLimits) public tokenLimits;

    /// @notice Default limits for tokens without specific config
    TokenLimits public defaultLimits;

    /// @notice Per-address volume tracking: token => address => volume data
    mapping(address => mapping(address => AddressVolume)) public addressVolumes;

    /// @notice Global daily volume: token => day => volume
    mapping(address => mapping(uint256 => uint256)) public globalDailyVolumes;

    /// @notice Current holdings: token => address => balance
    mapping(address => mapping(address => uint256)) public holdings;

    /// @notice Policy configuration hash
    bytes32 private _policyHash;

    // ============================================================================
    // Events
    // ============================================================================

    event TokenLimitsUpdated(address indexed token);
    event DefaultLimitsUpdated();
    event VolumeTracked(address indexed token, address indexed account, uint256 amount);
    event HoldingUpdated(address indexed token, address indexed account, uint256 newBalance);

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {
        // Set sensible defaults
        defaultLimits = TokenLimits({
            minTransferAmount: 0,
            maxTransferAmount: type(uint256).max,
            maxHoldingAmount: type(uint256).max,
            dailyVolumeLimit: type(uint256).max,
            weeklyVolumeLimit: type(uint256).max,
            globalDailyLimit: type(uint256).max,
            cooldownPeriod: 0,
            enforceMinTransfer: false,
            enforceMaxTransfer: false,
            enforceMaxHolding: false,
            enforceDailyVolume: false,
            enforceWeeklyVolume: false,
            enforceGlobalDaily: false,
            enforceCooldown: false
        });

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
     * @notice Set default limits
     */
    function setDefaultLimits(TokenLimits calldata limits) external onlyOwner {
        defaultLimits = limits;
        emit DefaultLimitsUpdated();
        _updatePolicyHash();
    }

    /**
     * @notice Set token-specific limits
     */
    function setTokenLimits(address token, TokenLimits calldata limits) external onlyOwner {
        tokenLimits[token] = limits;
        emit TokenLimitsUpdated(token);
        _updatePolicyHash();
    }

    /**
     * @notice Set minimum transfer amount
     */
    function setMinTransfer(address token, uint256 amount, bool enforce) external onlyOwner {
        TokenLimits storage limits = tokenLimits[token];
        limits.minTransferAmount = amount;
        limits.enforceMinTransfer = enforce;
        emit TokenLimitsUpdated(token);
        _updatePolicyHash();
    }

    /**
     * @notice Set maximum transfer amount
     */
    function setMaxTransfer(address token, uint256 amount, bool enforce) external onlyOwner {
        TokenLimits storage limits = tokenLimits[token];
        limits.maxTransferAmount = amount;
        limits.enforceMaxTransfer = enforce;
        emit TokenLimitsUpdated(token);
        _updatePolicyHash();
    }

    /**
     * @notice Set maximum holding amount
     */
    function setMaxHolding(address token, uint256 amount, bool enforce) external onlyOwner {
        TokenLimits storage limits = tokenLimits[token];
        limits.maxHoldingAmount = amount;
        limits.enforceMaxHolding = enforce;
        emit TokenLimitsUpdated(token);
        _updatePolicyHash();
    }

    /**
     * @notice Set daily volume limit
     */
    function setDailyVolumeLimit(address token, uint256 amount, bool enforce) external onlyOwner {
        TokenLimits storage limits = tokenLimits[token];
        limits.dailyVolumeLimit = amount;
        limits.enforceDailyVolume = enforce;
        emit TokenLimitsUpdated(token);
        _updatePolicyHash();
    }

    /**
     * @notice Set cooldown period
     */
    function setCooldownPeriod(address token, uint256 seconds_, bool enforce) external onlyOwner {
        TokenLimits storage limits = tokenLimits[token];
        limits.cooldownPeriod = seconds_;
        limits.enforceCooldown = enforce;
        emit TokenLimitsUpdated(token);
        _updatePolicyHash();
    }

    /**
     * @notice Update holding balance (called by token or compliance contract)
     */
    function updateHolding(address token, address account, uint256 newBalance) external {
        holdings[token][account] = newBalance;
        emit HoldingUpdated(token, account, newBalance);
    }

    /**
     * @notice Record a transfer for volume tracking
     */
    function recordTransfer(address token, address account, uint256 amount) external {
        _updateVolume(token, account, amount);
    }

    // ============================================================================
    // IPolicyModule Implementation
    // ============================================================================

    /**
     * @notice Evaluate the volume policy
     */
    function evaluate(
        PolicyContext calldata context
    ) external view override returns (PolicyResult memory result) {
        result.policyId = MIN_TRANSFER_POLICY;
        result.timestamp = block.timestamp;
        result.allowed = true;

        if (!active) {
            result.proof = abi.encode("MODULE_INACTIVE");
            return result;
        }

        TokenLimits memory limits = _getEffectiveLimits(context.token);

        // Check minimum transfer amount
        if (limits.enforceMinTransfer && context.amount < limits.minTransferAmount) {
            result.allowed = false;
            result.policyId = MIN_TRANSFER_POLICY;
            result.reason = "Transfer amount below minimum";
            result.proof = abi.encode(context.amount, limits.minTransferAmount, "BELOW_MIN");
            return result;
        }

        // Check maximum transfer amount
        if (limits.enforceMaxTransfer && context.amount > limits.maxTransferAmount) {
            result.allowed = false;
            result.policyId = MAX_TRANSFER_POLICY;
            result.reason = "Transfer amount exceeds maximum";
            result.proof = abi.encode(context.amount, limits.maxTransferAmount, "ABOVE_MAX");
            return result;
        }

        // Check maximum holding for recipient
        if (limits.enforceMaxHolding) {
            uint256 currentHolding = holdings[context.token][context.to];
            uint256 newHolding = currentHolding + context.amount;
            if (newHolding > limits.maxHoldingAmount) {
                result.allowed = false;
                result.policyId = MAX_HOLDING_POLICY;
                result.reason = "Transfer would exceed maximum holding";
                result.proof = abi.encode(newHolding, limits.maxHoldingAmount, "EXCEEDS_MAX_HOLDING");
                return result;
            }
        }

        // Check daily volume limit for sender
        if (limits.enforceDailyVolume) {
            AddressVolume memory senderVolume = addressVolumes[context.token][context.from];
            uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
            uint256 todayVolume = senderVolume.dayStartTime / SECONDS_PER_DAY == currentDay
                ? senderVolume.dailyVolume
                : 0;

            if (todayVolume + context.amount > limits.dailyVolumeLimit) {
                result.allowed = false;
                result.policyId = DAILY_VOLUME_POLICY;
                result.reason = "Daily volume limit exceeded";
                result.proof = abi.encode(todayVolume + context.amount, limits.dailyVolumeLimit, "DAILY_LIMIT");
                return result;
            }
        }

        // Check weekly volume limit for sender
        if (limits.enforceWeeklyVolume) {
            AddressVolume memory senderVolume = addressVolumes[context.token][context.from];
            uint256 currentWeek = block.timestamp / SECONDS_PER_WEEK;
            uint256 weekVolume = senderVolume.weekStartTime / SECONDS_PER_WEEK == currentWeek
                ? senderVolume.weeklyVolume
                : 0;

            if (weekVolume + context.amount > limits.weeklyVolumeLimit) {
                result.allowed = false;
                result.reason = "Weekly volume limit exceeded";
                result.proof = abi.encode(weekVolume + context.amount, limits.weeklyVolumeLimit, "WEEKLY_LIMIT");
                return result;
            }
        }

        // Check global daily limit
        if (limits.enforceGlobalDaily) {
            uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
            uint256 globalVolume = globalDailyVolumes[context.token][currentDay];

            if (globalVolume + context.amount > limits.globalDailyLimit) {
                result.allowed = false;
                result.reason = "Global daily volume limit exceeded";
                result.proof = abi.encode(globalVolume + context.amount, limits.globalDailyLimit, "GLOBAL_LIMIT");
                return result;
            }
        }

        // Check cooldown period
        if (limits.enforceCooldown && limits.cooldownPeriod > 0) {
            AddressVolume memory senderVolume = addressVolumes[context.token][context.from];
            if (senderVolume.lastTransferTime > 0) {
                uint256 timeSinceLastTransfer = block.timestamp - senderVolume.lastTransferTime;
                if (timeSinceLastTransfer < limits.cooldownPeriod) {
                    result.allowed = false;
                    result.policyId = COOLDOWN_POLICY;
                    result.reason = "Cooldown period not elapsed";
                    result.proof = abi.encode(
                        timeSinceLastTransfer,
                        limits.cooldownPeriod,
                        "COOLDOWN_ACTIVE"
                    );
                    return result;
                }
            }
        }

        // All checks passed
        result.proof = abi.encode("VOLUME_OK", context.amount, block.timestamp);
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
     * @notice Get effective limits (token-specific or default)
     */
    function _getEffectiveLimits(address token) internal view returns (TokenLimits memory) {
        TokenLimits memory limits = tokenLimits[token];

        // If no token-specific limits, use defaults
        if (limits.minTransferAmount == 0 &&
            limits.maxTransferAmount == 0 &&
            !limits.enforceMinTransfer &&
            !limits.enforceMaxTransfer) {
            return defaultLimits;
        }

        return limits;
    }

    /**
     * @notice Update volume tracking for an address
     */
    function _updateVolume(address token, address account, uint256 amount) internal {
        AddressVolume storage volume = addressVolumes[token][account];
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        uint256 currentWeek = block.timestamp / SECONDS_PER_WEEK;

        // Reset daily volume if new day
        if (volume.dayStartTime / SECONDS_PER_DAY != currentDay) {
            volume.dailyVolume = 0;
            volume.dayStartTime = block.timestamp;
        }

        // Reset weekly volume if new week
        if (volume.weekStartTime / SECONDS_PER_WEEK != currentWeek) {
            volume.weeklyVolume = 0;
            volume.weekStartTime = block.timestamp;
        }

        volume.dailyVolume += amount;
        volume.weeklyVolume += amount;
        volume.lastTransferTime = block.timestamp;

        // Update global daily volume
        globalDailyVolumes[token][currentDay] += amount;

        emit VolumeTracked(token, account, amount);
    }

    /**
     * @notice Update policy hash
     */
    function _updatePolicyHash() internal {
        _policyHash = keccak256(abi.encodePacked(
            defaultLimits.minTransferAmount,
            defaultLimits.maxTransferAmount,
            defaultLimits.maxHoldingAmount,
            block.timestamp
        ));
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get current volume for an address
     */
    function getAddressVolume(
        address token,
        address account
    ) external view returns (uint256 daily, uint256 weekly, uint256 lastTransfer) {
        AddressVolume memory volume = addressVolumes[token][account];
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        uint256 currentWeek = block.timestamp / SECONDS_PER_WEEK;

        daily = volume.dayStartTime / SECONDS_PER_DAY == currentDay ? volume.dailyVolume : 0;
        weekly = volume.weekStartTime / SECONDS_PER_WEEK == currentWeek ? volume.weeklyVolume : 0;
        lastTransfer = volume.lastTransferTime;
    }

    /**
     * @notice Get remaining daily volume for an address
     */
    function getRemainingDailyVolume(
        address token,
        address account
    ) external view returns (uint256 remaining) {
        TokenLimits memory limits = _getEffectiveLimits(token);
        if (!limits.enforceDailyVolume) {
            return type(uint256).max;
        }

        AddressVolume memory volume = addressVolumes[token][account];
        uint256 currentDay = block.timestamp / SECONDS_PER_DAY;
        uint256 todayVolume = volume.dayStartTime / SECONDS_PER_DAY == currentDay
            ? volume.dailyVolume
            : 0;

        if (todayVolume >= limits.dailyVolumeLimit) {
            return 0;
        }
        return limits.dailyVolumeLimit - todayVolume;
    }

    /**
     * @notice Check if transfer would be allowed
     */
    function wouldTransferBeAllowed(
        address token,
        address from,
        address to,
        uint256 amount
    ) external view returns (bool allowed, string memory reason) {
        PolicyContext memory context = PolicyContext({
            from: from,
            to: to,
            amount: amount,
            token: token,
            assetId: bytes32(0),
            additionalData: ""
        });

        PolicyResult memory result = this.evaluate(context);
        return (result.allowed, result.reason);
    }
}
