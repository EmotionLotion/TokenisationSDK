// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ChainlinkPriceFeed
 * @notice Reads price data from Chainlink Data Feeds with staleness checks and fallback support
 * @dev Implements circuit breaker pattern for oracle failures
 */
contract ChainlinkPriceFeed is Ownable {
    // ============================================================================
    // Errors
    // ============================================================================

    error StalePrice(uint256 updatedAt, uint256 heartbeat);
    error InvalidPrice(int256 price);
    error SequencerDown();
    error GracePeriodNotOver(uint256 timeSinceUp, uint256 gracePeriod);
    error FeedNotConfigured(string pair);
    error HeartbeatTooLong(uint256 heartbeat, uint256 maxHeartbeat);

    // ============================================================================
    // Events
    // ============================================================================

    event FeedConfigured(string indexed pair, address feed, uint256 heartbeat);
    event FeedRemoved(string indexed pair);
    event SequencerFeedSet(address sequencerFeed);
    event FallbackPriceSet(string indexed pair, int256 price);

    // ============================================================================
    // Structs
    // ============================================================================

    struct FeedConfig {
        AggregatorV3Interface feed;
        uint256 heartbeatSeconds;
        uint8 decimals;
        bool isActive;
    }

    struct PriceData {
        int256 price;
        uint8 decimals;
        uint256 updatedAt;
        uint80 roundId;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Mapping from pair string (e.g., "ETH/USD") to feed configuration
    mapping(string => FeedConfig) public feeds;

    /// @notice List of all configured pair names
    string[] public pairNames;

    /// @notice Fallback prices for emergency situations
    mapping(string => int256) public fallbackPrices;

    /// @notice L2 sequencer uptime feed (for Arbitrum, Optimism, etc.)
    AggregatorV3Interface public sequencerUptimeFeed;

    /// @notice Grace period after sequencer comes back up
    uint256 public constant GRACE_PERIOD_TIME = 3600; // 1 hour

    /// @notice Maximum allowed heartbeat (24 hours)
    uint256 public constant MAX_HEARTBEAT = 86400;

    /// @notice Whether to use fallback on stale data
    bool public useFallbackOnStale = true;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // Admin Functions
    // ============================================================================

    /**
     * @notice Configure a new price feed
     * @param pair The pair name (e.g., "ETH/USD")
     * @param feedAddress The Chainlink aggregator address
     * @param heartbeatSeconds The expected update frequency
     */
    function configureFeed(
        string calldata pair,
        address feedAddress,
        uint256 heartbeatSeconds
    ) external onlyOwner {
        if (heartbeatSeconds > MAX_HEARTBEAT) {
            revert HeartbeatTooLong(heartbeatSeconds, MAX_HEARTBEAT);
        }

        AggregatorV3Interface feed = AggregatorV3Interface(feedAddress);
        uint8 decimals = feed.decimals();

        // Check if this is a new pair
        if (!feeds[pair].isActive) {
            pairNames.push(pair);
        }

        feeds[pair] = FeedConfig({
            feed: feed,
            heartbeatSeconds: heartbeatSeconds,
            decimals: decimals,
            isActive: true
        });

        emit FeedConfigured(pair, feedAddress, heartbeatSeconds);
    }

    /**
     * @notice Remove a price feed
     * @param pair The pair name to remove
     */
    function removeFeed(string calldata pair) external onlyOwner {
        if (!feeds[pair].isActive) {
            revert FeedNotConfigured(pair);
        }

        feeds[pair].isActive = false;
        emit FeedRemoved(pair);
    }

    /**
     * @notice Set the L2 sequencer uptime feed
     * @param _sequencerFeed The sequencer uptime feed address
     */
    function setSequencerUptimeFeed(address _sequencerFeed) external onlyOwner {
        sequencerUptimeFeed = AggregatorV3Interface(_sequencerFeed);
        emit SequencerFeedSet(_sequencerFeed);
    }

    /**
     * @notice Set a fallback price for emergency situations
     * @param pair The pair name
     * @param price The fallback price (in feed decimals)
     */
    function setFallbackPrice(string calldata pair, int256 price) external onlyOwner {
        fallbackPrices[pair] = price;
        emit FallbackPriceSet(pair, price);
    }

    /**
     * @notice Toggle fallback usage on stale data
     */
    function setUseFallbackOnStale(bool _useFallback) external onlyOwner {
        useFallbackOnStale = _useFallback;
    }

    // ============================================================================
    // Price Reading Functions
    // ============================================================================

    /**
     * @notice Get the latest price for a pair
     * @param pair The pair name (e.g., "ETH/USD")
     * @return priceData The price data including price, decimals, and timestamp
     */
    function getLatestPrice(string calldata pair) external view returns (PriceData memory priceData) {
        FeedConfig memory config = feeds[pair];

        if (!config.isActive) {
            revert FeedNotConfigured(pair);
        }

        // Check L2 sequencer status if configured
        if (address(sequencerUptimeFeed) != address(0)) {
            _checkSequencerStatus();
        }

        (
            uint80 roundId,
            int256 price,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = config.feed.latestRoundData();

        // Validate round completeness
        require(answeredInRound >= roundId, "ChainlinkPriceFeed: round not complete");

        // Validate price
        if (price <= 0) {
            // Try fallback
            if (fallbackPrices[pair] > 0) {
                return PriceData({
                    price: fallbackPrices[pair],
                    decimals: config.decimals,
                    updatedAt: block.timestamp,
                    roundId: 0
                });
            }
            revert InvalidPrice(price);
        }

        // Check for stale data
        uint256 age = block.timestamp - updatedAt;
        if (age > config.heartbeatSeconds) {
            if (useFallbackOnStale && fallbackPrices[pair] > 0) {
                return PriceData({
                    price: fallbackPrices[pair],
                    decimals: config.decimals,
                    updatedAt: block.timestamp,
                    roundId: 0
                });
            }
            revert StalePrice(updatedAt, config.heartbeatSeconds);
        }

        return PriceData({
            price: price,
            decimals: config.decimals,
            updatedAt: updatedAt,
            roundId: roundId
        });
    }

    /**
     * @notice Get price scaled to a specific number of decimals
     * @param pair The pair name
     * @param targetDecimals The desired decimal precision
     * @return scaledPrice The price scaled to target decimals
     */
    function getScaledPrice(
        string calldata pair,
        uint8 targetDecimals
    ) external view returns (int256 scaledPrice) {
        PriceData memory data = this.getLatestPrice(pair);

        if (targetDecimals >= data.decimals) {
            scaledPrice = data.price * int256(10 ** (targetDecimals - data.decimals));
        } else {
            scaledPrice = data.price / int256(10 ** (data.decimals - targetDecimals));
        }
    }

    /**
     * @notice Check if a price feed is healthy (not stale)
     * @param pair The pair name
     * @return isHealthy Whether the feed is healthy
     * @return age The age of the latest price in seconds
     */
    function isFeedHealthy(string calldata pair) external view returns (bool isHealthy, uint256 age) {
        FeedConfig memory config = feeds[pair];

        if (!config.isActive) {
            return (false, 0);
        }

        (, , , uint256 updatedAt, ) = config.feed.latestRoundData();
        age = block.timestamp - updatedAt;
        isHealthy = age <= config.heartbeatSeconds;
    }

    /**
     * @notice Get all configured pairs
     * @return pairs Array of pair names
     */
    function getAllPairs() external view returns (string[] memory pairs) {
        uint256 activeCount = 0;

        // Count active feeds
        for (uint256 i = 0; i < pairNames.length; i++) {
            if (feeds[pairNames[i]].isActive) {
                activeCount++;
            }
        }

        // Build array of active pairs
        pairs = new string[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < pairNames.length; i++) {
            if (feeds[pairNames[i]].isActive) {
                pairs[index] = pairNames[i];
                index++;
            }
        }
    }

    /**
     * @notice Get feed configuration
     * @param pair The pair name
     * @return config The feed configuration
     */
    function getFeedConfig(string calldata pair) external view returns (FeedConfig memory config) {
        return feeds[pair];
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Check L2 sequencer status
     */
    function _checkSequencerStatus() internal view {
        (
            ,
            int256 answer,
            uint256 startedAt,
            ,

        ) = sequencerUptimeFeed.latestRoundData();

        // Answer == 0: Sequencer is up
        // Answer == 1: Sequencer is down
        if (answer == 1) {
            revert SequencerDown();
        }

        // Make sure the grace period has passed after the sequencer is back up
        uint256 timeSinceUp = block.timestamp - startedAt;
        if (timeSinceUp < GRACE_PERIOD_TIME) {
            revert GracePeriodNotOver(timeSinceUp, GRACE_PERIOD_TIME);
        }
    }
}
