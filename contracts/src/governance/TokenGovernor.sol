// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title TokenGovernor
 * @dev Governance contract with timelock and multi-sig for token management
 * @notice Provides secure governance for ComplianceTokenUpgradeable contracts
 *
 * Features:
 * - Multi-signature requirements for critical operations
 * - Timelock delays for all governance actions
 * - Role-based access control
 * - Emergency pause functionality
 * - Upgrade authorization for UUPS proxies
 */
contract TokenGovernor {
    // ============================================================================
    // TYPES
    // ============================================================================

    enum ProposalState {
        Pending,    // Proposed, waiting for signatures
        Queued,     // Approved, in timelock
        Ready,      // Timelock passed, can execute
        Executed,   // Successfully executed
        Cancelled,  // Cancelled by proposer or admin
        Expired     // Exceeded grace period
    }

    struct Proposal {
        uint256 id;
        address proposer;
        address target;
        uint256 value;
        bytes data;
        string description;
        uint256 signatureCount;
        uint256 queuedAt;
        uint256 executedAt;
        bool cancelled;
        mapping(address => bool) hasApproved;
    }

    struct ProposalInfo {
        uint256 id;
        address proposer;
        address target;
        uint256 value;
        bytes data;
        string description;
        uint256 signatureCount;
        uint256 queuedAt;
        uint256 executedAt;
        bool cancelled;
        ProposalState state;
    }

    // ============================================================================
    // STATE
    // ============================================================================

    // Governance parameters
    uint256 public minDelay;           // Minimum timelock delay
    uint256 public gracePeriod;        // Time after ready before expiry
    uint256 public requiredSignatures; // Required multi-sig approvals

    // Signers
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public signerCount;

    // Proposals
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(bytes32 => uint256) public operationToProposal;

    // Admin
    address public admin;
    bool public paused;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address target,
        uint256 value,
        bytes data,
        string description
    );
    event ProposalApproved(uint256 indexed proposalId, address indexed signer);
    event ProposalQueued(uint256 indexed proposalId, uint256 queuedAt, uint256 executeAfter);
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId, address indexed by);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event DelayUpdated(uint256 oldDelay, uint256 newDelay);
    event RequiredSignaturesUpdated(uint256 oldRequired, uint256 newRequired);
    event GracePeriodUpdated(uint256 oldPeriod, uint256 newPeriod);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyAdmin() {
        require(msg.sender == admin, "TokenGovernor: not admin");
        _;
    }

    modifier onlySigner() {
        require(isSigner[msg.sender], "TokenGovernor: not signer");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "TokenGovernor: paused");
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    /**
     * @dev Initialize governance with signers and parameters
     * @param _signers Initial list of multi-sig signers
     * @param _requiredSignatures Number of signatures required for approval
     * @param _minDelay Minimum timelock delay in seconds (minimum 1 day)
     * @param _gracePeriod Time window for execution after ready (minimum 1 day)
     */
    constructor(
        address[] memory _signers,
        uint256 _requiredSignatures,
        uint256 _minDelay,
        uint256 _gracePeriod
    ) {
        require(_signers.length >= _requiredSignatures, "TokenGovernor: not enough signers");
        require(_requiredSignatures >= 2, "TokenGovernor: require at least 2 signatures");
        require(_minDelay >= 1 days, "TokenGovernor: delay too short");
        require(_gracePeriod >= 1 days, "TokenGovernor: grace period too short");

        admin = msg.sender;
        minDelay = _minDelay;
        gracePeriod = _gracePeriod;
        requiredSignatures = _requiredSignatures;

        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            require(signer != address(0), "TokenGovernor: invalid signer");
            require(!isSigner[signer], "TokenGovernor: duplicate signer");

            isSigner[signer] = true;
            signers.push(signer);
            signerCount++;

            emit SignerAdded(signer);
        }
    }

    // ============================================================================
    // PROPOSAL FUNCTIONS
    // ============================================================================

    /**
     * @dev Create a new proposal
     * @param target Contract address to call
     * @param value ETH value to send
     * @param data Encoded function call
     * @param description Human-readable description
     * @return proposalId The created proposal ID
     */
    function propose(
        address target,
        uint256 value,
        bytes calldata data,
        string calldata description
    ) external onlySigner whenNotPaused returns (uint256 proposalId) {
        require(target != address(0), "TokenGovernor: invalid target");
        require(bytes(description).length > 0, "TokenGovernor: empty description");

        proposalId = ++proposalCount;

        Proposal storage proposal = proposals[proposalId];
        proposal.id = proposalId;
        proposal.proposer = msg.sender;
        proposal.target = target;
        proposal.value = value;
        proposal.data = data;
        proposal.description = description;
        proposal.signatureCount = 1;
        proposal.hasApproved[msg.sender] = true;

        // Store operation hash to prevent duplicates
        bytes32 opHash = hashOperation(target, value, data);
        require(operationToProposal[opHash] == 0, "TokenGovernor: duplicate operation");
        operationToProposal[opHash] = proposalId;

        emit ProposalCreated(proposalId, msg.sender, target, value, data, description);
        emit ProposalApproved(proposalId, msg.sender);
    }

    /**
     * @dev Approve a proposal
     * @param proposalId ID of the proposal to approve
     */
    function approve(uint256 proposalId) external onlySigner whenNotPaused {
        Proposal storage proposal = proposals[proposalId];

        require(proposal.id != 0, "TokenGovernor: proposal not found");
        require(!proposal.cancelled, "TokenGovernor: proposal cancelled");
        require(proposal.executedAt == 0, "TokenGovernor: already executed");
        require(!proposal.hasApproved[msg.sender], "TokenGovernor: already approved");

        proposal.hasApproved[msg.sender] = true;
        proposal.signatureCount++;

        emit ProposalApproved(proposalId, msg.sender);

        // Auto-queue if threshold reached
        if (proposal.signatureCount >= requiredSignatures && proposal.queuedAt == 0) {
            proposal.queuedAt = block.timestamp;
            emit ProposalQueued(proposalId, block.timestamp, block.timestamp + minDelay);
        }
    }

    /**
     * @dev Execute an approved proposal after timelock
     * @param proposalId ID of the proposal to execute
     */
    function execute(uint256 proposalId) external whenNotPaused returns (bytes memory) {
        Proposal storage proposal = proposals[proposalId];

        require(proposal.id != 0, "TokenGovernor: proposal not found");
        require(!proposal.cancelled, "TokenGovernor: proposal cancelled");
        require(proposal.executedAt == 0, "TokenGovernor: already executed");
        require(proposal.queuedAt > 0, "TokenGovernor: not queued");
        require(
            block.timestamp >= proposal.queuedAt + minDelay,
            "TokenGovernor: timelock not passed"
        );
        require(
            block.timestamp <= proposal.queuedAt + minDelay + gracePeriod,
            "TokenGovernor: proposal expired"
        );

        proposal.executedAt = block.timestamp;

        // Execute the call
        (bool success, bytes memory result) = proposal.target.call{value: proposal.value}(proposal.data);
        require(success, "TokenGovernor: execution failed");

        emit ProposalExecuted(proposalId);

        return result;
    }

    /**
     * @dev Cancel a proposal
     * @param proposalId ID of the proposal to cancel
     */
    function cancel(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];

        require(proposal.id != 0, "TokenGovernor: proposal not found");
        require(!proposal.cancelled, "TokenGovernor: already cancelled");
        require(proposal.executedAt == 0, "TokenGovernor: already executed");
        require(
            msg.sender == proposal.proposer || msg.sender == admin,
            "TokenGovernor: not authorized"
        );

        proposal.cancelled = true;

        // Clear operation hash
        bytes32 opHash = hashOperation(proposal.target, proposal.value, proposal.data);
        delete operationToProposal[opHash];

        emit ProposalCancelled(proposalId, msg.sender);
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @dev Get proposal state
     * @param proposalId ID of the proposal
     */
    function getProposalState(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage proposal = proposals[proposalId];

        if (proposal.id == 0) {
            revert("TokenGovernor: proposal not found");
        }

        if (proposal.cancelled) {
            return ProposalState.Cancelled;
        }

        if (proposal.executedAt > 0) {
            return ProposalState.Executed;
        }

        if (proposal.queuedAt == 0) {
            return ProposalState.Pending;
        }

        if (block.timestamp < proposal.queuedAt + minDelay) {
            return ProposalState.Queued;
        }

        if (block.timestamp <= proposal.queuedAt + minDelay + gracePeriod) {
            return ProposalState.Ready;
        }

        return ProposalState.Expired;
    }

    /**
     * @dev Get full proposal info
     * @param proposalId ID of the proposal
     */
    function getProposal(uint256 proposalId) external view returns (ProposalInfo memory) {
        Proposal storage proposal = proposals[proposalId];

        return ProposalInfo({
            id: proposal.id,
            proposer: proposal.proposer,
            target: proposal.target,
            value: proposal.value,
            data: proposal.data,
            description: proposal.description,
            signatureCount: proposal.signatureCount,
            queuedAt: proposal.queuedAt,
            executedAt: proposal.executedAt,
            cancelled: proposal.cancelled,
            state: getProposalState(proposalId)
        });
    }

    /**
     * @dev Check if signer has approved a proposal
     */
    function hasApproved(uint256 proposalId, address signer) external view returns (bool) {
        return proposals[proposalId].hasApproved[signer];
    }

    /**
     * @dev Get all signers
     */
    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    /**
     * @dev Hash an operation for uniqueness check
     */
    function hashOperation(address target, uint256 value, bytes memory data) public pure returns (bytes32) {
        return keccak256(abi.encode(target, value, data));
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /**
     * @dev Add a new signer
     * @param signer Address to add as signer
     */
    function addSigner(address signer) external onlyAdmin {
        require(signer != address(0), "TokenGovernor: invalid signer");
        require(!isSigner[signer], "TokenGovernor: already signer");

        isSigner[signer] = true;
        signers.push(signer);
        signerCount++;

        emit SignerAdded(signer);
    }

    /**
     * @dev Remove a signer
     * @param signer Address to remove
     */
    function removeSigner(address signer) external onlyAdmin {
        require(isSigner[signer], "TokenGovernor: not a signer");
        require(signerCount > requiredSignatures, "TokenGovernor: would break quorum");

        isSigner[signer] = false;
        signerCount--;

        // Remove from array
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == signer) {
                signers[i] = signers[signers.length - 1];
                signers.pop();
                break;
            }
        }

        emit SignerRemoved(signer);
    }

    /**
     * @dev Update minimum delay (requires timelock proposal)
     * @param newDelay New minimum delay
     */
    function setMinDelay(uint256 newDelay) external {
        require(msg.sender == address(this), "TokenGovernor: must be via proposal");
        require(newDelay >= 1 days, "TokenGovernor: delay too short");

        uint256 oldDelay = minDelay;
        minDelay = newDelay;

        emit DelayUpdated(oldDelay, newDelay);
    }

    /**
     * @dev Update required signatures (requires timelock proposal)
     * @param newRequired New required signature count
     */
    function setRequiredSignatures(uint256 newRequired) external {
        require(msg.sender == address(this), "TokenGovernor: must be via proposal");
        require(newRequired >= 2, "TokenGovernor: require at least 2");
        require(newRequired <= signerCount, "TokenGovernor: not enough signers");

        uint256 oldRequired = requiredSignatures;
        requiredSignatures = newRequired;

        emit RequiredSignaturesUpdated(oldRequired, newRequired);
    }

    /**
     * @dev Update grace period (requires timelock proposal)
     * @param newPeriod New grace period
     */
    function setGracePeriod(uint256 newPeriod) external {
        require(msg.sender == address(this), "TokenGovernor: must be via proposal");
        require(newPeriod >= 1 days, "TokenGovernor: period too short");

        uint256 oldPeriod = gracePeriod;
        gracePeriod = newPeriod;

        emit GracePeriodUpdated(oldPeriod, newPeriod);
    }

    /**
     * @dev Emergency pause
     */
    function pause() external onlyAdmin {
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @dev Unpause
     */
    function unpause() external onlyAdmin {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @dev Transfer admin role
     * @param newAdmin New admin address
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "TokenGovernor: invalid admin");
        admin = newAdmin;
    }

    // ============================================================================
    // RECEIVE ETH
    // ============================================================================

    receive() external payable {}
}
