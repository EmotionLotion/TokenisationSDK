// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PackedStorage
 * @notice Gas-optimized storage patterns using bit packing
 * @dev Reduces storage costs by packing multiple values into single slots
 */
library PackedStorage {
    // ==================== INVESTOR DATA PACKING ====================

    /**
     * @notice Packed investor data structure
     * @dev Fits in single 256-bit slot:
     *      - kycLevel: 8 bits (0-255, enough for KYC levels)
     *      - countryCode: 16 bits (ISO 3166-1 numeric)
     *      - kycExpiry: 40 bits (Unix timestamp, good until year 36812)
     *      - flags: 32 bits (various boolean flags)
     *      - reserved: 160 bits (for future use)
     */
    struct PackedInvestor {
        uint256 data;
    }

    // Bit positions
    uint256 private constant KYC_LEVEL_OFFSET = 0;
    uint256 private constant COUNTRY_CODE_OFFSET = 8;
    uint256 private constant KYC_EXPIRY_OFFSET = 24;
    uint256 private constant FLAGS_OFFSET = 64;

    // Masks
    uint256 private constant KYC_LEVEL_MASK = 0xFF;
    uint256 private constant COUNTRY_CODE_MASK = 0xFFFF;
    uint256 private constant KYC_EXPIRY_MASK = 0xFFFFFFFFFF;
    uint256 private constant FLAGS_MASK = 0xFFFFFFFF;

    // Flag bits
    uint256 private constant FLAG_VERIFIED = 1 << 0;
    uint256 private constant FLAG_ACCREDITED = 1 << 1;
    uint256 private constant FLAG_FROZEN = 1 << 2;
    uint256 private constant FLAG_BLACKLISTED = 1 << 3;
    uint256 private constant FLAG_CAN_RECEIVE = 1 << 4;
    uint256 private constant FLAG_CAN_SEND = 1 << 5;

    /**
     * @notice Pack investor data into single slot
     */
    function pack(
        uint8 kycLevel,
        uint16 countryCode,
        uint40 kycExpiry,
        bool verified,
        bool accredited,
        bool frozen,
        bool blacklisted
    ) internal pure returns (PackedInvestor memory) {
        uint256 data = uint256(kycLevel);
        data |= uint256(countryCode) << COUNTRY_CODE_OFFSET;
        data |= uint256(kycExpiry) << KYC_EXPIRY_OFFSET;

        uint256 flags = 0;
        if (verified) flags |= FLAG_VERIFIED;
        if (accredited) flags |= FLAG_ACCREDITED;
        if (frozen) flags |= FLAG_FROZEN;
        if (blacklisted) flags |= FLAG_BLACKLISTED;
        flags |= FLAG_CAN_RECEIVE | FLAG_CAN_SEND; // Default permissions

        data |= flags << FLAGS_OFFSET;

        return PackedInvestor(data);
    }

    /**
     * @notice Get KYC level
     */
    function getKycLevel(PackedInvestor storage self) internal view returns (uint8) {
        return uint8(self.data & KYC_LEVEL_MASK);
    }

    /**
     * @notice Set KYC level
     */
    function setKycLevel(PackedInvestor storage self, uint8 level) internal {
        self.data = (self.data & ~KYC_LEVEL_MASK) | uint256(level);
    }

    /**
     * @notice Get country code
     */
    function getCountryCode(PackedInvestor storage self) internal view returns (uint16) {
        return uint16((self.data >> COUNTRY_CODE_OFFSET) & COUNTRY_CODE_MASK);
    }

    /**
     * @notice Set country code
     */
    function setCountryCode(PackedInvestor storage self, uint16 code) internal {
        self.data = (self.data & ~(COUNTRY_CODE_MASK << COUNTRY_CODE_OFFSET))
            | (uint256(code) << COUNTRY_CODE_OFFSET);
    }

    /**
     * @notice Get KYC expiry timestamp
     */
    function getKycExpiry(PackedInvestor storage self) internal view returns (uint40) {
        return uint40((self.data >> KYC_EXPIRY_OFFSET) & KYC_EXPIRY_MASK);
    }

    /**
     * @notice Set KYC expiry timestamp
     */
    function setKycExpiry(PackedInvestor storage self, uint40 expiry) internal {
        self.data = (self.data & ~(KYC_EXPIRY_MASK << KYC_EXPIRY_OFFSET))
            | (uint256(expiry) << KYC_EXPIRY_OFFSET);
    }

    /**
     * @notice Check if investor is verified
     */
    function isVerified(PackedInvestor storage self) internal view returns (bool) {
        return (self.data >> FLAGS_OFFSET) & FLAG_VERIFIED != 0;
    }

    /**
     * @notice Set verified status
     */
    function setVerified(PackedInvestor storage self, bool verified) internal {
        if (verified) {
            self.data |= FLAG_VERIFIED << FLAGS_OFFSET;
        } else {
            self.data &= ~(FLAG_VERIFIED << FLAGS_OFFSET);
        }
    }

    /**
     * @notice Check if investor is accredited
     */
    function isAccredited(PackedInvestor storage self) internal view returns (bool) {
        return (self.data >> FLAGS_OFFSET) & FLAG_ACCREDITED != 0;
    }

    /**
     * @notice Set accredited status
     */
    function setAccredited(PackedInvestor storage self, bool accredited) internal {
        if (accredited) {
            self.data |= FLAG_ACCREDITED << FLAGS_OFFSET;
        } else {
            self.data &= ~(FLAG_ACCREDITED << FLAGS_OFFSET);
        }
    }

    /**
     * @notice Check if investor is frozen
     */
    function isFrozen(PackedInvestor storage self) internal view returns (bool) {
        return (self.data >> FLAGS_OFFSET) & FLAG_FROZEN != 0;
    }

    /**
     * @notice Set frozen status
     */
    function setFrozen(PackedInvestor storage self, bool frozen) internal {
        if (frozen) {
            self.data |= FLAG_FROZEN << FLAGS_OFFSET;
        } else {
            self.data &= ~(FLAG_FROZEN << FLAGS_OFFSET);
        }
    }

    /**
     * @notice Check if investor is blacklisted
     */
    function isBlacklisted(PackedInvestor storage self) internal view returns (bool) {
        return (self.data >> FLAGS_OFFSET) & FLAG_BLACKLISTED != 0;
    }

    /**
     * @notice Set blacklisted status
     */
    function setBlacklisted(PackedInvestor storage self, bool blacklisted) internal {
        if (blacklisted) {
            self.data |= FLAG_BLACKLISTED << FLAGS_OFFSET;
        } else {
            self.data &= ~(FLAG_BLACKLISTED << FLAGS_OFFSET);
        }
    }

    /**
     * @notice Check if KYC is valid (not expired)
     */
    function isKycValid(PackedInvestor storage self) internal view returns (bool) {
        if (!isVerified(self)) return false;
        if (isFrozen(self)) return false;
        if (isBlacklisted(self)) return false;

        uint40 expiry = getKycExpiry(self);
        return expiry == 0 || expiry > block.timestamp;
    }

    /**
     * @notice Check if investor can transfer
     */
    function canTransfer(PackedInvestor storage self) internal view returns (bool) {
        if (!isKycValid(self)) return false;
        return (self.data >> FLAGS_OFFSET) & FLAG_CAN_SEND != 0;
    }

    /**
     * @notice Check if investor can receive
     */
    function canReceive(PackedInvestor storage self) internal view returns (bool) {
        if (!isKycValid(self)) return false;
        return (self.data >> FLAGS_OFFSET) & FLAG_CAN_RECEIVE != 0;
    }

    // ==================== DIVIDEND DATA PACKING ====================

    /**
     * @notice Packed dividend record
     * @dev Fits in single 256-bit slot:
     *      - dividendId: 32 bits
     *      - amount: 96 bits (enough for most token amounts)
     *      - timestamp: 40 bits
     *      - status: 8 bits
     *      - reserved: 80 bits
     */
    struct PackedDividend {
        uint256 data;
    }

    uint256 private constant DIVIDEND_ID_OFFSET = 0;
    uint256 private constant DIVIDEND_AMOUNT_OFFSET = 32;
    uint256 private constant DIVIDEND_TIMESTAMP_OFFSET = 128;
    uint256 private constant DIVIDEND_STATUS_OFFSET = 168;

    uint256 private constant DIVIDEND_ID_MASK = 0xFFFFFFFF;
    uint256 private constant DIVIDEND_AMOUNT_MASK = 0xFFFFFFFFFFFFFFFFFFFFFFFF; // 96 bits
    uint256 private constant DIVIDEND_TIMESTAMP_MASK = 0xFFFFFFFFFF;
    uint256 private constant DIVIDEND_STATUS_MASK = 0xFF;

    function packDividend(
        uint32 dividendId,
        uint96 amount,
        uint40 timestamp,
        uint8 status
    ) internal pure returns (PackedDividend memory) {
        uint256 data = uint256(dividendId);
        data |= uint256(amount) << DIVIDEND_AMOUNT_OFFSET;
        data |= uint256(timestamp) << DIVIDEND_TIMESTAMP_OFFSET;
        data |= uint256(status) << DIVIDEND_STATUS_OFFSET;
        return PackedDividend(data);
    }

    function getDividendId(PackedDividend storage self) internal view returns (uint32) {
        return uint32(self.data & DIVIDEND_ID_MASK);
    }

    function getDividendAmount(PackedDividend storage self) internal view returns (uint96) {
        return uint96((self.data >> DIVIDEND_AMOUNT_OFFSET) & DIVIDEND_AMOUNT_MASK);
    }

    function getDividendTimestamp(PackedDividend storage self) internal view returns (uint40) {
        return uint40((self.data >> DIVIDEND_TIMESTAMP_OFFSET) & DIVIDEND_TIMESTAMP_MASK);
    }

    function getDividendStatus(PackedDividend storage self) internal view returns (uint8) {
        return uint8((self.data >> DIVIDEND_STATUS_OFFSET) & DIVIDEND_STATUS_MASK);
    }
}
