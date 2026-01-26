// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ChainlinkPriceFeed} from "./ChainlinkPriceFeed.sol";

/**
 * @title OracleRegistry
 * @notice Central registry for managing multiple oracle types and asset valuations
 * @dev Supports price feeds, NAV oracles, and custom data providers
 */
contract OracleRegistry is Ownable {
    // ============================================================================
    // Errors
    // ============================================================================

    error OracleNotRegistered(bytes32 oracleId);
    error OracleAlreadyRegistered(bytes32 oracleId);
    error InvalidOracleType();
    error UnauthorizedProvider(address provider);
    error AssetNotRegistered(bytes32 assetId);

    // ============================================================================
    // Events
    // ============================================================================

    event OracleRegistered(bytes32 indexed oracleId, OracleType oracleType, address oracleAddress);
    event OracleRemoved(bytes32 indexed oracleId);
    event AssetOracleSet(bytes32 indexed assetId, bytes32 indexed oracleId, string pricePair);
    event NAVUpdated(bytes32 indexed assetId, uint256 nav, uint256 timestamp, address provider);
    event ProviderAuthorized(address indexed provider, bool authorized);

    // ============================================================================
    // Enums & Structs
    // ============================================================================

    enum OracleType {
        CHAINLINK_PRICE_FEED,
        CHAINLINK_FUNCTIONS,
        CUSTOM_NAV,
        API3,
        PYTH
    }

    struct OracleInfo {
        OracleType oracleType;
        address oracleAddress;
        bool isActive;
        string description;
    }

    struct AssetOracle {
        bytes32 oracleId;
        string pricePair;  // e.g., "ETH/USD" for price feeds
        bool isConfigured;
    }

    struct NAVData {
        uint256 nav;           // Net Asset Value in base currency (e.g., USD with 8 decimals)
        uint256 updatedAt;
        address provider;
        string currency;       // e.g., "USD", "AED"
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Mapping from oracle ID to oracle info
    mapping(bytes32 => OracleInfo) public oracles;

    /// @notice Mapping from asset ID to its oracle configuration
    mapping(bytes32 => AssetOracle) public assetOracles;

    /// @notice Mapping from asset ID to latest NAV data
    mapping(bytes32 => NAVData) public assetNAVs;

    /// @notice Authorized NAV providers
    mapping(address => bool) public authorizedProviders;

    /// @notice Reference to the main Chainlink price feed contract
    ChainlinkPriceFeed public priceFeed;

    /// @notice All registered oracle IDs
    bytes32[] public oracleIds;

    /// @notice All registered asset IDs
    bytes32[] public assetIds;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner, address _priceFeed) Ownable(initialOwner) {
        priceFeed = ChainlinkPriceFeed(_priceFeed);
    }

    // ============================================================================
    // Oracle Management
    // ============================================================================

    /**
     * @notice Register a new oracle
     * @param oracleId Unique identifier for the oracle
     * @param oracleType Type of oracle
     * @param oracleAddress Address of the oracle contract
     * @param description Human-readable description
     */
    function registerOracle(
        bytes32 oracleId,
        OracleType oracleType,
        address oracleAddress,
        string calldata description
    ) external onlyOwner {
        if (oracles[oracleId].isActive) {
            revert OracleAlreadyRegistered(oracleId);
        }

        oracles[oracleId] = OracleInfo({
            oracleType: oracleType,
            oracleAddress: oracleAddress,
            isActive: true,
            description: description
        });

        oracleIds.push(oracleId);

        emit OracleRegistered(oracleId, oracleType, oracleAddress);
    }

    /**
     * @notice Remove an oracle
     * @param oracleId The oracle to remove
     */
    function removeOracle(bytes32 oracleId) external onlyOwner {
        if (!oracles[oracleId].isActive) {
            revert OracleNotRegistered(oracleId);
        }

        oracles[oracleId].isActive = false;
        emit OracleRemoved(oracleId);
    }

    /**
     * @notice Authorize or revoke a NAV provider
     * @param provider The provider address
     * @param authorized Whether to authorize or revoke
     */
    function setProviderAuthorization(address provider, bool authorized) external onlyOwner {
        authorizedProviders[provider] = authorized;
        emit ProviderAuthorized(provider, authorized);
    }

    /**
     * @notice Update the price feed contract address
     * @param _priceFeed New price feed address
     */
    function setPriceFeed(address _priceFeed) external onlyOwner {
        priceFeed = ChainlinkPriceFeed(_priceFeed);
    }

    // ============================================================================
    // Asset Oracle Configuration
    // ============================================================================

    /**
     * @notice Configure oracle for an asset
     * @param assetId The asset identifier
     * @param oracleId The oracle to use
     * @param pricePair The price pair (for price feeds)
     */
    function setAssetOracle(
        bytes32 assetId,
        bytes32 oracleId,
        string calldata pricePair
    ) external onlyOwner {
        if (!oracles[oracleId].isActive) {
            revert OracleNotRegistered(oracleId);
        }

        // Add to assetIds if new
        if (!assetOracles[assetId].isConfigured) {
            assetIds.push(assetId);
        }

        assetOracles[assetId] = AssetOracle({
            oracleId: oracleId,
            pricePair: pricePair,
            isConfigured: true
        });

        emit AssetOracleSet(assetId, oracleId, pricePair);
    }

    // ============================================================================
    // NAV Management
    // ============================================================================

    /**
     * @notice Update NAV for an asset (called by authorized providers)
     * @param assetId The asset identifier
     * @param nav The new NAV value
     * @param currency The currency code (e.g., "USD")
     */
    function updateNAV(
        bytes32 assetId,
        uint256 nav,
        string calldata currency
    ) external {
        if (!authorizedProviders[msg.sender]) {
            revert UnauthorizedProvider(msg.sender);
        }

        if (!assetOracles[assetId].isConfigured) {
            revert AssetNotRegistered(assetId);
        }

        assetNAVs[assetId] = NAVData({
            nav: nav,
            updatedAt: block.timestamp,
            provider: msg.sender,
            currency: currency
        });

        emit NAVUpdated(assetId, nav, block.timestamp, msg.sender);
    }

    // ============================================================================
    // Price & NAV Reading
    // ============================================================================

    /**
     * @notice Get price for an asset using its configured oracle
     * @param assetId The asset identifier
     * @return price The current price
     * @return decimals The price decimals
     * @return updatedAt When the price was last updated
     */
    function getAssetPrice(bytes32 assetId) external view returns (
        int256 price,
        uint8 decimals,
        uint256 updatedAt
    ) {
        AssetOracle memory config = assetOracles[assetId];

        if (!config.isConfigured) {
            revert AssetNotRegistered(assetId);
        }

        OracleInfo memory oracle = oracles[config.oracleId];

        if (!oracle.isActive) {
            revert OracleNotRegistered(config.oracleId);
        }

        if (oracle.oracleType == OracleType.CHAINLINK_PRICE_FEED) {
            ChainlinkPriceFeed.PriceData memory priceData = priceFeed.getLatestPrice(config.pricePair);
            return (priceData.price, priceData.decimals, priceData.updatedAt);
        }

        // For NAV-based oracles, return the stored NAV
        if (oracle.oracleType == OracleType.CUSTOM_NAV) {
            NAVData memory navData = assetNAVs[assetId];
            return (int256(navData.nav), 8, navData.updatedAt); // Assuming 8 decimals for NAV
        }

        revert InvalidOracleType();
    }

    /**
     * @notice Get NAV for an asset
     * @param assetId The asset identifier
     * @return navData The NAV data
     */
    function getAssetNAV(bytes32 assetId) external view returns (NAVData memory navData) {
        return assetNAVs[assetId];
    }

    /**
     * @notice Check if NAV data is fresh
     * @param assetId The asset identifier
     * @param maxAge Maximum acceptable age in seconds
     * @return isFresh Whether the NAV is fresh
     * @return age The age of the NAV in seconds
     */
    function isNAVFresh(bytes32 assetId, uint256 maxAge) external view returns (bool isFresh, uint256 age) {
        NAVData memory navData = assetNAVs[assetId];

        if (navData.updatedAt == 0) {
            return (false, 0);
        }

        age = block.timestamp - navData.updatedAt;
        isFresh = age <= maxAge;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get all registered oracles
     * @return ids Array of oracle IDs
     * @return infos Array of oracle info
     */
    function getAllOracles() external view returns (bytes32[] memory ids, OracleInfo[] memory infos) {
        uint256 activeCount = 0;

        for (uint256 i = 0; i < oracleIds.length; i++) {
            if (oracles[oracleIds[i]].isActive) {
                activeCount++;
            }
        }

        ids = new bytes32[](activeCount);
        infos = new OracleInfo[](activeCount);

        uint256 index = 0;
        for (uint256 i = 0; i < oracleIds.length; i++) {
            if (oracles[oracleIds[i]].isActive) {
                ids[index] = oracleIds[i];
                infos[index] = oracles[oracleIds[i]];
                index++;
            }
        }
    }

    /**
     * @notice Get all registered assets
     * @return Array of asset IDs
     */
    function getAllAssets() external view returns (bytes32[] memory) {
        return assetIds;
    }

    /**
     * @notice Check if an asset has a configured oracle
     * @param assetId The asset identifier
     * @return Whether the asset is configured
     */
    function isAssetConfigured(bytes32 assetId) external view returns (bool) {
        return assetOracles[assetId].isConfigured;
    }
}
