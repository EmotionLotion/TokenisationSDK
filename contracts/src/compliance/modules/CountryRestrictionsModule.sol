// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CountryRestrictionsModule
 * @notice Compliance module for country-based transfer restrictions
 * @dev Uses ISO 3166-1 numeric country codes
 */
contract CountryRestrictionsModule is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event CountryRestricted(uint16 indexed countryCode);
    event CountryUnrestricted(uint16 indexed countryCode);
    event IdentityRegistrySet(address indexed registry);

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Mapping of restricted countries (true = restricted)
    mapping(uint16 => bool) public restrictedCountries;

    /// @notice Array of all restricted country codes
    uint16[] private _restrictedList;

    /// @notice Identity registry to fetch user countries
    address public identityRegistry;

    /// @notice Module name
    string public constant name = "CountryRestrictionsModule";

    /// @notice Whether module is plug-and-play (no state migration needed)
    bool public constant isPlugAndPlay = true;

    // Common restricted countries (example - OFAC sanctioned)
    uint16 public constant COUNTRY_IRAN = 364;
    uint16 public constant COUNTRY_NORTH_KOREA = 408;
    uint16 public constant COUNTRY_SYRIA = 760;
    uint16 public constant COUNTRY_CUBA = 192;
    uint16 public constant COUNTRY_RUSSIA = 643;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner, address _identityRegistry) Ownable(initialOwner) {
        identityRegistry = _identityRegistry;
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Set the identity registry
     * @param _identityRegistry New registry address
     */
    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        require(_identityRegistry != address(0), "Invalid registry");
        identityRegistry = _identityRegistry;
        emit IdentityRegistrySet(_identityRegistry);
    }

    /**
     * @notice Add a country to restrictions
     * @param countryCode ISO 3166-1 numeric country code
     */
    function addCountryRestriction(uint16 countryCode) external onlyOwner {
        require(!restrictedCountries[countryCode], "Already restricted");

        restrictedCountries[countryCode] = true;
        _restrictedList.push(countryCode);

        emit CountryRestricted(countryCode);
    }

    /**
     * @notice Add multiple countries to restrictions
     * @param countryCodes Array of country codes
     */
    function addCountryRestrictionsBatch(uint16[] calldata countryCodes) external onlyOwner {
        for (uint256 i = 0; i < countryCodes.length; i++) {
            if (!restrictedCountries[countryCodes[i]]) {
                restrictedCountries[countryCodes[i]] = true;
                _restrictedList.push(countryCodes[i]);
                emit CountryRestricted(countryCodes[i]);
            }
        }
    }

    /**
     * @notice Remove a country from restrictions
     * @param countryCode ISO 3166-1 numeric country code
     */
    function removeCountryRestriction(uint16 countryCode) external onlyOwner {
        require(restrictedCountries[countryCode], "Not restricted");

        restrictedCountries[countryCode] = false;

        // Remove from array
        for (uint256 i = 0; i < _restrictedList.length; i++) {
            if (_restrictedList[i] == countryCode) {
                _restrictedList[i] = _restrictedList[_restrictedList.length - 1];
                _restrictedList.pop();
                break;
            }
        }

        emit CountryUnrestricted(countryCode);
    }

    /**
     * @notice Add OFAC-sanctioned countries
     */
    function addOFACSanctions() external onlyOwner {
        uint16[5] memory ofacCountries = [
            COUNTRY_IRAN,
            COUNTRY_NORTH_KOREA,
            COUNTRY_SYRIA,
            COUNTRY_CUBA,
            COUNTRY_RUSSIA
        ];

        for (uint256 i = 0; i < ofacCountries.length; i++) {
            if (!restrictedCountries[ofacCountries[i]]) {
                restrictedCountries[ofacCountries[i]] = true;
                _restrictedList.push(ofacCountries[i]);
                emit CountryRestricted(ofacCountries[i]);
            }
        }
    }

    // ============================================================================
    // Compliance Module Interface
    // ============================================================================

    /**
     * @notice Check if transfer is compliant
     * @param from Sender address
     * @param to Recipient address
     * @return Whether compliant
     */
    function moduleCheck(
        address from,
        address to,
        uint256 /* value */,
        address /* token */
    ) external view returns (bool) {
        if (identityRegistry == address(0)) {
            return true; // No registry, allow all
        }

        // Get countries from identity registry
        uint16 fromCountry = _getCountry(from);
        uint16 toCountry = _getCountry(to);

        // Check if either party is from a restricted country
        if (fromCountry != 0 && restrictedCountries[fromCountry]) {
            return false;
        }

        if (toCountry != 0 && restrictedCountries[toCountry]) {
            return false;
        }

        return true;
    }

    function moduleMint(address /* to */, uint256 /* value */) external pure {
        // No action needed on mint
    }

    function moduleBurn(address /* from */, uint256 /* value */) external pure {
        // No action needed on burn
    }

    function moduleTransfer(
        address /* from */,
        address /* to */,
        uint256 /* value */
    ) external pure {
        // No action needed on transfer (check happens in moduleCheck)
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    function _getCountry(address user) internal view returns (uint16) {
        if (identityRegistry == address(0)) {
            return 0;
        }

        // Call identity registry to get country
        // Interface: function getCountry(address) returns (uint16)
        (bool success, bytes memory data) = identityRegistry.staticcall(
            abi.encodeWithSignature("getCountry(address)", user)
        );

        if (success && data.length >= 32) {
            return uint16(abi.decode(data, (uint256)));
        }

        return 0;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get all restricted countries
     * @return Array of country codes
     */
    function getRestrictedCountries() external view returns (uint16[] memory) {
        return _restrictedList;
    }

    /**
     * @notice Check if a country is restricted
     * @param countryCode The country code
     * @return Whether restricted
     */
    function isCountryRestricted(uint16 countryCode) external view returns (bool) {
        return restrictedCountries[countryCode];
    }

    /**
     * @notice Get count of restricted countries
     * @return The count
     */
    function getRestrictedCountriesCount() external view returns (uint256) {
        return _restrictedList.length;
    }
}
