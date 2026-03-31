// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ClaimTopics
 * @dev Standard claim topic constants for identity verification
 * @notice Maps to ERC-735 claim topics used across compliance token contracts
 */
library ClaimTopics {
    /// @notice Know Your Customer verification
    uint256 constant KYC = 1;

    /// @notice Anti-Money Laundering check
    uint256 constant AML = 2;

    /// @notice Accredited Investor status (Reg D 506(b)/506(c))
    uint256 constant ACCREDITATION = 3;

    /// @notice Qualified Purchaser status (US)
    uint256 constant QUALIFIED_PURCHASER = 4;

    /// @notice Country/Jurisdiction whitelist
    uint256 constant COUNTRY_ALLOWED = 5;

    /// @notice Institutional Investor status
    uint256 constant INSTITUTIONAL = 6;

    /// @notice Professional Investor status (EU MiFID)
    uint256 constant PROFESSIONAL = 7;

    /// @notice Politically Exposed Person check
    uint256 constant PEP_CHECK = 8;

    /// @notice Sanctions screening
    uint256 constant SANCTIONS_CHECK = 9;

    /// @notice Source of Funds verification
    uint256 constant SOURCE_OF_FUNDS = 10;

    /// @notice Tax Residency declaration
    uint256 constant TAX_RESIDENCY = 11;

    /// @notice Beneficial Ownership declaration
    uint256 constant BENEFICIAL_OWNERSHIP = 12;
}
