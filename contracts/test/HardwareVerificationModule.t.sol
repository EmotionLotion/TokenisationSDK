// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/compliance/modules/HardwareVerificationModule.sol";
import "../src/tokens/GPUNodeNFT.sol";

/**
 * @title HardwareVerificationModuleTest
 * @notice Tests for compliance checks, verification expiry, exempt addresses
 */
contract HardwareVerificationModuleTest is Test {
    HardwareVerificationModule public module;
    GPUNodeNFT public nft;

    address public owner = address(1);
    address public alice = address(4);
    address public bob = address(5);
    address public tokenAddress = address(10);

    function setUp() public {
        vm.startPrank(owner);

        nft = new GPUNodeNFT("GPU Nodes", "GPUN", "https://api.example.com/node/");

        module = new HardwareVerificationModule(
            owner,
            address(nft),
            30 days,
            true // requireOnline
        );

        // Register token => node mapping
        module.registerTokenNode(tokenAddress, 1);

        vm.stopPrank();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _mintAndVerifyNode() internal returns (uint256) {
        vm.startPrank(owner);
        uint256 tokenId = nft.mintNode(alice, _defaultNodeInfo());
        nft.verifyNode(tokenId);
        nft.activateNode(tokenId);
        vm.stopPrank();
        return tokenId;
    }

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

    // =========================================================================
    // MODULE CHECK
    // =========================================================================

    function test_ModuleCheck_VerifiedAndOnline_Passes() public {
        _mintAndVerifyNode();

        bool result = module.moduleCheck(alice, bob, 1000, tokenAddress);
        assertTrue(result);
    }

    function test_ModuleCheck_UnverifiedNode_Fails() public {
        // Mint but don't verify
        vm.prank(owner);
        nft.mintNode(alice, _defaultNodeInfo());

        bool result = module.moduleCheck(alice, bob, 1000, tokenAddress);
        assertFalse(result);
    }

    function test_ModuleCheck_OfflineNode_FailsWhenRequired() public {
        vm.startPrank(owner);
        uint256 tokenId = nft.mintNode(alice, _defaultNodeInfo());
        nft.verifyNode(tokenId);
        nft.activateNode(tokenId);
        nft.pauseNode(tokenId); // Goes offline
        vm.stopPrank();

        bool result = module.moduleCheck(alice, bob, 1000, tokenAddress);
        assertFalse(result);
    }

    function test_ModuleCheck_OfflineNode_PassesWhenNotRequired() public {
        vm.startPrank(owner);
        module.setRequireOnline(false);

        uint256 tokenId = nft.mintNode(alice, _defaultNodeInfo());
        nft.verifyNode(tokenId);
        nft.activateNode(tokenId);
        nft.pauseNode(tokenId);
        vm.stopPrank();

        bool result = module.moduleCheck(alice, bob, 1000, tokenAddress);
        assertTrue(result);
    }

    function test_ModuleCheck_ExpiredVerification_Fails() public {
        _mintAndVerifyNode();

        // Advance past verification expiry (30 days + 1 second)
        vm.warp(block.timestamp + 30 days + 1);

        bool result = module.moduleCheck(alice, bob, 1000, tokenAddress);
        assertFalse(result);
    }

    function test_ModuleCheck_RenewedVerification_Passes() public {
        _mintAndVerifyNode();

        // Advance 20 days
        vm.warp(block.timestamp + 20 days);

        // Renew verification check
        vm.prank(owner);
        nft.updateVerificationCheck(1);

        // Still within 30-day window from new check
        bool result = module.moduleCheck(alice, bob, 1000, tokenAddress);
        assertTrue(result);
    }

    function test_ModuleCheck_UnregisteredToken_Passes() public {
        // Token not registered in module => allow (nodeId = 0)
        bool result = module.moduleCheck(alice, bob, 1000, address(99));
        assertTrue(result);
    }

    function test_ModuleCheck_ZeroNFTAddress_Fails() public {
        vm.prank(owner);
        HardwareVerificationModule mod2 = new HardwareVerificationModule(
            owner, address(0), 30 days, true
        );
        vm.prank(owner);
        mod2.registerTokenNode(tokenAddress, 1);

        bool result = mod2.isNodeCompliant(1);
        assertFalse(result);
    }

    // =========================================================================
    // EXEMPT ADDRESSES
    // =========================================================================

    function test_ExemptAddress_BypassesCompliance() public {
        // Don't verify node — compliance would fail normally
        vm.prank(owner);
        nft.mintNode(alice, _defaultNodeInfo());

        vm.prank(owner);
        module.addExemptAddress(bob);

        // bob is exempt, so transfer to bob passes even with unverified node
        bool result = module.moduleCheck(alice, bob, 1000, tokenAddress);
        assertTrue(result);
    }

    function test_RemoveExemptAddress() public {
        vm.startPrank(owner);
        module.addExemptAddress(bob);
        assertTrue(module.isExempt(bob));

        module.removeExemptAddress(bob);
        assertFalse(module.isExempt(bob));
        vm.stopPrank();
    }

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    function test_SetGPUNodeNFT() public {
        address newNFT = address(20);
        vm.prank(owner);
        module.setGPUNodeNFT(newNFT);
        assertEq(module.gpuNodeNFT(), newNFT);
    }

    function test_SetVerificationExpiry() public {
        vm.prank(owner);
        module.setVerificationExpiry(7 days);
        assertEq(module.verificationExpirySeconds(), 7 days);
    }

    function test_SetRequireOnline() public {
        vm.prank(owner);
        module.setRequireOnline(false);
        assertFalse(module.requireOnline());
    }

    function test_DefaultVerificationExpiry() public {
        vm.prank(owner);
        HardwareVerificationModule mod2 = new HardwareVerificationModule(
            owner, address(nft), 0, false
        );
        assertEq(mod2.verificationExpirySeconds(), 30 days);
    }

    function test_OnlyOwner_Configuration() public {
        vm.startPrank(alice);

        vm.expectRevert();
        module.setGPUNodeNFT(address(0));

        vm.expectRevert();
        module.setVerificationExpiry(0);

        vm.expectRevert();
        module.setRequireOnline(false);

        vm.expectRevert();
        module.addExemptAddress(alice);

        vm.stopPrank();
    }

    // =========================================================================
    // MODULE INTERFACE (no-op functions)
    // =========================================================================

    function test_ModuleMint_NoOp() public {
        // Should not revert
        module.moduleMint(alice, 1000);
    }

    function test_ModuleBurn_NoOp() public {
        module.moduleBurn(alice, 1000);
    }

    function test_ModuleTransfer_NoOp() public {
        module.moduleTransfer(alice, bob, 1000);
    }

    function test_ModuleName() public view {
        assertEq(module.name(), "HardwareVerificationModule");
    }

    function test_IsPlugAndPlay() public view {
        assertTrue(module.isPlugAndPlay());
    }
}
