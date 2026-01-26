// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AccessPassNFT
 * @dev ERC721-based access pass for events, memberships, and access control
 * @notice Designed for FlyPlus Pass and similar use cases
 *
 * Features:
 * - Time-bound validity
 * - Multiple pass tiers (Economy, Business, First Class, etc.)
 * - Usage tracking (entries, benefits used)
 * - Transferable with restrictions
 * - Metadata URI for rich pass information
 */
contract AccessPassNFT {
    // ============================================================================
    // STATE
    // ============================================================================

    // ERC721 State
    string public name;
    string public symbol;
    string public baseURI;

    uint256 private _nextTokenId;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => string) private _tokenURIs;

    // Access Pass State
    enum PassTier {
        BASIC,
        SILVER,
        GOLD,
        PLATINUM,
        VIP
    }

    struct PassData {
        PassTier tier;
        uint256 validFrom;
        uint256 validUntil;
        uint256 usageCount;
        uint256 maxUsage; // 0 = unlimited
        string eventId;
        bytes32 accessZones; // Bitmap for zone access
        bool revoked;
    }

    mapping(uint256 => PassData) private _passData;

    // Zone definitions (bitmap positions)
    uint8 constant ZONE_MAIN = 0;
    uint8 constant ZONE_VIP = 1;
    uint8 constant ZONE_LOUNGE = 2;
    uint8 constant ZONE_BACKSTAGE = 3;
    uint8 constant ZONE_PRIORITY = 4;

    // Admin
    address public owner;
    mapping(address => bool) public minters;
    mapping(address => bool) public operators;
    bool public transfersEnabled;
    bool public paused;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event PassMinted(uint256 indexed tokenId, address indexed to, PassTier tier, string eventId);
    event PassUsed(uint256 indexed tokenId, address indexed user, uint256 usageCount);
    event PassRevoked(uint256 indexed tokenId, string reason);
    event PassUpgraded(uint256 indexed tokenId, PassTier oldTier, PassTier newTier);
    event PassExtended(uint256 indexed tokenId, uint256 newValidUntil);
    event ZoneAccessUpdated(uint256 indexed tokenId, bytes32 accessZones);

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "AccessPassNFT: not owner");
        _;
    }

    modifier onlyMinter() {
        require(msg.sender == owner || minters[msg.sender], "AccessPassNFT: not minter");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == owner || operators[msg.sender], "AccessPassNFT: not operator");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "AccessPassNFT: paused");
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        require(_owners[tokenId] != address(0), "AccessPassNFT: nonexistent token");
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
        transfersEnabled = true;
        _nextTokenId = 1;
    }

    // ============================================================================
    // ERC721 FUNCTIONS
    // ============================================================================

    function balanceOf(address _owner) public view returns (uint256) {
        require(_owner != address(0), "AccessPassNFT: zero address");
        return _balances[_owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address _owner = _owners[tokenId];
        require(_owner != address(0), "AccessPassNFT: nonexistent token");
        return _owner;
    }

    function tokenURI(uint256 tokenId) public view tokenExists(tokenId) returns (string memory) {
        string memory _tokenURI = _tokenURIs[tokenId];
        if (bytes(_tokenURI).length > 0) {
            return _tokenURI;
        }
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    function approve(address to, uint256 tokenId) public {
        address _owner = ownerOf(tokenId);
        require(to != _owner, "AccessPassNFT: approve to owner");
        require(msg.sender == _owner || isApprovedForAll(_owner, msg.sender), "AccessPassNFT: not authorized");

        _tokenApprovals[tokenId] = to;
        emit Approval(_owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view tokenExists(tokenId) returns (address) {
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) public {
        require(msg.sender != operator, "AccessPassNFT: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address _owner, address operator) public view returns (bool) {
        return _operatorApprovals[_owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public whenNotPaused {
        require(transfersEnabled, "AccessPassNFT: transfers disabled");
        require(_isApprovedOrOwner(msg.sender, tokenId), "AccessPassNFT: not authorized");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) public {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "AccessPassNFT: unsafe recipient");
    }

    // ============================================================================
    // MINTING
    // ============================================================================

    function mint(address to, PassTier tier, uint256 validFrom, uint256 validUntil, string calldata eventId)
        external
        onlyMinter
        returns (uint256)
    {
        return _mintPass(to, tier, validFrom, validUntil, 0, eventId, bytes32(uint256(1))); // ZONE_MAIN access
    }

    function mintWithDetails(
        address to,
        PassTier tier,
        uint256 validFrom,
        uint256 validUntil,
        uint256 maxUsage,
        string calldata eventId,
        bytes32 accessZones
    ) external onlyMinter returns (uint256) {
        return _mintPass(to, tier, validFrom, validUntil, maxUsage, eventId, accessZones);
    }

    function _mintPass(
        address to,
        PassTier tier,
        uint256 validFrom,
        uint256 validUntil,
        uint256 maxUsage,
        string calldata eventId,
        bytes32 accessZones
    ) internal returns (uint256) {
        require(to != address(0), "AccessPassNFT: mint to zero");
        require(validUntil > validFrom, "AccessPassNFT: invalid validity period");

        uint256 tokenId = _nextTokenId++;

        _balances[to]++;
        _owners[tokenId] = to;

        _passData[tokenId] = PassData({
            tier: tier,
            validFrom: validFrom,
            validUntil: validUntil,
            usageCount: 0,
            maxUsage: maxUsage,
            eventId: eventId,
            accessZones: accessZones,
            revoked: false
        });

        emit Transfer(address(0), to, tokenId);
        emit PassMinted(tokenId, to, tier, eventId);

        return tokenId;
    }

    function batchMint(
        address[] calldata recipients,
        PassTier tier,
        uint256 validFrom,
        uint256 validUntil,
        string calldata eventId
    ) external onlyMinter returns (uint256[] memory) {
        uint256[] memory tokenIds = new uint256[](recipients.length);

        for (uint256 i = 0; i < recipients.length; i++) {
            tokenIds[i] = _mintPass(recipients[i], tier, validFrom, validUntil, 0, eventId, bytes32(uint256(1)));
        }

        return tokenIds;
    }

    // ============================================================================
    // PASS OPERATIONS
    // ============================================================================

    function usePass(uint256 tokenId) external tokenExists(tokenId) onlyOperator {
        PassData storage pass = _passData[tokenId];

        require(!pass.revoked, "AccessPassNFT: pass revoked");
        require(block.timestamp >= pass.validFrom, "AccessPassNFT: pass not yet valid");
        require(block.timestamp <= pass.validUntil, "AccessPassNFT: pass expired");
        require(pass.maxUsage == 0 || pass.usageCount < pass.maxUsage, "AccessPassNFT: max usage reached");

        pass.usageCount++;

        emit PassUsed(tokenId, _owners[tokenId], pass.usageCount);
    }

    function revokePass(uint256 tokenId, string calldata reason) external tokenExists(tokenId) onlyOperator {
        _passData[tokenId].revoked = true;
        emit PassRevoked(tokenId, reason);
    }

    function upgradePass(uint256 tokenId, PassTier newTier) external tokenExists(tokenId) onlyOperator {
        PassData storage pass = _passData[tokenId];
        require(uint8(newTier) > uint8(pass.tier), "AccessPassNFT: must upgrade to higher tier");

        PassTier oldTier = pass.tier;
        pass.tier = newTier;

        emit PassUpgraded(tokenId, oldTier, newTier);
    }

    function extendValidity(uint256 tokenId, uint256 newValidUntil) external tokenExists(tokenId) onlyOperator {
        require(newValidUntil > _passData[tokenId].validUntil, "AccessPassNFT: must extend validity");

        _passData[tokenId].validUntil = newValidUntil;

        emit PassExtended(tokenId, newValidUntil);
    }

    function setZoneAccess(uint256 tokenId, bytes32 accessZones) external tokenExists(tokenId) onlyOperator {
        _passData[tokenId].accessZones = accessZones;
        emit ZoneAccessUpdated(tokenId, accessZones);
    }

    function addZoneAccess(uint256 tokenId, uint8 zone) external tokenExists(tokenId) onlyOperator {
        bytes32 current = _passData[tokenId].accessZones;
        bytes32 newZones = current | bytes32(uint256(1) << zone);
        _passData[tokenId].accessZones = newZones;
        emit ZoneAccessUpdated(tokenId, newZones);
    }

    // ============================================================================
    // QUERY FUNCTIONS
    // ============================================================================

    function getPassData(uint256 tokenId) external view tokenExists(tokenId) returns (PassData memory) {
        return _passData[tokenId];
    }

    function isPassValid(uint256 tokenId) external view returns (bool) {
        if (_owners[tokenId] == address(0)) return false;

        PassData storage pass = _passData[tokenId];
        return !pass.revoked && block.timestamp >= pass.validFrom && block.timestamp <= pass.validUntil
            && (pass.maxUsage == 0 || pass.usageCount < pass.maxUsage);
    }

    function hasZoneAccess(uint256 tokenId, uint8 zone) external view tokenExists(tokenId) returns (bool) {
        return uint256(_passData[tokenId].accessZones) & (1 << zone) != 0;
    }

    function getRemainingUsage(uint256 tokenId) external view tokenExists(tokenId) returns (uint256) {
        PassData storage pass = _passData[tokenId];
        if (pass.maxUsage == 0) return type(uint256).max;
        if (pass.usageCount >= pass.maxUsage) return 0;
        return pass.maxUsage - pass.usageCount;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
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

    function setTransfersEnabled(bool enabled) external onlyOwner {
        transfersEnabled = enabled;
    }

    function pause() external onlyOwner {
        paused = true;
    }

    function unpause() external onlyOwner {
        paused = false;
    }

    function addMinter(address minter) external onlyOwner {
        minters[minter] = true;
    }

    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
    }

    function addOperator(address operator) external onlyOwner {
        operators[operator] = true;
    }

    function removeOperator(address operator) external onlyOwner {
        operators[operator] = false;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AccessPassNFT: invalid owner");
        owner = newOwner;
    }

    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "AccessPassNFT: not owner");
        require(to != address(0), "AccessPassNFT: transfer to zero");

        delete _tokenApprovals[tokenId];

        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address _owner = ownerOf(tokenId);
        return (spender == _owner || getApproved(tokenId) == spender || isApprovedForAll(_owner, spender));
    }

    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory data)
        internal
        returns (bool)
    {
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
                return retval == IERC721Receiver.onERC721Received.selector;
            } catch {
                return false;
            }
        }
        return true;
    }

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

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}
