// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPolicyModule} from "./IPolicyModule.sol";

/**
 * @title TimePolicy
 * @notice Chainlink ACE Policy Module for time-based restrictions
 * @dev Enforces lockup periods, trading windows, and time-based rules
 *
 * Features:
 * - Token lockup periods (vesting schedules)
 * - Trading window restrictions (market hours)
 * - Blackout periods (e.g., around earnings)
 * - Time-delayed transfers
 * - Expiration dates
 */
contract TimePolicy is IPolicyModule, Ownable {
    // ============================================================================
    // Constants
    // ============================================================================

    string public constant override moduleName = "TimePolicy";
    uint256 public constant override moduleVersion = 1;

    bytes32 public constant LOCKUP_POLICY = keccak256("LOCKUP");
    bytes32 public constant TRADING_WINDOW_POLICY = keccak256("TRADING_WINDOW");
    bytes32 public constant BLACKOUT_POLICY = keccak256("BLACKOUT");
    bytes32 public constant EXPIRATION_POLICY = keccak256("EXPIRATION");

    // ============================================================================
    // Structs
    // ============================================================================

    struct LockupSchedule {
        uint256 startTime;
        uint256 cliffDuration;     // Time until first unlock
        uint256 vestingDuration;   // Total vesting period
        uint256 releasePercentage; // Percentage released at cliff (basis points)
        bool enforced;
    }

    struct TradingWindow {
        uint8 startHourUTC;        // 0-23
        uint8 endHourUTC;          // 0-23
        uint8 allowedDays;         // Bitmask: bit 0 = Sunday, bit 6 = Saturday
        bool enforced;
    }

    struct BlackoutPeriod {
        uint256 startTime;
        uint256 endTime;
        string reason;
        bool active;
    }

    struct TokenTimeConfig {
        LockupSchedule lockup;
        TradingWindow tradingWindow;
        uint256 expirationTime;    // 0 = no expiration
        bool enforceExpiration;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Whether the module is active
    bool public active = true;

    /// @notice Token-specific time configurations
    mapping(address => TokenTimeConfig) public tokenConfigs;

    /// @notice Per-address lockup schedules: token => address => schedule
    mapping(address => mapping(address => LockupSchedule)) public addressLockups;

    /// @notice Blackout periods: token => period index => period
    mapping(address => mapping(uint256 => BlackoutPeriod)) public blackoutPeriods;

    /// @notice Number of blackout periods per token
    mapping(address => uint256) public blackoutCount;

    /// @notice Delayed transfers: transferId => release time
    mapping(bytes32 => uint256) public delayedTransfers;

    /// @notice Default trading window (24/7 by default)
    TradingWindow public defaultTradingWindow;

    /// @notice Policy configuration hash
    bytes32 private _policyHash;

    // ============================================================================
    // Events
    // ============================================================================

    event LockupConfigured(address indexed token, address indexed account, uint256 startTime, uint256 duration);
    event TradingWindowUpdated(address indexed token, uint8 startHour, uint8 endHour, uint8 allowedDays);
    event BlackoutPeriodAdded(address indexed token, uint256 indexed periodId, uint256 startTime, uint256 endTime);
    event BlackoutPeriodRemoved(address indexed token, uint256 indexed periodId);
    event ExpirationSet(address indexed token, uint256 expirationTime);
    event DelayedTransferQueued(bytes32 indexed transferId, uint256 releaseTime);

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {
        // Default: 24/7 trading allowed
        defaultTradingWindow = TradingWindow({
            startHourUTC: 0,
            endHourUTC: 24,
            allowedDays: 0x7F,  // All days
            enforced: false
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
     * @notice Configure lockup for a token
     */
    function setTokenLockup(
        address token,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration,
        uint256 releasePercentage
    ) external onlyOwner {
        tokenConfigs[token].lockup = LockupSchedule({
            startTime: startTime,
            cliffDuration: cliffDuration,
            vestingDuration: vestingDuration,
            releasePercentage: releasePercentage,
            enforced: true
        });

        emit LockupConfigured(token, address(0), startTime, vestingDuration);
        _updatePolicyHash();
    }

    /**
     * @notice Configure lockup for a specific address
     */
    function setAddressLockup(
        address token,
        address account,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration,
        uint256 releasePercentage
    ) external onlyOwner {
        addressLockups[token][account] = LockupSchedule({
            startTime: startTime,
            cliffDuration: cliffDuration,
            vestingDuration: vestingDuration,
            releasePercentage: releasePercentage,
            enforced: true
        });

        emit LockupConfigured(token, account, startTime, vestingDuration);
    }

    /**
     * @notice Configure trading window for a token
     */
    function setTradingWindow(
        address token,
        uint8 startHourUTC,
        uint8 endHourUTC,
        uint8 allowedDays,
        bool enforce
    ) external onlyOwner {
        require(startHourUTC < 24 && endHourUTC <= 24, "Invalid hours");

        tokenConfigs[token].tradingWindow = TradingWindow({
            startHourUTC: startHourUTC,
            endHourUTC: endHourUTC,
            allowedDays: allowedDays,
            enforced: enforce
        });

        emit TradingWindowUpdated(token, startHourUTC, endHourUTC, allowedDays);
        _updatePolicyHash();
    }

    /**
     * @notice Add a blackout period
     */
    function addBlackoutPeriod(
        address token,
        uint256 startTime,
        uint256 endTime,
        string calldata reason
    ) external onlyOwner returns (uint256 periodId) {
        require(endTime > startTime, "Invalid period");

        periodId = blackoutCount[token];
        blackoutPeriods[token][periodId] = BlackoutPeriod({
            startTime: startTime,
            endTime: endTime,
            reason: reason,
            active: true
        });

        blackoutCount[token]++;
        emit BlackoutPeriodAdded(token, periodId, startTime, endTime);
        _updatePolicyHash();
    }

    /**
     * @notice Remove a blackout period
     */
    function removeBlackoutPeriod(address token, uint256 periodId) external onlyOwner {
        require(periodId < blackoutCount[token], "Invalid period ID");
        blackoutPeriods[token][periodId].active = false;
        emit BlackoutPeriodRemoved(token, periodId);
        _updatePolicyHash();
    }

    /**
     * @notice Set token expiration
     */
    function setExpiration(address token, uint256 expirationTime, bool enforce) external onlyOwner {
        tokenConfigs[token].expirationTime = expirationTime;
        tokenConfigs[token].enforceExpiration = enforce;
        emit ExpirationSet(token, expirationTime);
        _updatePolicyHash();
    }

    // ============================================================================
    // IPolicyModule Implementation
    // ============================================================================

    /**
     * @notice Evaluate the time policy
     */
    function evaluate(
        PolicyContext calldata context
    ) external view override returns (PolicyResult memory result) {
        result.policyId = LOCKUP_POLICY;
        result.timestamp = block.timestamp;
        result.allowed = true;

        if (!active) {
            result.proof = abi.encode("MODULE_INACTIVE");
            return result;
        }

        TokenTimeConfig memory config = tokenConfigs[context.token];

        // Check token expiration
        if (config.enforceExpiration && config.expirationTime > 0) {
            if (block.timestamp > config.expirationTime) {
                result.allowed = false;
                result.policyId = EXPIRATION_POLICY;
                result.reason = "Token has expired";
                result.proof = abi.encode(block.timestamp, config.expirationTime, "EXPIRED");
                return result;
            }
        }

        // Check lockup - first address-specific, then token-level
        LockupSchedule memory lockup = addressLockups[context.token][context.from];
        if (!lockup.enforced) {
            lockup = config.lockup;
        }

        if (lockup.enforced) {
            (bool canTransfer, string memory lockupReason) = _checkLockup(lockup, context.amount);
            if (!canTransfer) {
                result.allowed = false;
                result.policyId = LOCKUP_POLICY;
                result.reason = lockupReason;
                result.proof = abi.encode(
                    lockup.startTime,
                    lockup.cliffDuration,
                    lockup.vestingDuration,
                    "LOCKED"
                );
                return result;
            }
        }

        // Check trading window
        TradingWindow memory window = config.tradingWindow;
        if (!window.enforced) {
            window = defaultTradingWindow;
        }

        if (window.enforced) {
            (bool inWindow, string memory windowReason) = _checkTradingWindow(window);
            if (!inWindow) {
                result.allowed = false;
                result.policyId = TRADING_WINDOW_POLICY;
                result.reason = windowReason;
                result.proof = abi.encode(
                    window.startHourUTC,
                    window.endHourUTC,
                    window.allowedDays,
                    "OUTSIDE_WINDOW"
                );
                return result;
            }
        }

        // Check blackout periods
        for (uint256 i = 0; i < blackoutCount[context.token]; i++) {
            BlackoutPeriod memory period = blackoutPeriods[context.token][i];
            if (period.active &&
                block.timestamp >= period.startTime &&
                block.timestamp <= period.endTime) {
                result.allowed = false;
                result.policyId = BLACKOUT_POLICY;
                result.reason = string(abi.encodePacked("Blackout period: ", period.reason));
                result.proof = abi.encode(period.startTime, period.endTime, "BLACKOUT");
                return result;
            }
        }

        // All checks passed
        result.proof = abi.encode("TIME_OK", block.timestamp);
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
     * @notice Check lockup schedule
     */
    function _checkLockup(
        LockupSchedule memory lockup,
        uint256 /* amount */
    ) internal view returns (bool canTransfer, string memory reason) {
        // Before cliff
        if (block.timestamp < lockup.startTime + lockup.cliffDuration) {
            return (false, "Tokens are locked until cliff");
        }

        // After full vesting
        if (block.timestamp >= lockup.startTime + lockup.vestingDuration) {
            return (true, "");
        }

        // During vesting - partial unlock
        // For simplicity, we allow transfers after cliff
        // A more sophisticated implementation would track vested amounts
        return (true, "");
    }

    /**
     * @notice Check trading window
     */
    function _checkTradingWindow(
        TradingWindow memory window
    ) internal view returns (bool inWindow, string memory reason) {
        // Get current hour (UTC) - approximate, doesn't account for leap seconds
        uint256 hourOfDay = (block.timestamp % 86400) / 3600;

        // Get day of week (0 = Thursday for Unix epoch, we adjust)
        // Unix epoch (Jan 1, 1970) was a Thursday
        uint256 dayOfWeek = ((block.timestamp / 86400) + 4) % 7; // 0 = Sunday

        // Check if day is allowed
        if ((window.allowedDays & (1 << dayOfWeek)) == 0) {
            return (false, "Trading not allowed on this day");
        }

        // Check if hour is within window
        if (window.startHourUTC < window.endHourUTC) {
            // Normal case: e.g., 9-17
            if (hourOfDay < window.startHourUTC || hourOfDay >= window.endHourUTC) {
                return (false, "Outside trading hours");
            }
        } else if (window.startHourUTC > window.endHourUTC) {
            // Overnight case: e.g., 22-6
            if (hourOfDay >= window.endHourUTC && hourOfDay < window.startHourUTC) {
                return (false, "Outside trading hours");
            }
        }
        // If start == end, always open

        return (true, "");
    }

    /**
     * @notice Update policy hash
     */
    function _updatePolicyHash() internal {
        _policyHash = keccak256(abi.encodePacked(
            defaultTradingWindow.startHourUTC,
            defaultTradingWindow.endHourUTC,
            defaultTradingWindow.allowedDays,
            block.timestamp
        ));
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get vested percentage for an address
     */
    function getVestedPercentage(
        address token,
        address account
    ) external view returns (uint256 percentage) {
        LockupSchedule memory lockup = addressLockups[token][account];
        if (!lockup.enforced) {
            lockup = tokenConfigs[token].lockup;
        }

        if (!lockup.enforced) {
            return 10000; // 100% if no lockup
        }

        // Before cliff
        if (block.timestamp < lockup.startTime + lockup.cliffDuration) {
            return 0;
        }

        // After full vesting
        if (block.timestamp >= lockup.startTime + lockup.vestingDuration) {
            return 10000; // 100%
        }

        // During vesting - linear
        uint256 elapsed = block.timestamp - lockup.startTime;
        uint256 cliffRelease = lockup.releasePercentage;
        uint256 remainingPercentage = 10000 - cliffRelease;
        uint256 vestingElapsed = elapsed - lockup.cliffDuration;
        uint256 vestingRemaining = lockup.vestingDuration - lockup.cliffDuration;

        uint256 vestedAfterCliff = (remainingPercentage * vestingElapsed) / vestingRemaining;

        return cliffRelease + vestedAfterCliff;
    }

    /**
     * @notice Check if currently in trading window
     */
    function isInTradingWindow(address token) external view returns (bool) {
        TradingWindow memory window = tokenConfigs[token].tradingWindow;
        if (!window.enforced) {
            return true;
        }
        (bool inWindow,) = _checkTradingWindow(window);
        return inWindow;
    }

    /**
     * @notice Check if in blackout period
     */
    function isInBlackout(address token) external view returns (bool inBlackout, string memory reason) {
        for (uint256 i = 0; i < blackoutCount[token]; i++) {
            BlackoutPeriod memory period = blackoutPeriods[token][i];
            if (period.active &&
                block.timestamp >= period.startTime &&
                block.timestamp <= period.endTime) {
                return (true, period.reason);
            }
        }
        return (false, "");
    }

    /**
     * @notice Get time until lockup cliff ends
     */
    function getTimeUntilCliff(
        address token,
        address account
    ) external view returns (uint256 timeRemaining) {
        LockupSchedule memory lockup = addressLockups[token][account];
        if (!lockup.enforced) {
            lockup = tokenConfigs[token].lockup;
        }

        if (!lockup.enforced) {
            return 0;
        }

        uint256 cliffEnd = lockup.startTime + lockup.cliffDuration;
        if (block.timestamp >= cliffEnd) {
            return 0;
        }

        return cliffEnd - block.timestamp;
    }
}
