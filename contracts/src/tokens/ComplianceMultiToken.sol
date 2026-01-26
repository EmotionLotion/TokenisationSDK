// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IIdentityRegistry.sol";

/**
 * @title ComplianceMultiToken
 * @dev ERC-1155 Multi-Token with per-tokenId compliance rules for RWA tokenization
 * @notice Based on ERC-1155 with ERC-3643 T-REX compliance patterns
 *
 * Features:
 * - Multiple token types in a single contract (different asset classes)
 * - Per-tokenId compliance rules (real estate, bonds, equity can have different rules)
 * - KYC/AML verification required for transfers
 * - Country-based transfer restrictions per token type
 * - Freeze/unfreeze accounts
 * - Batch mint/transfer/burn operations
 * - URI metadata per token type
 */
contract ComplianceMultiToken {
    // ============================================================================
    // STATE
    // ============================================================================

    // ERC-1155 State
    // tokenId => account => balance
    mapping(uint256 => mapping(address => uint256)) private _balances;
    // account => operator => approved
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // Token metadata
    struct TokenTypeInfo {
        string name;
        string symbol;
        string uri;
        uint256 totalSupply;
        bool exists;
    }

    mapping(uint256 => TokenTypeInfo) public tokenTypes;
    uint256[] public tokenIds;

    // Compliance State
    IIdentityRegistry public identityRegistry;

    struct TokenComplianceRules {
        bool requireKyc;
        bool requireAccreditation;
        uint256 maxInvestorCount;
        uint256 maxHoldingAmount;
        uint256 minTransferAmount;
        uint256 lockupEndTime;
        uint16[] allowedCountries;
        uint16[] blockedCountries;
    }

    // Per-tokenId compliance rules
    mapping(uint256 => TokenComplianceRules) public tokenRules;

    // Frozen accounts (frozen for all tokens)
    mapping(address => bool) private _frozen;

    // Per-tokenId investor tracking
    mapping(uint256 => uint256) public investorCount;
    mapping(uint256 => mapping(address => bool)) private _isInvestor;

    // Roles
    address public owner;
    mapping(address => bool) public agents;
    mapping(address => bool) public compliance;

    // Paused state (global)
    bool public paused;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );

    event TransferBatch(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] values
    );

    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);

    event Frozen(address indexed account, address indexed by);
    event Unfrozen(address indexed account, address indexed by);
    event TokenTypeCreated(uint256 indexed tokenId, string name, string symbol);
    event ComplianceRulesUpdated(uint256 indexed tokenId, address indexed by);
    event IdentityRegistrySet(address indexed registry);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event AgentAdded(address indexed agent);
    event AgentRemoved(address indexed agent);
    event ForceTransfer(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId,
        uint256 amount,
        string reason
    );

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "ComplianceMultiToken: not owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == owner || agents[msg.sender], "ComplianceMultiToken: not agent");
        _;
    }

    modifier onlyCompliance() {
        require(msg.sender == owner || compliance[msg.sender], "ComplianceMultiToken: not compliance officer");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "ComplianceMultiToken: paused");
        _;
    }

    modifier notFrozen(address account) {
        require(!_frozen[account], "ComplianceMultiToken: account frozen");
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        require(tokenTypes[tokenId].exists, "ComplianceMultiToken: token type does not exist");
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(address _identityRegistry) {
        owner = msg.sender;
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    // ============================================================================
    // TOKEN TYPE MANAGEMENT
    // ============================================================================

    /**
     * @notice Create a new token type
     * @param tokenId Unique identifier for the token type
     * @param name Human-readable name
     * @param symbol Token symbol
     * @param _uri Metadata URI
     */
    function createTokenType(
        uint256 tokenId,
        string memory name,
        string memory symbol,
        string memory _uri
    ) external onlyOwner {
        require(!tokenTypes[tokenId].exists, "ComplianceMultiToken: token type already exists");

        tokenTypes[tokenId] = TokenTypeInfo({
            name: name,
            symbol: symbol,
            uri: _uri,
            totalSupply: 0,
            exists: true
        });

        tokenIds.push(tokenId);

        // Default compliance rules
        tokenRules[tokenId].requireKyc = true;
        tokenRules[tokenId].requireAccreditation = false;
        tokenRules[tokenId].maxInvestorCount = 0;
        tokenRules[tokenId].maxHoldingAmount = 0;
        tokenRules[tokenId].minTransferAmount = 0;
        tokenRules[tokenId].lockupEndTime = 0;

        emit TokenTypeCreated(tokenId, name, symbol);
        emit URI(_uri, tokenId);
    }

    /**
     * @notice Update URI for a token type
     */
    function setURI(uint256 tokenId, string memory newUri) external onlyOwner tokenExists(tokenId) {
        tokenTypes[tokenId].uri = newUri;
        emit URI(newUri, tokenId);
    }

    /**
     * @notice Get URI for a token type
     */
    function uri(uint256 tokenId) public view returns (string memory) {
        return tokenTypes[tokenId].uri;
    }

    /**
     * @notice Get all token IDs
     */
    function getTokenIds() external view returns (uint256[] memory) {
        return tokenIds;
    }

    // ============================================================================
    // ERC-1155 FUNCTIONS
    // ============================================================================

    function balanceOf(address account, uint256 id) public view returns (uint256) {
        require(account != address(0), "ComplianceMultiToken: balance query for zero address");
        return _balances[id][account];
    }

    function balanceOfBatch(address[] memory accounts, uint256[] memory ids)
        public
        view
        returns (uint256[] memory)
    {
        require(accounts.length == ids.length, "ComplianceMultiToken: accounts and ids length mismatch");

        uint256[] memory batchBalances = new uint256[](accounts.length);

        for (uint256 i = 0; i < accounts.length; ++i) {
            batchBalances[i] = balanceOf(accounts[i], ids[i]);
        }

        return batchBalances;
    }

    function setApprovalForAll(address operator, bool approved) public {
        require(msg.sender != operator, "ComplianceMultiToken: setting approval for self");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address account, address operator) public view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory /* data */
    ) public whenNotPaused {
        require(
            from == msg.sender || isApprovedForAll(from, msg.sender),
            "ComplianceMultiToken: caller is not owner nor approved"
        );
        _safeTransferFrom(from, to, id, amount);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory /* data */
    ) public whenNotPaused {
        require(
            from == msg.sender || isApprovedForAll(from, msg.sender),
            "ComplianceMultiToken: caller is not owner nor approved"
        );
        _safeBatchTransferFrom(from, to, ids, amounts);
    }

    // ============================================================================
    // INTERNAL TRANSFER FUNCTIONS
    // ============================================================================

    function _safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount
    ) internal notFrozen(from) notFrozen(to) tokenExists(id) {
        require(to != address(0), "ComplianceMultiToken: transfer to zero address");
        require(_balances[id][from] >= amount, "ComplianceMultiToken: insufficient balance");

        // Compliance check
        require(_isCompliantTransfer(from, to, id, amount), "ComplianceMultiToken: transfer not compliant");

        unchecked {
            _balances[id][from] -= amount;
            _balances[id][to] += amount;
        }

        _updateInvestorStatus(id, from, to);

        emit TransferSingle(msg.sender, from, to, id, amount);
    }

    function _safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts
    ) internal notFrozen(from) notFrozen(to) {
        require(ids.length == amounts.length, "ComplianceMultiToken: ids and amounts length mismatch");
        require(to != address(0), "ComplianceMultiToken: transfer to zero address");

        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            uint256 amount = amounts[i];

            require(tokenTypes[id].exists, "ComplianceMultiToken: token type does not exist");
            require(_balances[id][from] >= amount, "ComplianceMultiToken: insufficient balance");
            require(_isCompliantTransfer(from, to, id, amount), "ComplianceMultiToken: transfer not compliant");

            unchecked {
                _balances[id][from] -= amount;
                _balances[id][to] += amount;
            }

            _updateInvestorStatus(id, from, to);
        }

        emit TransferBatch(msg.sender, from, to, ids, amounts);
    }

    function _isCompliantTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount
    ) internal view returns (bool) {
        TokenComplianceRules storage rules = tokenRules[tokenId];

        // Check lockup period
        if (rules.lockupEndTime > 0 && block.timestamp < rules.lockupEndTime) {
            return false;
        }

        // Check minimum transfer amount
        if (rules.minTransferAmount > 0 && amount < rules.minTransferAmount) {
            return false;
        }

        // Check maximum holding
        if (rules.maxHoldingAmount > 0 && _balances[tokenId][to] + amount > rules.maxHoldingAmount) {
            return false;
        }

        // Check investor count for new investors
        if (
            rules.maxInvestorCount > 0 &&
            !_isInvestor[tokenId][to] &&
            _balances[tokenId][to] == 0 &&
            investorCount[tokenId] >= rules.maxInvestorCount
        ) {
            return false;
        }

        // KYC checks
        if (rules.requireKyc) {
            if (!identityRegistry.hasIdentity(from) || !identityRegistry.hasIdentity(to)) {
                return false;
            }

            uint256[] memory requiredClaims = new uint256[](1);
            requiredClaims[0] = ClaimTopics.KYC;

            if (!identityRegistry.isVerified(from, requiredClaims) || !identityRegistry.isVerified(to, requiredClaims)) {
                return false;
            }
        }

        // Accreditation checks
        if (rules.requireAccreditation) {
            uint256[] memory requiredClaims = new uint256[](1);
            requiredClaims[0] = ClaimTopics.ACCREDITATION;

            if (!identityRegistry.isVerified(from, requiredClaims) || !identityRegistry.isVerified(to, requiredClaims)) {
                return false;
            }
        }

        // Country checks
        uint16 toCountry = identityRegistry.getCountry(to);

        // Check allowed countries
        if (rules.allowedCountries.length > 0) {
            bool allowed = false;
            for (uint256 i = 0; i < rules.allowedCountries.length; i++) {
                if (rules.allowedCountries[i] == toCountry) {
                    allowed = true;
                    break;
                }
            }
            if (!allowed) {
                return false;
            }
        }

        // Check blocked countries
        for (uint256 i = 0; i < rules.blockedCountries.length; i++) {
            if (rules.blockedCountries[i] == toCountry) {
                return false;
            }
        }

        return true;
    }

    function _updateInvestorStatus(uint256 tokenId, address from, address to) internal {
        // Remove investor if balance becomes 0
        if (_balances[tokenId][from] == 0 && _isInvestor[tokenId][from]) {
            _isInvestor[tokenId][from] = false;
            investorCount[tokenId]--;
        }

        // Add investor if new holder
        if (_balances[tokenId][to] > 0 && !_isInvestor[tokenId][to]) {
            _isInvestor[tokenId][to] = true;
            investorCount[tokenId]++;
        }
    }

    // ============================================================================
    // MINTING & BURNING
    // ============================================================================

    /**
     * @notice Mint tokens to an address
     */
    function mint(
        address to,
        uint256 tokenId,
        uint256 amount
    ) external onlyAgent tokenExists(tokenId) {
        require(to != address(0), "ComplianceMultiToken: mint to zero address");
        require(!_frozen[to], "ComplianceMultiToken: recipient frozen");

        TokenComplianceRules storage rules = tokenRules[tokenId];

        // Compliance checks for minting
        if (rules.requireKyc) {
            uint256[] memory requiredClaims = new uint256[](1);
            requiredClaims[0] = ClaimTopics.KYC;
            require(identityRegistry.isVerified(to, requiredClaims), "ComplianceMultiToken: KYC required");
        }

        _balances[tokenId][to] += amount;
        tokenTypes[tokenId].totalSupply += amount;

        // Track investor
        if (!_isInvestor[tokenId][to]) {
            _isInvestor[tokenId][to] = true;
            investorCount[tokenId]++;
        }

        emit TransferSingle(msg.sender, address(0), to, tokenId, amount);
    }

    /**
     * @notice Batch mint tokens
     */
    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts
    ) external onlyAgent {
        require(to != address(0), "ComplianceMultiToken: mint to zero address");
        require(!_frozen[to], "ComplianceMultiToken: recipient frozen");
        require(ids.length == amounts.length, "ComplianceMultiToken: ids and amounts length mismatch");

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 tokenId = ids[i];
            uint256 amount = amounts[i];

            require(tokenTypes[tokenId].exists, "ComplianceMultiToken: token type does not exist");

            TokenComplianceRules storage rules = tokenRules[tokenId];

            if (rules.requireKyc) {
                uint256[] memory requiredClaims = new uint256[](1);
                requiredClaims[0] = ClaimTopics.KYC;
                require(identityRegistry.isVerified(to, requiredClaims), "ComplianceMultiToken: KYC required");
            }

            _balances[tokenId][to] += amount;
            tokenTypes[tokenId].totalSupply += amount;

            if (!_isInvestor[tokenId][to]) {
                _isInvestor[tokenId][to] = true;
                investorCount[tokenId]++;
            }
        }

        emit TransferBatch(msg.sender, address(0), to, ids, amounts);
    }

    /**
     * @notice Burn tokens
     */
    function burn(uint256 tokenId, uint256 amount) external tokenExists(tokenId) {
        require(_balances[tokenId][msg.sender] >= amount, "ComplianceMultiToken: burn exceeds balance");

        _balances[tokenId][msg.sender] -= amount;
        tokenTypes[tokenId].totalSupply -= amount;

        if (_balances[tokenId][msg.sender] == 0 && _isInvestor[tokenId][msg.sender]) {
            _isInvestor[tokenId][msg.sender] = false;
            investorCount[tokenId]--;
        }

        emit TransferSingle(msg.sender, msg.sender, address(0), tokenId, amount);
    }

    /**
     * @notice Batch burn tokens
     */
    function burnBatch(uint256[] memory ids, uint256[] memory amounts) external {
        require(ids.length == amounts.length, "ComplianceMultiToken: ids and amounts length mismatch");

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 tokenId = ids[i];
            uint256 amount = amounts[i];

            require(tokenTypes[tokenId].exists, "ComplianceMultiToken: token type does not exist");
            require(_balances[tokenId][msg.sender] >= amount, "ComplianceMultiToken: burn exceeds balance");

            _balances[tokenId][msg.sender] -= amount;
            tokenTypes[tokenId].totalSupply -= amount;

            if (_balances[tokenId][msg.sender] == 0 && _isInvestor[tokenId][msg.sender]) {
                _isInvestor[tokenId][msg.sender] = false;
                investorCount[tokenId]--;
            }
        }

        emit TransferBatch(msg.sender, msg.sender, address(0), ids, amounts);
    }

    // ============================================================================
    // FREEZE/UNFREEZE
    // ============================================================================

    function freeze(address account) external onlyCompliance {
        require(!_frozen[account], "ComplianceMultiToken: already frozen");
        _frozen[account] = true;
        emit Frozen(account, msg.sender);
    }

    function unfreeze(address account) external onlyCompliance {
        require(_frozen[account], "ComplianceMultiToken: not frozen");
        _frozen[account] = false;
        emit Unfrozen(account, msg.sender);
    }

    function isFrozen(address account) external view returns (bool) {
        return _frozen[account];
    }

    // ============================================================================
    // FORCE TRANSFER
    // ============================================================================

    function forceTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        string calldata reason
    ) external onlyAgent tokenExists(tokenId) returns (bool) {
        require(bytes(reason).length > 0, "ComplianceMultiToken: reason required");
        require(_balances[tokenId][from] >= amount, "ComplianceMultiToken: insufficient balance");

        unchecked {
            _balances[tokenId][from] -= amount;
            _balances[tokenId][to] += amount;
        }

        _updateInvestorStatus(tokenId, from, to);

        emit ForceTransfer(from, to, tokenId, amount, reason);
        emit TransferSingle(msg.sender, from, to, tokenId, amount);

        return true;
    }

    // ============================================================================
    // COMPLIANCE RULES
    // ============================================================================

    function setTokenComplianceRules(
        uint256 tokenId,
        bool _requireKyc,
        bool _requireAccreditation,
        uint256 _maxInvestorCount,
        uint256 _maxHoldingAmount,
        uint256 _minTransferAmount,
        uint256 _lockupEndTime
    ) external onlyCompliance tokenExists(tokenId) {
        TokenComplianceRules storage rules = tokenRules[tokenId];
        rules.requireKyc = _requireKyc;
        rules.requireAccreditation = _requireAccreditation;
        rules.maxInvestorCount = _maxInvestorCount;
        rules.maxHoldingAmount = _maxHoldingAmount;
        rules.minTransferAmount = _minTransferAmount;
        rules.lockupEndTime = _lockupEndTime;

        emit ComplianceRulesUpdated(tokenId, msg.sender);
    }

    function setAllowedCountries(uint256 tokenId, uint16[] calldata countries)
        external
        onlyCompliance
        tokenExists(tokenId)
    {
        tokenRules[tokenId].allowedCountries = countries;
        emit ComplianceRulesUpdated(tokenId, msg.sender);
    }

    function setBlockedCountries(uint256 tokenId, uint16[] calldata countries)
        external
        onlyCompliance
        tokenExists(tokenId)
    {
        tokenRules[tokenId].blockedCountries = countries;
        emit ComplianceRulesUpdated(tokenId, msg.sender);
    }

    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        identityRegistry = IIdentityRegistry(_identityRegistry);
        emit IdentityRegistrySet(_identityRegistry);
    }

    // ============================================================================
    // ADMIN
    // ============================================================================

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function addAgent(address agent) external onlyOwner {
        agents[agent] = true;
        emit AgentAdded(agent);
    }

    function removeAgent(address agent) external onlyOwner {
        agents[agent] = false;
        emit AgentRemoved(agent);
    }

    function addComplianceOfficer(address officer) external onlyOwner {
        compliance[officer] = true;
    }

    function removeComplianceOfficer(address officer) external onlyOwner {
        compliance[officer] = false;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ComplianceMultiToken: invalid owner");
        owner = newOwner;
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    function canTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount
    ) external view returns (bool, string memory) {
        if (!tokenTypes[tokenId].exists) return (false, "Token type does not exist");
        if (paused) return (false, "Token is paused");
        if (_frozen[from]) return (false, "Sender is frozen");
        if (_frozen[to]) return (false, "Recipient is frozen");
        if (_balances[tokenId][from] < amount) return (false, "Insufficient balance");
        if (!_isCompliantTransfer(from, to, tokenId, amount)) return (false, "Transfer not compliant");
        return (true, "");
    }

    function isInvestor(uint256 tokenId, address account) external view returns (bool) {
        return _isInvestor[tokenId][account];
    }

    function totalSupply(uint256 tokenId) external view returns (uint256) {
        return tokenTypes[tokenId].totalSupply;
    }

    /**
     * @dev ERC-165 interface support
     */
    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0xd9b67a26 || // ERC-1155
            interfaceId == 0x0e89341c;   // ERC-1155 Metadata URI
    }
}
