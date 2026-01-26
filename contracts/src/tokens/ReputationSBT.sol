// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReputationSBT
 * @dev Soulbound Token for reputation, credentials, and non-transferable achievements
 * @notice Designed for Driver Reputation and similar use cases
 *
 * Features:
 * - Non-transferable (transfers always revert)
 * - One token per address
 * - Score-based tiers
 * - Historical tracking
 * - Revocable by issuer
 * - Metadata URI for rich reputation data
 */
contract ReputationSBT {
    // ============================================================================
    // STATE
    // ============================================================================

    string public name;
    string public symbol;
    string public baseURI;

    uint256 private _nextTokenId;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _tokenIds; // address => tokenId (one per address)
    mapping(uint256 => string) private _tokenURIs;

    // Reputation State
    enum Tier {
        BRONZE,
        SILVER,
        GOLD,
        PLATINUM,
        DIAMOND
    }

    struct ReputationData {
        uint256 score;
        Tier tier;
        uint256 totalTrips; // For driver reputation
        uint256 positiveRatings;
        uint256 negativeRatings;
        uint256 lastUpdated;
        uint256 createdAt;
        bool active;
        bytes32 metadata; // Extra metadata hash
    }

    mapping(uint256 => ReputationData) private _reputationData;
    mapping(uint256 => uint256[]) private _scoreHistory; // tokenId => historical scores

    // Tier thresholds
    uint256 public bronzeMin = 0;
    uint256 public silverMin = 500;
    uint256 public goldMin = 1500;
    uint256 public platinumMin = 3000;
    uint256 public diamondMin = 5000;

    // Scoring parameters
    uint256 public pointsPerTrip = 10;
    uint256 public pointsPerPositiveRating = 25;
    uint256 public penaltyPerNegativeRating = 50;
    uint256 public maxScore = 10000;

    // Admin
    address public owner;
    mapping(address => bool) public issuers; // Can mint/update reputation
    mapping(address => bool) public raters; // Can add ratings
    bool public paused;

    // Stats
    uint256 public totalHolders;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event ReputationMinted(uint256 indexed tokenId, address indexed to, uint256 initialScore);
    event ScoreUpdated(uint256 indexed tokenId, uint256 oldScore, uint256 newScore, string reason);
    event TierUpdated(uint256 indexed tokenId, Tier oldTier, Tier newTier);
    event TripCompleted(uint256 indexed tokenId, uint256 totalTrips);
    event RatingReceived(uint256 indexed tokenId, bool positive, uint256 newScore);
    event ReputationRevoked(uint256 indexed tokenId, string reason);
    event ReputationReactivated(uint256 indexed tokenId);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error SoulboundTransferNotAllowed();
    error TokenDoesNotExist(uint256 tokenId);
    error AddressAlreadyHasToken(address account);
    error AddressDoesNotHaveToken(address account);
    error NotAuthorized();
    error Paused();
    error TokenRevoked(uint256 tokenId);

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    modifier onlyIssuer() {
        if (msg.sender != owner && !issuers[msg.sender]) revert NotAuthorized();
        _;
    }

    modifier onlyRater() {
        if (msg.sender != owner && !issuers[msg.sender] && !raters[msg.sender]) revert NotAuthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist(tokenId);
        _;
    }

    modifier tokenActive(uint256 tokenId) {
        if (!_reputationData[tokenId].active) revert TokenRevoked(tokenId);
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(string memory _name, string memory _symbol, string memory _baseURI) {
        name = _name;
        symbol = _symbol;
        baseURI = _baseURI;
        owner = msg.sender;
        _nextTokenId = 1;
    }

    // ============================================================================
    // SOULBOUND: TRANSFER ALWAYS REVERTS
    // ============================================================================

    function transferFrom(address, address, uint256) external pure {
        revert SoulboundTransferNotAllowed();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert SoulboundTransferNotAllowed();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) external pure {
        revert SoulboundTransferNotAllowed();
    }

    function approve(address, uint256) external pure {
        revert SoulboundTransferNotAllowed();
    }

    function setApprovalForAll(address, bool) external pure {
        revert SoulboundTransferNotAllowed();
    }

    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    // ============================================================================
    // ERC721 VIEW FUNCTIONS
    // ============================================================================

    function balanceOf(address account) external view returns (uint256) {
        return _tokenIds[account] != 0 ? 1 : 0;
    }

    function ownerOf(uint256 tokenId) external view tokenExists(tokenId) returns (address) {
        return _owners[tokenId];
    }

    function tokenURI(uint256 tokenId) external view tokenExists(tokenId) returns (string memory) {
        string memory _tokenURI = _tokenURIs[tokenId];
        if (bytes(_tokenURI).length > 0) {
            return _tokenURI;
        }
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    function totalSupply() external view returns (uint256) {
        return totalHolders;
    }

    // ============================================================================
    // MINTING
    // ============================================================================

    function mint(address to) external onlyIssuer whenNotPaused returns (uint256) {
        return _mint(to, 0);
    }

    function mintWithScore(address to, uint256 initialScore) external onlyIssuer whenNotPaused returns (uint256) {
        return _mint(to, initialScore);
    }

    function _mint(address to, uint256 initialScore) internal returns (uint256) {
        if (to == address(0)) revert NotAuthorized();
        if (_tokenIds[to] != 0) revert AddressAlreadyHasToken(to);
        if (initialScore > maxScore) initialScore = maxScore;

        uint256 tokenId = _nextTokenId++;

        _owners[tokenId] = to;
        _tokenIds[to] = tokenId;

        Tier tier = _calculateTier(initialScore);

        _reputationData[tokenId] = ReputationData({
            score: initialScore,
            tier: tier,
            totalTrips: 0,
            positiveRatings: 0,
            negativeRatings: 0,
            lastUpdated: block.timestamp,
            createdAt: block.timestamp,
            active: true,
            metadata: bytes32(0)
        });

        _scoreHistory[tokenId].push(initialScore);

        totalHolders++;

        emit Transfer(address(0), to, tokenId);
        emit ReputationMinted(tokenId, to, initialScore);

        return tokenId;
    }

    // ============================================================================
    // SCORE & REPUTATION MANAGEMENT
    // ============================================================================

    function addScore(uint256 tokenId, uint256 points, string calldata reason)
        external
        onlyIssuer
        tokenExists(tokenId)
        tokenActive(tokenId)
    {
        ReputationData storage data = _reputationData[tokenId];
        uint256 oldScore = data.score;
        uint256 newScore = oldScore + points;
        if (newScore > maxScore) newScore = maxScore;

        data.score = newScore;
        data.lastUpdated = block.timestamp;

        _scoreHistory[tokenId].push(newScore);
        _updateTierIfNeeded(tokenId, oldScore, newScore);

        emit ScoreUpdated(tokenId, oldScore, newScore, reason);
    }

    function subtractScore(uint256 tokenId, uint256 points, string calldata reason)
        external
        onlyIssuer
        tokenExists(tokenId)
        tokenActive(tokenId)
    {
        ReputationData storage data = _reputationData[tokenId];
        uint256 oldScore = data.score;
        uint256 newScore = oldScore > points ? oldScore - points : 0;

        data.score = newScore;
        data.lastUpdated = block.timestamp;

        _scoreHistory[tokenId].push(newScore);
        _updateTierIfNeeded(tokenId, oldScore, newScore);

        emit ScoreUpdated(tokenId, oldScore, newScore, reason);
    }

    function setScore(uint256 tokenId, uint256 newScore, string calldata reason)
        external
        onlyIssuer
        tokenExists(tokenId)
        tokenActive(tokenId)
    {
        if (newScore > maxScore) newScore = maxScore;

        ReputationData storage data = _reputationData[tokenId];
        uint256 oldScore = data.score;

        data.score = newScore;
        data.lastUpdated = block.timestamp;

        _scoreHistory[tokenId].push(newScore);
        _updateTierIfNeeded(tokenId, oldScore, newScore);

        emit ScoreUpdated(tokenId, oldScore, newScore, reason);
    }

    function recordTrip(uint256 tokenId) external onlyIssuer tokenExists(tokenId) tokenActive(tokenId) {
        ReputationData storage data = _reputationData[tokenId];
        data.totalTrips++;

        uint256 oldScore = data.score;
        uint256 newScore = oldScore + pointsPerTrip;
        if (newScore > maxScore) newScore = maxScore;

        data.score = newScore;
        data.lastUpdated = block.timestamp;

        _scoreHistory[tokenId].push(newScore);
        _updateTierIfNeeded(tokenId, oldScore, newScore);

        emit TripCompleted(tokenId, data.totalTrips);
        emit ScoreUpdated(tokenId, oldScore, newScore, "Trip completed");
    }

    function addRating(uint256 tokenId, bool positive) external onlyRater tokenExists(tokenId) tokenActive(tokenId) {
        ReputationData storage data = _reputationData[tokenId];
        uint256 oldScore = data.score;
        uint256 newScore;

        if (positive) {
            data.positiveRatings++;
            newScore = oldScore + pointsPerPositiveRating;
            if (newScore > maxScore) newScore = maxScore;
        } else {
            data.negativeRatings++;
            newScore = oldScore > penaltyPerNegativeRating ? oldScore - penaltyPerNegativeRating : 0;
        }

        data.score = newScore;
        data.lastUpdated = block.timestamp;

        _scoreHistory[tokenId].push(newScore);
        _updateTierIfNeeded(tokenId, oldScore, newScore);

        emit RatingReceived(tokenId, positive, newScore);
    }

    function _updateTierIfNeeded(uint256 tokenId, uint256 oldScore, uint256 newScore) internal {
        Tier oldTier = _calculateTier(oldScore);
        Tier newTier = _calculateTier(newScore);

        if (oldTier != newTier) {
            _reputationData[tokenId].tier = newTier;
            emit TierUpdated(tokenId, oldTier, newTier);
        }
    }

    function _calculateTier(uint256 score) internal view returns (Tier) {
        if (score >= diamondMin) return Tier.DIAMOND;
        if (score >= platinumMin) return Tier.PLATINUM;
        if (score >= goldMin) return Tier.GOLD;
        if (score >= silverMin) return Tier.SILVER;
        return Tier.BRONZE;
    }

    // ============================================================================
    // REVOCATION
    // ============================================================================

    function revoke(uint256 tokenId, string calldata reason) external onlyIssuer tokenExists(tokenId) {
        _reputationData[tokenId].active = false;
        emit ReputationRevoked(tokenId, reason);
    }

    function reactivate(uint256 tokenId) external onlyIssuer tokenExists(tokenId) {
        _reputationData[tokenId].active = true;
        emit ReputationReactivated(tokenId);
    }

    // ============================================================================
    // BURNING (Voluntary removal by holder)
    // ============================================================================

    function burn(uint256 tokenId) external tokenExists(tokenId) {
        if (_owners[tokenId] != msg.sender) revert NotAuthorized();

        address holder = _owners[tokenId];

        delete _owners[tokenId];
        delete _tokenIds[holder];
        delete _reputationData[tokenId];

        totalHolders--;

        emit Transfer(holder, address(0), tokenId);
    }

    // ============================================================================
    // QUERY FUNCTIONS
    // ============================================================================

    function hasToken(address account) external view returns (bool) {
        return _tokenIds[account] != 0;
    }

    function tokenOfOwner(address account) external view returns (uint256) {
        uint256 tokenId = _tokenIds[account];
        if (tokenId == 0) revert AddressDoesNotHaveToken(account);
        return tokenId;
    }

    function getReputationData(uint256 tokenId)
        external
        view
        tokenExists(tokenId)
        returns (ReputationData memory)
    {
        return _reputationData[tokenId];
    }

    function getScore(uint256 tokenId) external view tokenExists(tokenId) returns (uint256) {
        return _reputationData[tokenId].score;
    }

    function getTier(uint256 tokenId) external view tokenExists(tokenId) returns (Tier) {
        return _reputationData[tokenId].tier;
    }

    function getTierName(uint256 tokenId) external view tokenExists(tokenId) returns (string memory) {
        Tier tier = _reputationData[tokenId].tier;
        if (tier == Tier.DIAMOND) return "DIAMOND";
        if (tier == Tier.PLATINUM) return "PLATINUM";
        if (tier == Tier.GOLD) return "GOLD";
        if (tier == Tier.SILVER) return "SILVER";
        return "BRONZE";
    }

    function getScoreHistory(uint256 tokenId) external view tokenExists(tokenId) returns (uint256[] memory) {
        return _scoreHistory[tokenId];
    }

    function isActive(uint256 tokenId) external view tokenExists(tokenId) returns (bool) {
        return _reputationData[tokenId].active;
    }

    function getReputationSummary(address account)
        external
        view
        returns (uint256 tokenId, uint256 score, string memory tierName, uint256 totalTrips, bool active)
    {
        tokenId = _tokenIds[account];
        if (tokenId == 0) revert AddressDoesNotHaveToken(account);

        ReputationData storage data = _reputationData[tokenId];
        score = data.score;
        totalTrips = data.totalTrips;
        active = data.active;

        if (data.tier == Tier.DIAMOND) tierName = "DIAMOND";
        else if (data.tier == Tier.PLATINUM) tierName = "PLATINUM";
        else if (data.tier == Tier.GOLD) tierName = "GOLD";
        else if (data.tier == Tier.SILVER) tierName = "SILVER";
        else tierName = "BRONZE";
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    function setBaseURI(string calldata _baseURI) external onlyOwner {
        baseURI = _baseURI;
    }

    function setTokenURI(uint256 tokenId, string calldata _tokenURI) external onlyOwner {
        _tokenURIs[tokenId] = _tokenURI;
    }

    function setTierThresholds(uint256 _silver, uint256 _gold, uint256 _platinum, uint256 _diamond)
        external
        onlyOwner
    {
        silverMin = _silver;
        goldMin = _gold;
        platinumMin = _platinum;
        diamondMin = _diamond;
    }

    function setScoringParams(uint256 _perTrip, uint256 _perPositive, uint256 _perNegative, uint256 _max)
        external
        onlyOwner
    {
        pointsPerTrip = _perTrip;
        pointsPerPositiveRating = _perPositive;
        penaltyPerNegativeRating = _perNegative;
        maxScore = _max;
    }

    function pause() external onlyOwner {
        paused = true;
    }

    function unpause() external onlyOwner {
        paused = false;
    }

    function addIssuer(address issuer) external onlyOwner {
        issuers[issuer] = true;
    }

    function removeIssuer(address issuer) external onlyOwner {
        issuers[issuer] = false;
    }

    function addRater(address rater) external onlyOwner {
        raters[rater] = true;
    }

    function removeRater(address rater) external onlyOwner {
        raters[rater] = false;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }

    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    // ============================================================================
    // ERC165
    // ============================================================================

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC165
            || interfaceId == 0x80ac58cd // ERC721
            || interfaceId == 0x5b5e139f; // ERC721Metadata
    }
}
