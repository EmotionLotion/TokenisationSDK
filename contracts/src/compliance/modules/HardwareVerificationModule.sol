// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HardwareVerificationModule
 * @notice Compliance module that ensures GPU hardware is verified and online
 *         before allowing token operations.
 * @dev Queries GPUNodeNFT for verification and online status.
 */
contract HardwareVerificationModule is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event GPUNodeNFTSet(address indexed nft);
    event VerificationExpirySet(uint256 expirySeconds);
    event RequireOnlineSet(bool requireOnline);
    event ExemptAddressAdded(address indexed account);
    event ExemptAddressRemoved(address indexed account);

    // ============================================================================
    // State
    // ============================================================================

    /// @notice GPUNodeNFT contract address
    address public gpuNodeNFT;

    /// @notice Token address => linked node token ID
    mapping(address => uint256) public tokenNodeId;

    /// @notice Verification expiry in seconds (default 30 days)
    uint256 public verificationExpirySeconds;

    /// @notice Whether to require the node to be online
    bool public requireOnline;

    /// @notice Exempt addresses (e.g., treasury, escrow)
    mapping(address => bool) public exemptAddresses;

    /// @notice Module name
    string public constant name = "HardwareVerificationModule";

    /// @notice Whether module is plug-and-play
    bool public constant isPlugAndPlay = true;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address initialOwner,
        address _gpuNodeNFT,
        uint256 _verificationExpirySeconds,
        bool _requireOnline
    ) Ownable(initialOwner) {
        gpuNodeNFT = _gpuNodeNFT;
        verificationExpirySeconds = _verificationExpirySeconds > 0 ? _verificationExpirySeconds : 30 days;
        requireOnline = _requireOnline;
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    function setGPUNodeNFT(address _nft) external onlyOwner {
        gpuNodeNFT = _nft;
        emit GPUNodeNFTSet(_nft);
    }

    function setVerificationExpiry(uint256 _seconds) external onlyOwner {
        verificationExpirySeconds = _seconds;
        emit VerificationExpirySet(_seconds);
    }

    function setRequireOnline(bool _requireOnline) external onlyOwner {
        requireOnline = _requireOnline;
        emit RequireOnlineSet(_requireOnline);
    }

    function registerTokenNode(address token, uint256 nodeId) external onlyOwner {
        tokenNodeId[token] = nodeId;
    }

    function addExemptAddress(address account) external onlyOwner {
        exemptAddresses[account] = true;
        emit ExemptAddressAdded(account);
    }

    function removeExemptAddress(address account) external onlyOwner {
        exemptAddresses[account] = false;
        emit ExemptAddressRemoved(account);
    }

    // ============================================================================
    // Compliance Module Interface
    // ============================================================================

    function moduleCheck(
        address /* from */,
        address to,
        uint256 /* value */,
        address token
    ) external view returns (bool) {
        if (exemptAddresses[to]) return true;

        uint256 nodeId = tokenNodeId[token];
        if (nodeId == 0) return true; // Not registered, allow

        return isNodeCompliant(nodeId);
    }

    function moduleMint(address /* to */, uint256 /* value */) external pure {}
    function moduleBurn(address /* from */, uint256 /* value */) external pure {}
    function moduleTransfer(address /* from */, address /* to */, uint256 /* value */) external pure {}

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Check if a GPU node meets compliance requirements
     * @param nodeId The GPU node token ID
     * @return compliant Whether the node is compliant
     */
    function isNodeCompliant(uint256 nodeId) public view returns (bool) {
        if (gpuNodeNFT == address(0)) return false;

        // Check verified status
        (bool verifiedSuccess, bytes memory verifiedData) = gpuNodeNFT.staticcall(
            abi.encodeWithSignature("isNodeVerified(uint256)", nodeId)
        );
        if (!verifiedSuccess || !abi.decode(verifiedData, (bool))) return false;

        // Check verification freshness
        (bool infoSuccess, bytes memory infoData) = gpuNodeNFT.staticcall(
            abi.encodeWithSignature("getNodeInfo(uint256)", nodeId)
        );
        if (!infoSuccess) return false;

        // Decode lastVerificationCheck from GPUNodeInfo struct
        // GPUNodeInfo has lastVerificationCheck as the last field
        // We need to access the 18th element (0-indexed) of the tuple
        (, , , , , , , , , , , , , , , , , , uint256 lastCheck) =
            abi.decode(infoData, (string, uint8, uint16, uint16, uint8, string, uint32, uint16, uint16, uint8, string, uint32, uint256, uint256, uint256, uint16, bool, uint256, uint256));

        if (block.timestamp - lastCheck > verificationExpirySeconds) return false;

        // Check online status if required
        if (requireOnline) {
            (bool onlineSuccess, bytes memory onlineData) = gpuNodeNFT.staticcall(
                abi.encodeWithSignature("isNodeOnline(uint256)", nodeId)
            );
            if (!onlineSuccess || !abi.decode(onlineData, (bool))) return false;
        }

        return true;
    }

    function isExempt(address account) external view returns (bool) {
        return exemptAddresses[account];
    }
}
