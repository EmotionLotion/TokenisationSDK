// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PackedStorage} from "./PackedStorage.sol";

/**
 * @title GasOptimizedRegistry
 * @notice Gas-optimized identity registry using packed storage
 * @dev Uses single storage slot per investor instead of multiple mappings
 */
contract GasOptimizedRegistry is Ownable {
    using PackedStorage for PackedStorage.PackedInvestor;

    // ==================== EVENTS ====================

    event IdentityRegistered(address indexed investor, uint16 countryCode, uint8 kycLevel);
    event IdentityUpdated(address indexed investor);
    event IdentityFrozen(address indexed investor, bool frozen);
    event IdentityBlacklisted(address indexed investor, bool blacklisted);
    event BatchRegistered(uint256 count);

    // ==================== ERRORS ====================

    error NotRegistered();
    error AlreadyRegistered();
    error InvalidCountryCode();
    error InvalidKycLevel();
    error BatchTooLarge();

    // ==================== STORAGE ====================

    /// @notice Packed investor data - single slot per investor
    mapping(address => PackedStorage.PackedInvestor) private _investors;

    /// @notice Registered investor count
    uint256 public investorCount;

    /// @notice Maximum batch size for gas optimization
    uint256 public constant MAX_BATCH_SIZE = 100;

    /// @notice Agents authorized to manage identities
    mapping(address => bool) public agents;

    // ==================== MODIFIERS ====================

    modifier onlyAgent() {
        require(agents[msg.sender] || msg.sender == owner(), "Not agent");
        _;
    }

    // ==================== CONSTRUCTOR ====================

    constructor() Ownable(msg.sender) {
        agents[msg.sender] = true;
    }

    // ==================== AGENT MANAGEMENT ====================

    function addAgent(address agent) external onlyOwner {
        agents[agent] = true;
    }

    function removeAgent(address agent) external onlyOwner {
        agents[agent] = false;
    }

    // ==================== SINGLE REGISTRATION ====================

    /**
     * @notice Register a new investor identity
     * @param investor Address to register
     * @param countryCode ISO 3166-1 numeric country code
     * @param kycLevel KYC verification level (1-255)
     * @param kycExpiry Unix timestamp when KYC expires (0 = never)
     * @param accredited Whether investor is accredited
     */
    function registerIdentity(
        address investor,
        uint16 countryCode,
        uint8 kycLevel,
        uint40 kycExpiry,
        bool accredited
    ) external onlyAgent {
        if (_investors[investor].isVerified()) revert AlreadyRegistered();
        if (countryCode == 0) revert InvalidCountryCode();
        if (kycLevel == 0) revert InvalidKycLevel();

        _investors[investor] = PackedStorage.pack(
            kycLevel,
            countryCode,
            kycExpiry,
            true, // verified
            accredited,
            false, // frozen
            false // blacklisted
        );

        unchecked {
            ++investorCount;
        }

        emit IdentityRegistered(investor, countryCode, kycLevel);
    }

    // ==================== BATCH REGISTRATION ====================

    /**
     * @notice Register multiple investors in single transaction
     * @dev Highly gas efficient - only 1 storage write per investor
     * @param investors Array of investor addresses
     * @param countryCodes Array of country codes
     * @param kycLevels Array of KYC levels
     * @param kycExpiries Array of KYC expiry timestamps
     */
    function batchRegister(
        address[] calldata investors,
        uint16[] calldata countryCodes,
        uint8[] calldata kycLevels,
        uint40[] calldata kycExpiries
    ) external onlyAgent {
        uint256 length = investors.length;
        if (length > MAX_BATCH_SIZE) revert BatchTooLarge();
        require(
            length == countryCodes.length &&
            length == kycLevels.length &&
            length == kycExpiries.length,
            "Array mismatch"
        );

        for (uint256 i = 0; i < length;) {
            address investor = investors[i];

            if (!_investors[investor].isVerified()) {
                _investors[investor] = PackedStorage.pack(
                    kycLevels[i],
                    countryCodes[i],
                    kycExpiries[i],
                    true,
                    false,
                    false,
                    false
                );

                unchecked {
                    ++investorCount;
                }
            }

            unchecked { ++i; }
        }

        emit BatchRegistered(length);
    }

    // ==================== UPDATES ====================

    /**
     * @notice Update investor KYC level
     */
    function updateKycLevel(address investor, uint8 newLevel) external onlyAgent {
        if (!_investors[investor].isVerified()) revert NotRegistered();
        _investors[investor].setKycLevel(newLevel);
        emit IdentityUpdated(investor);
    }

    /**
     * @notice Update investor country code
     */
    function updateCountryCode(address investor, uint16 newCode) external onlyAgent {
        if (!_investors[investor].isVerified()) revert NotRegistered();
        _investors[investor].setCountryCode(newCode);
        emit IdentityUpdated(investor);
    }

    /**
     * @notice Update KYC expiry
     */
    function updateKycExpiry(address investor, uint40 newExpiry) external onlyAgent {
        if (!_investors[investor].isVerified()) revert NotRegistered();
        _investors[investor].setKycExpiry(newExpiry);
        emit IdentityUpdated(investor);
    }

    /**
     * @notice Set accredited status
     */
    function setAccredited(address investor, bool accredited) external onlyAgent {
        if (!_investors[investor].isVerified()) revert NotRegistered();
        _investors[investor].setAccredited(accredited);
        emit IdentityUpdated(investor);
    }

    /**
     * @notice Freeze an investor
     */
    function freezeIdentity(address investor, bool frozen) external onlyAgent {
        if (!_investors[investor].isVerified()) revert NotRegistered();
        _investors[investor].setFrozen(frozen);
        emit IdentityFrozen(investor, frozen);
    }

    /**
     * @notice Blacklist an investor
     */
    function blacklistIdentity(address investor, bool blacklisted) external onlyAgent {
        if (!_investors[investor].isVerified()) revert NotRegistered();
        _investors[investor].setBlacklisted(blacklisted);
        emit IdentityBlacklisted(investor, blacklisted);
    }

    // ==================== BATCH FREEZE ====================

    /**
     * @notice Batch freeze multiple investors
     */
    function batchFreeze(address[] calldata investors, bool frozen) external onlyAgent {
        if (investors.length > MAX_BATCH_SIZE) revert BatchTooLarge();

        for (uint256 i = 0; i < investors.length;) {
            if (_investors[investors[i]].isVerified()) {
                _investors[investors[i]].setFrozen(frozen);
            }
            unchecked { ++i; }
        }
    }

    // ==================== QUERIES ====================

    /**
     * @notice Check if investor is registered and KYC valid
     */
    function isVerified(address investor) external view returns (bool) {
        return _investors[investor].isKycValid();
    }

    /**
     * @notice Check if investor can transfer tokens
     */
    function canTransfer(address from, address to, uint256) external view returns (bool) {
        return _investors[from].canTransfer() && _investors[to].canReceive();
    }

    /**
     * @notice Get investor KYC level
     */
    function getKycLevel(address investor) external view returns (uint8) {
        return _investors[investor].getKycLevel();
    }

    /**
     * @notice Get investor country code
     */
    function getCountryCode(address investor) external view returns (uint16) {
        return _investors[investor].getCountryCode();
    }

    /**
     * @notice Get KYC expiry timestamp
     */
    function getKycExpiry(address investor) external view returns (uint40) {
        return _investors[investor].getKycExpiry();
    }

    /**
     * @notice Check if investor is accredited
     */
    function isAccredited(address investor) external view returns (bool) {
        return _investors[investor].isAccredited();
    }

    /**
     * @notice Check if investor is frozen
     */
    function isFrozen(address investor) external view returns (bool) {
        return _investors[investor].isFrozen();
    }

    /**
     * @notice Check if investor is blacklisted
     */
    function isBlacklisted(address investor) external view returns (bool) {
        return _investors[investor].isBlacklisted();
    }

    /**
     * @notice Get full investor data (unpacked)
     */
    function getInvestorData(address investor)
        external
        view
        returns (
            uint8 kycLevel,
            uint16 countryCode,
            uint40 kycExpiry,
            bool verified,
            bool accredited,
            bool frozen,
            bool blacklisted
        )
    {
        PackedStorage.PackedInvestor storage data = _investors[investor];
        return (
            data.getKycLevel(),
            data.getCountryCode(),
            data.getKycExpiry(),
            data.isVerified(),
            data.isAccredited(),
            data.isFrozen(),
            data.isBlacklisted()
        );
    }

    /**
     * @notice Batch check verification status
     * @dev Gas efficient bulk query
     */
    function batchIsVerified(address[] calldata investors)
        external
        view
        returns (bool[] memory results)
    {
        results = new bool[](investors.length);
        for (uint256 i = 0; i < investors.length;) {
            results[i] = _investors[investors[i]].isKycValid();
            unchecked { ++i; }
        }
    }
}
