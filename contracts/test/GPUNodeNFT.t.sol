// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/tokens/GPUNodeNFT.sol";

/**
 * @title GPUNodeNFTTest
 * @notice Tests for GPUNodeNFT: lifecycle, transfer restrictions, roles, metrics
 */
contract GPUNodeNFTTest is Test {
    GPUNodeNFT public nft;

    address public owner = address(1);
    address public verifier = address(2);
    address public operator = address(3);
    address public alice = address(4);
    address public bob = address(5);

    function setUp() public {
        vm.startPrank(owner);
        nft = new GPUNodeNFT("GPU Nodes", "GPUN", "https://api.example.com/node/");
        nft.addVerifier(verifier);
        nft.addOperator(operator);
        vm.stopPrank();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _defaultNodeInfo() internal view returns (GPUNodeNFT.GPUNodeInfo memory) {
        return GPUNodeNFT.GPUNodeInfo({
            gpuModel: "H100",
            gpuCount: 8,
            vramPerGpuGB: 80,
            totalVramGB: 640,
            interconnect: GPUNodeNFT.Interconnect.NVLink,
            cpuModel: "AMD EPYC 9654",
            ramGB: 2048,
            storageTB: 30,
            networkBandwidthGbps: 400,
            datacenterTier: 3,
            datacenterLocation: "US-East",
            tdpWatts: 5600,
            benchmarkScore: 1000000,
            acquisitionCostUsd: 250000e8,
            acquisitionDate: block.timestamp,
            depreciationMonths: 60,
            verified: false,
            verifiedAt: 0,
            lastVerificationCheck: 0
        });
    }

    function _mintNode(address to) internal returns (uint256) {
        vm.prank(owner);
        return nft.mintNode(to, _defaultNodeInfo());
    }

    // =========================================================================
    // MINTING
    // =========================================================================

    function test_MintNode_Success() public {
        uint256 tokenId = _mintNode(alice);

        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(tokenId), alice);
        assertEq(nft.balanceOf(alice), 1);
        assertEq(nft.totalSupply(), 1);
    }

    function test_MintNode_SequentialIds() public {
        uint256 id1 = _mintNode(alice);
        uint256 id2 = _mintNode(bob);

        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_MintNode_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(GPUNodeNFT.ZeroAddress.selector);
        nft.mintNode(address(0), _defaultNodeInfo());
    }

    function test_MintNode_InvalidTier_Reverts() public {
        GPUNodeNFT.GPUNodeInfo memory info = _defaultNodeInfo();
        info.datacenterTier = 0;

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(GPUNodeNFT.InvalidDatacenterTier.selector, 0));
        nft.mintNode(alice, info);

        info.datacenterTier = 5;
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(GPUNodeNFT.InvalidDatacenterTier.selector, 5));
        nft.mintNode(alice, info);
    }

    function test_MintNode_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(GPUNodeNFT.NotOwner.selector);
        nft.mintNode(alice, _defaultNodeInfo());
    }

    function test_MintNode_WhenPaused_Reverts() public {
        vm.prank(owner);
        nft.pause();

        vm.prank(owner);
        vm.expectRevert(GPUNodeNFT.ContractPaused.selector);
        nft.mintNode(alice, _defaultNodeInfo());
    }

    function test_MintNode_InitialStatus_Registered() public {
        uint256 tokenId = _mintNode(alice);
        assertEq(uint8(nft.getStatus(tokenId)), uint8(GPUNodeNFT.NodeStatus.REGISTERED));
    }

    // =========================================================================
    // VERIFICATION
    // =========================================================================

    function test_VerifyNode_Success() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        assertTrue(nft.isNodeVerified(tokenId));
        assertEq(uint8(nft.getStatus(tokenId)), uint8(GPUNodeNFT.NodeStatus.VERIFIED));
    }

    function test_VerifyNode_AlreadyVerified_Reverts() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(GPUNodeNFT.NodeAlreadyVerified.selector, tokenId));
        nft.verifyNode(tokenId);
    }

    function test_VerifyNode_OnlyVerifier() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(alice);
        vm.expectRevert(GPUNodeNFT.NotVerifier.selector);
        nft.verifyNode(tokenId);
    }

    function test_VerifyNode_OwnerCanVerify() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(owner);
        nft.verifyNode(tokenId);

        assertTrue(nft.isNodeVerified(tokenId));
    }

    // =========================================================================
    // LIFECYCLE: ACTIVATE / PAUSE / DECOMMISSION
    // =========================================================================

    function test_ActivateNode_FromVerified() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        assertEq(uint8(nft.getStatus(tokenId)), uint8(GPUNodeNFT.NodeStatus.ACTIVE));
        assertTrue(nft.isNodeOnline(tokenId));
    }

    function test_ActivateNode_FromPaused() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        vm.prank(operator);
        nft.pauseNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        assertEq(uint8(nft.getStatus(tokenId)), uint8(GPUNodeNFT.NodeStatus.ACTIVE));
    }

    function test_ActivateNode_FromRegistered_Reverts() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(operator);
        vm.expectRevert("GPUNodeNFT: must be VERIFIED or PAUSED");
        nft.activateNode(tokenId);
    }

    function test_PauseNode_Success() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        vm.warp(block.timestamp + 3600);

        vm.prank(operator);
        nft.pauseNode(tokenId);

        assertEq(uint8(nft.getStatus(tokenId)), uint8(GPUNodeNFT.NodeStatus.PAUSED));
        assertFalse(nft.isNodeOnline(tokenId));
    }

    function test_PauseNode_NotActive_Reverts() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(operator);
        vm.expectRevert("GPUNodeNFT: must be ACTIVE");
        nft.pauseNode(tokenId);
    }

    function test_DecommissionNode_Success() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        vm.prank(owner);
        nft.decommissionNode(tokenId);

        assertEq(uint8(nft.getStatus(tokenId)), uint8(GPUNodeNFT.NodeStatus.DECOMMISSIONED));
        assertFalse(nft.isNodeOnline(tokenId));
    }

    function test_DecommissionNode_AlreadyDecommissioned_Reverts() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(owner);
        nft.decommissionNode(tokenId);

        vm.prank(owner);
        vm.expectRevert("GPUNodeNFT: already decommissioned");
        nft.decommissionNode(tokenId);
    }

    function test_DecommissionNode_OnlyOwner() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(operator);
        vm.expectRevert(GPUNodeNFT.NotOwner.selector);
        nft.decommissionNode(tokenId);
    }

    // =========================================================================
    // TRANSFER RESTRICTIONS
    // =========================================================================

    function test_Transfer_ActiveNode_Blocked() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GPUNodeNFT.TransferBlockedForActiveNode.selector, tokenId));
        nft.transferFrom(alice, bob, tokenId);
    }

    function test_Transfer_PausedNode_Succeeds() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        vm.prank(operator);
        nft.pauseNode(tokenId);

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    function test_Transfer_RegisteredNode_Succeeds() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    function test_Transfer_WhenPaused_Reverts() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(owner);
        nft.pause();

        vm.prank(alice);
        vm.expectRevert(GPUNodeNFT.ContractPaused.selector);
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // METRICS
    // =========================================================================

    function test_UpdateMetrics_Success() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        vm.prank(operator);
        nft.updateMetrics(tokenId, 8500, 50000e8, true);

        GPUNodeNFT.OperatingMetrics memory m = nft.getMetrics(tokenId);
        assertEq(m.utilizationBps, 8500);
        assertEq(m.revenueAccruedUsd, 50000e8);
        assertTrue(m.isOnline);
    }

    function test_UpdateMetrics_OverUtilization_Reverts() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        vm.prank(operator);
        vm.expectRevert("GPUNodeNFT: utilization > 100%");
        nft.updateMetrics(tokenId, 10001, 0, true);
    }

    function test_UpdateMetrics_OnlyOperator() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        vm.prank(alice);
        vm.expectRevert(GPUNodeNFT.NotOperator.selector);
        nft.updateMetrics(tokenId, 5000, 0, true);
    }

    function test_UpdateMetrics_RegisteredNode_Reverts() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(operator);
        vm.expectRevert("GPUNodeNFT: not active or paused");
        nft.updateMetrics(tokenId, 5000, 0, true);
    }

    function test_UptimeTracking_AccumulatesCorrectly() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(verifier);
        nft.verifyNode(tokenId);

        vm.prank(operator);
        nft.activateNode(tokenId);

        // Advance 1 hour
        vm.warp(block.timestamp + 3600);

        vm.prank(operator);
        nft.pauseNode(tokenId);

        GPUNodeNFT.OperatingMetrics memory m = nft.getMetrics(tokenId);
        assertEq(m.totalUptimeSeconds, 3600);
    }

    // =========================================================================
    // ROLES
    // =========================================================================

    function test_AddRemoveVerifier() public {
        address newVerifier = address(10);

        vm.prank(owner);
        nft.addVerifier(newVerifier);
        assertTrue(nft.verifiers(newVerifier));

        vm.prank(owner);
        nft.removeVerifier(newVerifier);
        assertFalse(nft.verifiers(newVerifier));
    }

    function test_AddRemoveOperator() public {
        address newOp = address(11);

        vm.prank(owner);
        nft.addOperator(newOp);
        assertTrue(nft.operators(newOp));

        vm.prank(owner);
        nft.removeOperator(newOp);
        assertFalse(nft.operators(newOp));
    }

    function test_TransferOwnership() public {
        vm.prank(owner);
        nft.transferOwnership(alice);
        assertEq(nft.owner(), alice);
    }

    function test_TransferOwnership_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(GPUNodeNFT.ZeroAddress.selector);
        nft.transferOwnership(address(0));
    }

    // =========================================================================
    // ERC721 BASICS
    // =========================================================================

    function test_Approve_And_TransferFrom() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(alice);
        nft.approve(bob, tokenId);

        assertEq(nft.getApproved(tokenId), bob);

        vm.prank(bob);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    function test_SetApprovalForAll() public {
        uint256 tokenId = _mintNode(alice);

        vm.prank(alice);
        nft.setApprovalForAll(bob, true);

        assertTrue(nft.isApprovedForAll(alice, bob));

        vm.prank(bob);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    function test_SupportsInterface() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd)); // ERC721
        assertTrue(nft.supportsInterface(0x01ffc9a7)); // ERC165
        assertFalse(nft.supportsInterface(0xdeadbeef));
    }

    // =========================================================================
    // FUZZ
    // =========================================================================

    function testFuzz_MintMultipleNodes(uint8 count) public {
        vm.assume(count > 0 && count <= 50);

        for (uint8 i = 0; i < count; i++) {
            _mintNode(alice);
        }

        assertEq(nft.balanceOf(alice), count);
        assertEq(nft.totalSupply(), count);
    }
}
