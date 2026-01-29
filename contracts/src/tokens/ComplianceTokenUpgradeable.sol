// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "../interfaces/IIdentityRegistry.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

/**
 * @title ComplianceTokenUpgradeable
 * @dev Upgradeable ERC20 token with transfer restrictions for RWA tokenization
 * @notice UUPS upgradeable version of ComplianceToken
 *
 * Features:
 * - UUPS upgradeable proxy pattern
 * - KYC/AML verification required for transfers
 * - Country-based transfer restrictions
 * - Investor count limits
 * - Lockup periods
 * - Freeze/unfreeze accounts
 * - Force transfers (admin only)
 * - Recovery mechanism
 * - Timelock-protected upgrades
 */
contract ComplianceTokenUpgradeable is Initializable, UUPSUpgradeable {
    // ============================================================================
    // STORAGE (using storage gaps for upgradeability)
    // ============================================================================

    // ERC20 State
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // Compliance State
    IIdentityRegistry public identityRegistry;

    struct ComplianceRules {
        bool requireKyc;
        bool requireAccreditation;
        uint256 maxInvestorCount;
        uint256 maxHoldingAmount;
        uint256 minTransferAmount;
        uint256 lockupEndTime;
        uint16[] allowedCountries;
        uint16[] blockedCountries;
    }

    ComplianceRules public rules;

    // Frozen accounts
    mapping(address => bool) private _frozen;

    // Current investor count
    uint256 public investorCount;
    mapping(address => bool) private _isInvestor;

    // Roles
    address public owner;
    mapping(address => bool) public agents; // Transfer agents
    mapping(address => bool) public compliance; // Compliance officers

    // Paused state
    bool public paused;

    // Governance (for upgrades)
    address public timelockController;
    uint256 public upgradeDelay;

    // Pending upgrade
    struct PendingUpgrade {
        address newImplementation;
        uint256 scheduledTime;
        bool executed;
    }
    PendingUpgrade public pendingUpgrade;

    // Storage gap for future upgrades
    uint256[50] private __gap;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Frozen(address indexed account, address indexed by);
    event Unfrozen(address indexed account, address indexed by);
    event ComplianceRulesUpdated(address indexed by);
    event IdentityRegistrySet(address indexed registry);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event AgentAdded(address indexed agent);
    event AgentRemoved(address indexed agent);
    event RecoveryExecuted(address indexed from, address indexed to, uint256 amount);
    event ForceTransfer(address indexed from, address indexed to, uint256 amount, string reason);
    event ComplianceOverride(address indexed agent, address indexed from, address indexed to, uint256 amount, string reason);
    event UpgradeScheduled(address indexed newImplementation, uint256 scheduledTime);
    event UpgradeCancelled(address indexed newImplementation);
    event TimelockControllerSet(address indexed controller);

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "ComplianceToken: not owner");
        _;
    }

    modifier onlyOwnerOrTimelock() {
        require(
            msg.sender == owner || msg.sender == timelockController,
            "ComplianceToken: not owner or timelock"
        );
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == owner || agents[msg.sender], "ComplianceToken: not agent");
        _;
    }

    modifier onlyCompliance() {
        require(msg.sender == owner || compliance[msg.sender], "ComplianceToken: not compliance officer");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "ComplianceToken: paused");
        _;
    }

    modifier notFrozen(address account) {
        require(!_frozen[account], "ComplianceToken: account frozen");
        _;
    }

    // ============================================================================
    // INITIALIZER (replaces constructor)
    // ============================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the upgradeable token
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _identityRegistry Address of the identity registry
     * @param _owner Initial owner address
     * @param _upgradeDelay Minimum delay for upgrades (in seconds)
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _identityRegistry,
        address _owner,
        uint256 _upgradeDelay
    ) public initializer {
        require(_owner != address(0), "ComplianceToken: invalid owner");
        require(_identityRegistry != address(0), "ComplianceToken: invalid registry");
        require(_upgradeDelay >= 1 days, "ComplianceToken: upgrade delay too short");

        name = _name;
        symbol = _symbol;
        owner = _owner;
        identityRegistry = IIdentityRegistry(_identityRegistry);
        upgradeDelay = _upgradeDelay;

        // Default rules
        rules.requireKyc = true;
        rules.requireAccreditation = false;
        rules.maxInvestorCount = 0; // 0 = no limit
        rules.maxHoldingAmount = 0; // 0 = no limit
        rules.minTransferAmount = 0;
        rules.lockupEndTime = 0;
    }

    // ============================================================================
    // UUPS UPGRADE FUNCTIONS
    // ============================================================================

    /**
     * @dev Schedule an upgrade to a new implementation
     * @param newImplementation Address of new implementation
     */
    function scheduleUpgrade(address newImplementation) external onlyOwnerOrTimelock {
        require(newImplementation != address(0), "ComplianceToken: invalid implementation");
        require(newImplementation != address(this), "ComplianceToken: same implementation");
        require(!_isPendingUpgrade(), "ComplianceToken: upgrade already pending");

        pendingUpgrade = PendingUpgrade({
            newImplementation: newImplementation,
            scheduledTime: block.timestamp + upgradeDelay,
            executed: false
        });

        emit UpgradeScheduled(newImplementation, pendingUpgrade.scheduledTime);
    }

    /**
     * @dev Cancel a pending upgrade
     */
    function cancelUpgrade() external onlyOwnerOrTimelock {
        require(_isPendingUpgrade(), "ComplianceToken: no pending upgrade");
        require(!pendingUpgrade.executed, "ComplianceToken: upgrade already executed");

        address cancelledImpl = pendingUpgrade.newImplementation;
        delete pendingUpgrade;

        emit UpgradeCancelled(cancelledImpl);
    }

    /**
     * @dev Internal authorization for UUPS upgrades
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwnerOrTimelock {
        require(_isPendingUpgrade(), "ComplianceToken: upgrade not scheduled");
        require(pendingUpgrade.newImplementation == newImplementation, "ComplianceToken: wrong implementation");
        require(block.timestamp >= pendingUpgrade.scheduledTime, "ComplianceToken: upgrade delay not passed");
        require(!pendingUpgrade.executed, "ComplianceToken: upgrade already executed");

        pendingUpgrade.executed = true;
    }

    /**
     * @dev Check if there is a pending upgrade
     */
    function _isPendingUpgrade() internal view returns (bool) {
        return pendingUpgrade.newImplementation != address(0) && pendingUpgrade.scheduledTime > 0;
    }

    /**
     * @dev Set the timelock controller address
     * @param _timelockController Address of timelock controller
     */
    function setTimelockController(address _timelockController) external onlyOwner {
        timelockController = _timelockController;
        emit TimelockControllerSet(_timelockController);
    }

    /**
     * @dev Get the current implementation address
     */
    function implementation() external view returns (address) {
        return ERC1967Utils.getImplementation();
    }

    // ============================================================================
    // ERC20 FUNCTIONS
    // ============================================================================

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function allowance(address _owner, address spender) public view returns (uint256) {
        return _allowances[_owner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) public whenNotPaused returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public whenNotPaused returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ComplianceToken: insufficient allowance");
            unchecked {
                _approve(from, msg.sender, currentAllowance - amount);
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    // ============================================================================
    // TRANSFER WITH COMPLIANCE
    // ============================================================================

    function _transfer(address from, address to, uint256 amount) internal notFrozen(from) notFrozen(to) {
        require(from != address(0), "ComplianceToken: transfer from zero");
        require(to != address(0), "ComplianceToken: transfer to zero");
        require(_balances[from] >= amount, "ComplianceToken: insufficient balance");

        // Compliance checks (skip for minting from zero address)
        if (from != address(0)) {
            require(_isCompliantTransfer(from, to, amount), "ComplianceToken: transfer not compliant");
        }

        // Update balances
        unchecked {
            _balances[from] -= amount;
            _balances[to] += amount;
        }

        // Update investor tracking
        _updateInvestorStatus(from, to);

        emit Transfer(from, to, amount);
    }

    function _isCompliantTransfer(address from, address to, uint256 amount) internal view returns (bool) {
        // Check lockup period
        if (rules.lockupEndTime > 0 && block.timestamp < rules.lockupEndTime) {
            return false;
        }

        // Check minimum transfer amount
        if (rules.minTransferAmount > 0 && amount < rules.minTransferAmount) {
            return false;
        }

        // Check maximum holding
        if (rules.maxHoldingAmount > 0 && _balances[to] + amount > rules.maxHoldingAmount) {
            return false;
        }

        // Check investor count for new investors
        if (
            rules.maxInvestorCount > 0 && !_isInvestor[to] && _balances[to] == 0
                && investorCount >= rules.maxInvestorCount
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

            if (!identityRegistry.isVerified(from, requiredClaims) || !identityRegistry.isVerified(to, requiredClaims))
            {
                return false;
            }
        }

        // Accreditation checks
        if (rules.requireAccreditation) {
            uint256[] memory requiredClaims = new uint256[](1);
            requiredClaims[0] = ClaimTopics.ACCREDITATION;

            if (!identityRegistry.isVerified(from, requiredClaims) || !identityRegistry.isVerified(to, requiredClaims))
            {
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

    function _updateInvestorStatus(address from, address to) internal {
        // Remove investor if balance becomes 0
        if (_balances[from] == 0 && _isInvestor[from]) {
            _isInvestor[from] = false;
            investorCount--;
        }

        // Add investor if new holder
        if (_balances[to] > 0 && !_isInvestor[to]) {
            _isInvestor[to] = true;
            investorCount++;
        }
    }

    function _approve(address _owner, address spender, uint256 amount) internal {
        require(_owner != address(0), "ComplianceToken: approve from zero");
        require(spender != address(0), "ComplianceToken: approve to zero");

        _allowances[_owner][spender] = amount;
        emit Approval(_owner, spender, amount);
    }

    // ============================================================================
    // MINTING & BURNING
    // ============================================================================

    function mint(address to, uint256 amount) external onlyAgent {
        require(to != address(0), "ComplianceToken: mint to zero");
        require(!_frozen[to], "ComplianceToken: recipient frozen");

        // Compliance checks for minting
        if (rules.requireKyc) {
            uint256[] memory requiredClaims = new uint256[](1);
            requiredClaims[0] = ClaimTopics.KYC;
            require(identityRegistry.isVerified(to, requiredClaims), "ComplianceToken: KYC required");
        }

        totalSupply += amount;
        _balances[to] += amount;

        // Track investor
        if (!_isInvestor[to]) {
            _isInvestor[to] = true;
            investorCount++;
        }

        emit Transfer(address(0), to, amount);
    }

    function burn(uint256 amount) external {
        require(_balances[msg.sender] >= amount, "ComplianceToken: burn exceeds balance");

        _balances[msg.sender] -= amount;
        totalSupply -= amount;

        // Update investor status
        if (_balances[msg.sender] == 0 && _isInvestor[msg.sender]) {
            _isInvestor[msg.sender] = false;
            investorCount--;
        }

        emit Transfer(msg.sender, address(0), amount);
    }

    // ============================================================================
    // FREEZE/UNFREEZE
    // ============================================================================

    function freeze(address account) external onlyCompliance {
        require(!_frozen[account], "ComplianceToken: already frozen");
        _frozen[account] = true;
        emit Frozen(account, msg.sender);
    }

    function unfreeze(address account) external onlyCompliance {
        require(_frozen[account], "ComplianceToken: not frozen");
        _frozen[account] = false;
        emit Unfrozen(account, msg.sender);
    }

    function isFrozen(address account) external view returns (bool) {
        return _frozen[account];
    }

    // ============================================================================
    // FORCE TRANSFER & RECOVERY
    // ============================================================================

    function forceTransfer(address from, address to, uint256 amount, string calldata reason)
        external
        onlyAgent
        returns (bool)
    {
        require(bytes(reason).length > 0, "ComplianceToken: reason required");

        // Skip compliance checks
        require(_balances[from] >= amount, "ComplianceToken: insufficient balance");

        unchecked {
            _balances[from] -= amount;
            _balances[to] += amount;
        }

        _updateInvestorStatus(from, to);

        emit ForceTransfer(from, to, amount, reason);
        emit ComplianceOverride(msg.sender, from, to, amount, reason);
        emit Transfer(from, to, amount);

        return true;
    }

    function recoveryAddress(address lostWallet, address newWallet) external onlyOwner {
        require(identityRegistry.hasIdentity(newWallet), "ComplianceToken: new wallet not verified");

        uint256 balance = _balances[lostWallet];
        require(balance > 0, "ComplianceToken: no balance to recover");

        _balances[lostWallet] = 0;
        _balances[newWallet] += balance;

        _updateInvestorStatus(lostWallet, newWallet);

        emit RecoveryExecuted(lostWallet, newWallet, balance);
        emit Transfer(lostWallet, newWallet, balance);
    }

    // ============================================================================
    // COMPLIANCE RULES
    // ============================================================================

    function setComplianceRules(
        bool _requireKyc,
        bool _requireAccreditation,
        uint256 _maxInvestorCount,
        uint256 _maxHoldingAmount,
        uint256 _minTransferAmount,
        uint256 _lockupEndTime
    ) external onlyCompliance {
        rules.requireKyc = _requireKyc;
        rules.requireAccreditation = _requireAccreditation;
        rules.maxInvestorCount = _maxInvestorCount;
        rules.maxHoldingAmount = _maxHoldingAmount;
        rules.minTransferAmount = _minTransferAmount;
        rules.lockupEndTime = _lockupEndTime;

        emit ComplianceRulesUpdated(msg.sender);
    }

    function setAllowedCountries(uint16[] calldata countries) external onlyCompliance {
        rules.allowedCountries = countries;
        emit ComplianceRulesUpdated(msg.sender);
    }

    function setBlockedCountries(uint16[] calldata countries) external onlyCompliance {
        rules.blockedCountries = countries;
        emit ComplianceRulesUpdated(msg.sender);
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
        require(newOwner != address(0), "ComplianceToken: invalid owner");
        owner = newOwner;
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    function canTransfer(address from, address to, uint256 amount) external view returns (bool, string memory) {
        if (paused) return (false, "Token is paused");
        if (_frozen[from]) return (false, "Sender is frozen");
        if (_frozen[to]) return (false, "Recipient is frozen");
        if (_balances[from] < amount) return (false, "Insufficient balance");
        if (!_isCompliantTransfer(from, to, amount)) return (false, "Transfer not compliant");
        return (true, "");
    }

    function isInvestor(address account) external view returns (bool) {
        return _isInvestor[account];
    }

    function getVersion() external pure returns (string memory) {
        return "1.0.0";
    }
}
