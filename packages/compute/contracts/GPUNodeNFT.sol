// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GPUNodeNFT
 * @dev ERC721-based NFT representing physical GPU compute nodes with verification,
 *      operating metrics tracking, lifecycle management, and transfer restrictions.
 *
 * Features:
 * - Mint NFTs representing verified GPU nodes with hardware specifications
 * - Node verification workflow: REGISTERED -> PENDING_VERIFICATION -> VERIFIED -> ACTIVE
 * - Operating metrics tracking: utilization, revenue, uptime, online status
 * - Transfer restrictions: ACTIVE nodes cannot be transferred (must be PAUSED first)
 * - Role-based access: owner, verifiers, operators
 * - Decommissioning path for end-of-life hardware
 */
contract GPUNodeNFT {
    // ============================================================================
    // Enums
    // ============================================================================

    enum Interconnect { NVLink, PCIe, NVSwitch }

    enum NodeStatus {
        REGISTERED,
        PENDING_VERIFICATION,
        VERIFIED,
        ACTIVE,
        PAUSED,
        DECOMMISSIONED
    }

    // ============================================================================
    // Structs
    // ============================================================================

    struct GPUNodeInfo {
        string gpuModel;
        uint8 gpuCount;
        uint16 vramPerGpuGB;
        uint16 totalVramGB;
        Interconnect interconnect;
        string cpuModel;
        uint32 ramGB;
        uint16 storageTB;
        uint16 networkBandwidthGbps;
        uint8 datacenterTier;
        string datacenterLocation;
        uint32 tdpWatts;
        uint256 benchmarkScore;
        uint256 acquisitionCostUsd;
        uint256 acquisitionDate;
        uint16 depreciationMonths;
        bool verified;
        uint256 verifiedAt;
        uint256 lastVerificationCheck;
    }

    struct OperatingMetrics {
        uint16 utilizationBps;
        uint256 revenueAccruedUsd;
        uint256 lastRevenueUpdate;
        bool isOnline;
        uint256 totalUptimeSeconds;
        uint256 lastUptimeCheck;
    }

    // ============================================================================
    // ERC721 State
    // ============================================================================

    string public name;
    string public symbol;
    string public baseURI;

    uint256 private _nextTokenId;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // ============================================================================
    // Node State
    // ============================================================================

    mapping(uint256 => GPUNodeInfo) private _nodeInfo;
    mapping(uint256 => OperatingMetrics) private _operatingMetrics;
    mapping(uint256 => NodeStatus) private _nodeStatus;

    // ============================================================================
    // Access Control
    // ============================================================================

    address public owner;
    mapping(address => bool) public verifiers;
    mapping(address => bool) public operators;
    bool public paused;

    // ============================================================================
    // Events
    // ============================================================================

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    event NodeMinted(uint256 indexed tokenId, address indexed to, string gpuModel, uint8 gpuCount);
    event NodeVerified(uint256 indexed tokenId, address indexed verifier, uint256 verifiedAt);
    event NodeActivated(uint256 indexed tokenId);
    event NodePaused(uint256 indexed tokenId);
    event NodeDecommissioned(uint256 indexed tokenId);
    event NodeStatusChanged(uint256 indexed tokenId, NodeStatus oldStatus, NodeStatus newStatus);
    event MetricsUpdated(uint256 indexed tokenId, uint16 utilizationBps, uint256 revenueAccruedUsd, bool isOnline);
    event VerifierAdded(address indexed verifier);
    event VerifierRemoved(address indexed verifier);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    // ============================================================================
    // Errors
    // ============================================================================

    error NotOwner();
    error NotVerifier();
    error NotOperator();
    error ContractPaused();
    error TokenDoesNotExist(uint256 tokenId);
    error TransferBlockedForActiveNode(uint256 tokenId);
    error InvalidDatacenterTier(uint8 tier);
    error NodeAlreadyVerified(uint256 tokenId);
    error ZeroAddress();

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyVerifier() { if (!verifiers[msg.sender] && msg.sender != owner) revert NotVerifier(); _; }
    modifier onlyOperator() { if (!operators[msg.sender] && msg.sender != owner) revert NotOperator(); _; }
    modifier whenNotPaused() { if (paused) revert ContractPaused(); _; }
    modifier tokenExists(uint256 tokenId) { if (_owners[tokenId] == address(0)) revert TokenDoesNotExist(tokenId); _; }

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(string memory _name, string memory _symbol, string memory _baseURI) {
        name = _name;
        symbol = _symbol;
        baseURI = _baseURI;
        owner = msg.sender;
        operators[msg.sender] = true;
        verifiers[msg.sender] = true;
        _nextTokenId = 1;
    }

    // ============================================================================
    // ERC721 Core
    // ============================================================================

    function balanceOf(address _owner) public view returns (uint256) {
        if (_owner == address(0)) revert ZeroAddress();
        return _balances[_owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address o = _owners[tokenId];
        if (o == address(0)) revert TokenDoesNotExist(tokenId);
        return o;
    }

    function approve(address to, uint256 tokenId) public {
        address nodeOwner = ownerOf(tokenId);
        require(to != nodeOwner, "GPUNodeNFT: approve to owner");
        require(msg.sender == nodeOwner || isApprovedForAll(nodeOwner, msg.sender), "GPUNodeNFT: not authorized");
        _tokenApprovals[tokenId] = to;
        emit Approval(nodeOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view tokenExists(tokenId) returns (address) {
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) public {
        require(msg.sender != operator, "GPUNodeNFT: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address _ownerAddr, address operator) public view returns (bool) {
        return _operatorApprovals[_ownerAddr][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public whenNotPaused {
        require(_isApprovedOrOwner(msg.sender, tokenId), "GPUNodeNFT: not authorized");
        _transferNode(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) public {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "GPUNodeNFT: unsafe recipient");
    }

    // ============================================================================
    // Node Minting
    // ============================================================================

    function mintNode(address to, GPUNodeInfo calldata nodeInfo) external onlyOwner whenNotPaused returns (uint256) {
        if (to == address(0)) revert ZeroAddress();
        if (nodeInfo.datacenterTier < 1 || nodeInfo.datacenterTier > 4) revert InvalidDatacenterTier(nodeInfo.datacenterTier);

        uint256 tokenId = _nextTokenId++;
        _balances[to]++;
        _owners[tokenId] = to;

        _nodeInfo[tokenId] = GPUNodeInfo({
            gpuModel: nodeInfo.gpuModel, gpuCount: nodeInfo.gpuCount,
            vramPerGpuGB: nodeInfo.vramPerGpuGB, totalVramGB: nodeInfo.totalVramGB,
            interconnect: nodeInfo.interconnect, cpuModel: nodeInfo.cpuModel,
            ramGB: nodeInfo.ramGB, storageTB: nodeInfo.storageTB,
            networkBandwidthGbps: nodeInfo.networkBandwidthGbps, datacenterTier: nodeInfo.datacenterTier,
            datacenterLocation: nodeInfo.datacenterLocation, tdpWatts: nodeInfo.tdpWatts,
            benchmarkScore: nodeInfo.benchmarkScore, acquisitionCostUsd: nodeInfo.acquisitionCostUsd,
            acquisitionDate: nodeInfo.acquisitionDate, depreciationMonths: nodeInfo.depreciationMonths,
            verified: false, verifiedAt: 0, lastVerificationCheck: 0
        });

        _operatingMetrics[tokenId] = OperatingMetrics({
            utilizationBps: 0, revenueAccruedUsd: 0, lastRevenueUpdate: 0,
            isOnline: false, totalUptimeSeconds: 0, lastUptimeCheck: 0
        });

        _nodeStatus[tokenId] = NodeStatus.REGISTERED;

        emit Transfer(address(0), to, tokenId);
        emit NodeMinted(tokenId, to, nodeInfo.gpuModel, nodeInfo.gpuCount);

        return tokenId;
    }

    // ============================================================================
    // Node Verification
    // ============================================================================

    function verifyNode(uint256 tokenId) external tokenExists(tokenId) onlyVerifier {
        GPUNodeInfo storage info = _nodeInfo[tokenId];
        if (info.verified) revert NodeAlreadyVerified(tokenId);

        info.verified = true;
        info.verifiedAt = block.timestamp;
        info.lastVerificationCheck = block.timestamp;

        NodeStatus oldStatus = _nodeStatus[tokenId];
        _nodeStatus[tokenId] = NodeStatus.VERIFIED;

        emit NodeVerified(tokenId, msg.sender, block.timestamp);
        emit NodeStatusChanged(tokenId, oldStatus, NodeStatus.VERIFIED);
    }

    // ============================================================================
    // Node Lifecycle
    // ============================================================================

    function activateNode(uint256 tokenId) external tokenExists(tokenId) onlyOperator {
        NodeStatus current = _nodeStatus[tokenId];
        require(current == NodeStatus.VERIFIED || current == NodeStatus.PAUSED, "GPUNodeNFT: must be VERIFIED or PAUSED");
        require(_nodeInfo[tokenId].verified, "GPUNodeNFT: not verified");

        _nodeStatus[tokenId] = NodeStatus.ACTIVE;
        _operatingMetrics[tokenId].isOnline = true;
        _operatingMetrics[tokenId].lastUptimeCheck = block.timestamp;

        emit NodeActivated(tokenId);
        emit NodeStatusChanged(tokenId, current, NodeStatus.ACTIVE);
    }

    function pauseNode(uint256 tokenId) external tokenExists(tokenId) onlyOperator {
        NodeStatus current = _nodeStatus[tokenId];
        require(current == NodeStatus.ACTIVE, "GPUNodeNFT: must be ACTIVE");

        OperatingMetrics storage metrics = _operatingMetrics[tokenId];
        if (metrics.isOnline && metrics.lastUptimeCheck > 0) {
            metrics.totalUptimeSeconds += block.timestamp - metrics.lastUptimeCheck;
        }
        metrics.isOnline = false;
        metrics.lastUptimeCheck = block.timestamp;

        _nodeStatus[tokenId] = NodeStatus.PAUSED;

        emit NodePaused(tokenId);
        emit NodeStatusChanged(tokenId, current, NodeStatus.PAUSED);
    }

    function decommissionNode(uint256 tokenId) external tokenExists(tokenId) onlyOwner {
        NodeStatus current = _nodeStatus[tokenId];
        require(current != NodeStatus.DECOMMISSIONED, "GPUNodeNFT: already decommissioned");

        OperatingMetrics storage metrics = _operatingMetrics[tokenId];
        if (metrics.isOnline && metrics.lastUptimeCheck > 0) {
            metrics.totalUptimeSeconds += block.timestamp - metrics.lastUptimeCheck;
        }
        metrics.isOnline = false;
        metrics.lastUptimeCheck = block.timestamp;

        _nodeStatus[tokenId] = NodeStatus.DECOMMISSIONED;

        emit NodeDecommissioned(tokenId);
        emit NodeStatusChanged(tokenId, current, NodeStatus.DECOMMISSIONED);
    }

    // ============================================================================
    // Metrics
    // ============================================================================

    function updateMetrics(uint256 tokenId, uint16 utilization, uint256 revenue, bool isOnline)
        external tokenExists(tokenId) onlyOperator
    {
        require(utilization <= 10000, "GPUNodeNFT: utilization > 100%");
        require(
            _nodeStatus[tokenId] == NodeStatus.ACTIVE || _nodeStatus[tokenId] == NodeStatus.PAUSED,
            "GPUNodeNFT: not active or paused"
        );

        OperatingMetrics storage metrics = _operatingMetrics[tokenId];
        if (metrics.isOnline && metrics.lastUptimeCheck > 0) {
            metrics.totalUptimeSeconds += block.timestamp - metrics.lastUptimeCheck;
        }

        metrics.utilizationBps = utilization;
        metrics.revenueAccruedUsd = revenue;
        metrics.lastRevenueUpdate = block.timestamp;
        metrics.isOnline = isOnline;
        metrics.lastUptimeCheck = block.timestamp;

        emit MetricsUpdated(tokenId, utilization, revenue, isOnline);
    }

    function updateVerificationCheck(uint256 tokenId) external tokenExists(tokenId) onlyVerifier {
        _nodeInfo[tokenId].lastVerificationCheck = block.timestamp;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    function getNodeInfo(uint256 tokenId) external view tokenExists(tokenId) returns (GPUNodeInfo memory) { return _nodeInfo[tokenId]; }
    function getMetrics(uint256 tokenId) external view tokenExists(tokenId) returns (OperatingMetrics memory) { return _operatingMetrics[tokenId]; }
    function getStatus(uint256 tokenId) external view tokenExists(tokenId) returns (NodeStatus) { return _nodeStatus[tokenId]; }
    function isNodeVerified(uint256 tokenId) external view tokenExists(tokenId) returns (bool) { return _nodeInfo[tokenId].verified; }
    function isNodeOnline(uint256 tokenId) external view tokenExists(tokenId) returns (bool) { return _operatingMetrics[tokenId].isOnline; }
    function totalSupply() external view returns (uint256) { return _nextTokenId - 1; }

    // ============================================================================
    // Admin
    // ============================================================================

    function addVerifier(address v) external onlyOwner { verifiers[v] = true; emit VerifierAdded(v); }
    function removeVerifier(address v) external onlyOwner { verifiers[v] = false; emit VerifierRemoved(v); }
    function addOperator(address o) external onlyOwner { operators[o] = true; emit OperatorAdded(o); }
    function removeOperator(address o) external onlyOwner { operators[o] = false; emit OperatorRemoved(o); }
    function setBaseURI(string calldata _baseURI) external onlyOwner { baseURI = _baseURI; }
    function pause() external onlyOwner { paused = true; }
    function unpause() external onlyOwner { paused = false; }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ============================================================================
    // Internal
    // ============================================================================

    function _transferNode(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "GPUNodeNFT: not owner");
        if (to == address(0)) revert ZeroAddress();
        if (_nodeStatus[tokenId] == NodeStatus.ACTIVE) revert TransferBlockedForActiveNode(tokenId);

        delete _tokenApprovals[tokenId];
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address o = ownerOf(tokenId);
        return (spender == o || getApproved(tokenId) == spender || isApprovedForAll(o, spender));
    }

    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory data) internal returns (bool) {
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
                return retval == IERC721Receiver.onERC721Received.selector;
            } catch { return false; }
        }
        return true;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}
