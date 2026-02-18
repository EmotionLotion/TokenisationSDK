// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IIdentityRegistry.sol";

/**
 * @title ComputeToken
 * @dev ERC-20 security token for fractional GPU compute node ownership
 * @notice Based on ERC-3643 T-REX pattern with revenue distribution
 *
 * Features:
 * - Fractional ownership of tokenized GPU nodes
 * - KYC/AML verification required for transfers
 * - Country-based transfer restrictions
 * - Revenue accrual and pull-based claiming
 * - Freeze/unfreeze, force transfers, recovery
 */
contract ComputeToken {
    // ============================================================================
    // STATE
    // ============================================================================

    // ERC20 State
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // Linked GPU Node
    uint256 public linkedNodeTokenId;
    address public gpuNodeNFT;

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

    // Revenue Distribution (pull model)
    address public paymentToken; // USDC or similar
    uint256 public revenuePerToken; // Cumulative revenue per token (scaled by 1e18)
    uint256 public lastDistribution;
    mapping(address => uint256) private _revenueDebt; // Revenue already accounted for
    mapping(address => uint256) private _pendingRevenue; // Claimable revenue

    // Frozen accounts
    mapping(address => bool) private _frozen;

    // Investor tracking
    uint256 public investorCount;
    mapping(address => bool) private _isInvestor;

    // Roles
    address public owner;
    mapping(address => bool) public agents;

    // Paused state
    bool public paused;

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
    event ForceTransfer(address indexed from, address indexed to, uint256 amount, string reason);
    event RevenueDeposited(uint256 amount, uint256 newRevenuePerToken);
    event RevenueClaimed(address indexed holder, uint256 amount);
    event PaymentTokenSet(address indexed token);

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyOwner() { require(msg.sender == owner, "ComputeToken: not owner"); _; }
    modifier onlyAgent() { require(msg.sender == owner || agents[msg.sender], "ComputeToken: not agent"); _; }
    modifier whenNotPaused() { require(!paused, "ComputeToken: paused"); _; }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(
        string memory _name,
        string memory _symbol,
        address _identityRegistry,
        address _gpuNodeNFT,
        uint256 _nodeTokenId,
        address _paymentToken
    ) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
        agents[msg.sender] = true;
        identityRegistry = IIdentityRegistry(_identityRegistry);
        gpuNodeNFT = _gpuNodeNFT;
        linkedNodeTokenId = _nodeTokenId;
        paymentToken = _paymentToken;

        rules = ComplianceRules({
            requireKyc: true,
            requireAccreditation: false,
            maxInvestorCount: 2000,
            maxHoldingAmount: 0,
            minTransferAmount: 0,
            lockupEndTime: 0,
            allowedCountries: new uint16[](0),
            blockedCountries: new uint16[](0)
        });
    }

    // ============================================================================
    // ERC20
    // ============================================================================

    function balanceOf(address account) public view returns (uint256) { return _balances[account]; }

    function allowance(address _owner, address spender) public view returns (uint256) {
        return _allowances[_owner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) public whenNotPaused returns (bool) {
        _complianceTransfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public whenNotPaused returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        require(currentAllowance >= amount, "ComputeToken: insufficient allowance");
        _allowances[from][msg.sender] = currentAllowance - amount;
        _complianceTransfer(from, to, amount);
        return true;
    }

    // ============================================================================
    // MINT / BURN
    // ============================================================================

    function mint(address to, uint256 amount) external onlyAgent {
        require(to != address(0), "ComputeToken: mint to zero");

        // Update revenue accounting before changing balances
        _updateRevenue(to);

        totalSupply += amount;
        _balances[to] += amount;

        if (!_isInvestor[to] && _balances[to] > 0) {
            _isInvestor[to] = true;
            investorCount++;
        }

        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyAgent {
        require(_balances[from] >= amount, "ComputeToken: burn exceeds balance");

        _updateRevenue(from);

        _balances[from] -= amount;
        totalSupply -= amount;

        if (_isInvestor[from] && _balances[from] == 0) {
            _isInvestor[from] = false;
            investorCount--;
        }

        emit Transfer(from, address(0), amount);
    }

    // ============================================================================
    // REVENUE DISTRIBUTION (Pull Model)
    // ============================================================================

    /**
     * @notice Deposit revenue for distribution to all token holders
     * @param amount Amount of payment token to distribute
     */
    function depositRevenue(uint256 amount) external onlyAgent {
        require(totalSupply > 0, "ComputeToken: no supply");
        require(amount > 0, "ComputeToken: zero amount");

        // Transfer payment tokens from caller
        (bool success, bytes memory data) = paymentToken.call(
            abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "ComputeToken: transfer failed");

        // Update cumulative revenue per token
        revenuePerToken += (amount * 1e18) / totalSupply;
        lastDistribution = block.timestamp;

        emit RevenueDeposited(amount, revenuePerToken);
    }

    /**
     * @notice Claim accumulated revenue
     */
    function claimRevenue() external {
        _updateRevenue(msg.sender);

        uint256 claimable = _pendingRevenue[msg.sender];
        require(claimable > 0, "ComputeToken: nothing to claim");

        _pendingRevenue[msg.sender] = 0;

        // Transfer payment tokens to claimant
        (bool success, bytes memory data) = paymentToken.call(
            abi.encodeWithSelector(0xa9059cbb, msg.sender, claimable)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "ComputeToken: claim transfer failed");

        emit RevenueClaimed(msg.sender, claimable);
    }

    /**
     * @notice Get claimable revenue for a holder
     */
    function getClaimableRevenue(address holder) external view returns (uint256) {
        uint256 accumulated = (_balances[holder] * revenuePerToken) / 1e18;
        uint256 debt = _revenueDebt[holder];
        return _pendingRevenue[holder] + (accumulated > debt ? accumulated - debt : 0);
    }

    // ============================================================================
    // COMPLIANCE
    // ============================================================================

    function freezeAccount(address account) external onlyAgent {
        _frozen[account] = true;
        emit Frozen(account, msg.sender);
    }

    function unfreezeAccount(address account) external onlyAgent {
        _frozen[account] = false;
        emit Unfrozen(account, msg.sender);
    }

    function forceTransfer(address from, address to, uint256 amount, string calldata reason) external onlyAgent {
        require(_balances[from] >= amount, "ComputeToken: exceeds balance");

        _updateRevenue(from);
        _updateRevenue(to);

        _balances[from] -= amount;
        _balances[to] += amount;

        _trackInvestor(from);
        _trackInvestor(to);

        emit Transfer(from, to, amount);
        emit ForceTransfer(from, to, amount, reason);
    }

    function setComplianceRules(ComplianceRules calldata _rules) external onlyOwner {
        rules = _rules;
        emit ComplianceRulesUpdated(msg.sender);
    }

    function setIdentityRegistry(address _registry) external onlyOwner {
        identityRegistry = IIdentityRegistry(_registry);
        emit IdentityRegistrySet(_registry);
    }

    function setPaymentToken(address _token) external onlyOwner {
        paymentToken = _token;
        emit PaymentTokenSet(_token);
    }

    // ============================================================================
    // ADMIN
    // ============================================================================

    function addAgent(address agent) external onlyOwner { agents[agent] = true; emit AgentAdded(agent); }
    function removeAgent(address agent) external onlyOwner { agents[agent] = false; emit AgentRemoved(agent); }
    function setPaused(bool _paused) external onlyOwner { paused = _paused; if (_paused) emit Paused(msg.sender); else emit Unpaused(msg.sender); }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ComputeToken: zero address");
        owner = newOwner;
    }

    // ============================================================================
    // INTERNAL
    // ============================================================================

    function _complianceTransfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "ComputeToken: transfer to zero");
        require(!_frozen[from], "ComputeToken: sender frozen");
        require(!_frozen[to], "ComputeToken: recipient frozen");
        require(_balances[from] >= amount, "ComputeToken: exceeds balance");

        // Compliance checks
        if (rules.requireKyc) {
            require(identityRegistry.isVerified(to, new uint256[](0)), "ComputeToken: recipient not KYC verified");
        }
        if (rules.minTransferAmount > 0) {
            require(amount >= rules.minTransferAmount, "ComputeToken: below min transfer");
        }
        if (rules.lockupEndTime > 0) {
            require(block.timestamp >= rules.lockupEndTime, "ComputeToken: lockup active");
        }
        if (rules.maxHoldingAmount > 0) {
            require(_balances[to] + amount <= rules.maxHoldingAmount, "ComputeToken: exceeds max holding");
        }
        if (rules.maxInvestorCount > 0 && !_isInvestor[to]) {
            require(investorCount < rules.maxInvestorCount, "ComputeToken: max investors reached");
        }

        // Country check
        if (rules.blockedCountries.length > 0) {
            uint16 country = identityRegistry.getCountry(to);
            for (uint256 i = 0; i < rules.blockedCountries.length; i++) {
                require(country != rules.blockedCountries[i], "ComputeToken: blocked country");
            }
        }

        // Update revenue accounting
        _updateRevenue(from);
        _updateRevenue(to);

        _balances[from] -= amount;
        _balances[to] += amount;

        _trackInvestor(from);
        _trackInvestor(to);

        emit Transfer(from, to, amount);
    }

    function _updateRevenue(address account) internal {
        uint256 accumulated = (_balances[account] * revenuePerToken) / 1e18;
        uint256 debt = _revenueDebt[account];
        if (accumulated > debt) {
            _pendingRevenue[account] += accumulated - debt;
        }
        _revenueDebt[account] = (_balances[account] * revenuePerToken) / 1e18;
    }

    function _trackInvestor(address account) internal {
        if (_isInvestor[account] && _balances[account] == 0) {
            _isInvestor[account] = false;
            investorCount--;
        } else if (!_isInvestor[account] && _balances[account] > 0) {
            _isInvestor[account] = true;
            investorCount++;
        }
    }
}
