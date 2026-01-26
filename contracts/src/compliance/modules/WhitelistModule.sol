// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WhitelistModule
 * @notice Compliance module for whitelist-based transfer restrictions
 * @dev Part of ERC-3643 (T-REX) compliance framework
 *
 * Features:
 * - Configurable whitelist for senders and/or receivers
 * - Batch whitelist management
 * - Whitelist operators for delegated management
 * - Whitelist expiration support
 * - Integration with identity registry
 *
 * Use cases:
 * - Accredited investor restrictions
 * - KYC-verified addresses only
 * - Approved counterparty lists
 * - Institutional investor programs
 */
contract WhitelistModule is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event AddressWhitelisted(address indexed account, uint256 expiresAt);
    event AddressRemovedFromWhitelist(address indexed account);
    event WhitelistOperatorSet(address indexed operator, bool authorized);
    event WhitelistModeSet(bool checkSender, bool checkReceiver);
    event IdentityRegistrySet(address indexed registry);

    // ============================================================================
    // Structs
    // ============================================================================

    struct WhitelistEntry {
        bool isWhitelisted;
        uint256 addedAt;
        uint256 expiresAt;     // 0 = never expires
        address addedBy;
        string reason;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Module name
    string public constant name = "WhitelistModule";

    /// @notice Whether module is plug-and-play
    bool public constant isPlugAndPlay = true;

    /// @notice Bound token address
    address public boundToken;

    /// @notice Identity registry for automatic whitelist based on KYC
    address public identityRegistry;

    /// @notice Whether to check sender against whitelist
    bool public checkSender;

    /// @notice Whether to check receiver against whitelist
    bool public checkReceiver;

    /// @notice Use identity registry for whitelist (instead of manual)
    bool public useIdentityRegistry;

    /// @notice Whitelist entries per address
    mapping(address => WhitelistEntry) public whitelist;

    /// @notice Authorized whitelist operators
    mapping(address => bool) public isOperator;

    /// @notice Array of whitelisted addresses for enumeration
    address[] private _whitelistedAddresses;

    /// @notice Index of each address in the array
    mapping(address => uint256) private _addressIndex;

    /// @notice Whether address is in array
    mapping(address => bool) private _isInArray;

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyOperatorOrOwner() {
        require(
            msg.sender == owner() || isOperator[msg.sender],
            "Not operator or owner"
        );
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address initialOwner,
        bool _checkSender,
        bool _checkReceiver
    ) Ownable(initialOwner) {
        checkSender = _checkSender;
        checkReceiver = _checkReceiver;
        emit WhitelistModeSet(_checkSender, _checkReceiver);
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Set the bound token
     * @param token Token address
     */
    function setToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        boundToken = token;
    }

    /**
     * @notice Set identity registry for automatic whitelist
     * @param registry Registry address
     */
    function setIdentityRegistry(address registry) external onlyOwner {
        identityRegistry = registry;
        emit IdentityRegistrySet(registry);
    }

    /**
     * @notice Configure whitelist mode
     * @param _checkSender Whether to check sender
     * @param _checkReceiver Whether to check receiver
     */
    function setWhitelistMode(bool _checkSender, bool _checkReceiver) external onlyOwner {
        checkSender = _checkSender;
        checkReceiver = _checkReceiver;
        emit WhitelistModeSet(_checkSender, _checkReceiver);
    }

    /**
     * @notice Enable/disable identity registry integration
     * @param enabled Whether to use identity registry
     */
    function setUseIdentityRegistry(bool enabled) external onlyOwner {
        useIdentityRegistry = enabled;
    }

    /**
     * @notice Set operator authorization
     * @param operator Operator address
     * @param authorized Whether authorized
     */
    function setOperator(address operator, bool authorized) external onlyOwner {
        isOperator[operator] = authorized;
        emit WhitelistOperatorSet(operator, authorized);
    }

    // ============================================================================
    // Whitelist Management
    // ============================================================================

    /**
     * @notice Add address to whitelist
     * @param account Address to whitelist
     * @param expiresAt Expiration timestamp (0 = never)
     * @param reason Reason for whitelisting
     */
    function addToWhitelist(
        address account,
        uint256 expiresAt,
        string calldata reason
    ) external onlyOperatorOrOwner {
        require(account != address(0), "Invalid address");
        require(expiresAt == 0 || expiresAt > block.timestamp, "Already expired");

        whitelist[account] = WhitelistEntry({
            isWhitelisted: true,
            addedAt: block.timestamp,
            expiresAt: expiresAt,
            addedBy: msg.sender,
            reason: reason
        });

        // Add to enumerable array if not already present
        if (!_isInArray[account]) {
            _addressIndex[account] = _whitelistedAddresses.length;
            _whitelistedAddresses.push(account);
            _isInArray[account] = true;
        }

        emit AddressWhitelisted(account, expiresAt);
    }

    /**
     * @notice Add multiple addresses to whitelist
     * @param accounts Addresses to whitelist
     * @param expiresAt Expiration timestamp for all
     * @param reason Reason for whitelisting
     */
    function addToWhitelistBatch(
        address[] calldata accounts,
        uint256 expiresAt,
        string calldata reason
    ) external onlyOperatorOrOwner {
        require(expiresAt == 0 || expiresAt > block.timestamp, "Already expired");

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            if (account == address(0)) continue;

            whitelist[account] = WhitelistEntry({
                isWhitelisted: true,
                addedAt: block.timestamp,
                expiresAt: expiresAt,
                addedBy: msg.sender,
                reason: reason
            });

            if (!_isInArray[account]) {
                _addressIndex[account] = _whitelistedAddresses.length;
                _whitelistedAddresses.push(account);
                _isInArray[account] = true;
            }

            emit AddressWhitelisted(account, expiresAt);
        }
    }

    /**
     * @notice Remove address from whitelist
     * @param account Address to remove
     */
    function removeFromWhitelist(address account) external onlyOperatorOrOwner {
        require(whitelist[account].isWhitelisted, "Not whitelisted");

        whitelist[account].isWhitelisted = false;

        // Remove from array (swap with last)
        if (_isInArray[account]) {
            uint256 index = _addressIndex[account];
            uint256 lastIndex = _whitelistedAddresses.length - 1;

            if (index != lastIndex) {
                address lastAddress = _whitelistedAddresses[lastIndex];
                _whitelistedAddresses[index] = lastAddress;
                _addressIndex[lastAddress] = index;
            }

            _whitelistedAddresses.pop();
            delete _addressIndex[account];
            _isInArray[account] = false;
        }

        emit AddressRemovedFromWhitelist(account);
    }

    /**
     * @notice Remove multiple addresses from whitelist
     * @param accounts Addresses to remove
     */
    function removeFromWhitelistBatch(address[] calldata accounts) external onlyOperatorOrOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            if (!whitelist[account].isWhitelisted) continue;

            whitelist[account].isWhitelisted = false;

            if (_isInArray[account]) {
                uint256 index = _addressIndex[account];
                uint256 lastIndex = _whitelistedAddresses.length - 1;

                if (index != lastIndex) {
                    address lastAddress = _whitelistedAddresses[lastIndex];
                    _whitelistedAddresses[index] = lastAddress;
                    _addressIndex[lastAddress] = index;
                }

                _whitelistedAddresses.pop();
                delete _addressIndex[account];
                _isInArray[account] = false;
            }

            emit AddressRemovedFromWhitelist(account);
        }
    }

    // ============================================================================
    // Compliance Module Interface
    // ============================================================================

    /**
     * @notice Check if transfer is compliant with whitelist requirements
     * @param from Sender address
     * @param to Recipient address
     * @return Whether compliant
     */
    function moduleCheck(
        address from,
        address to,
        uint256 /* value */,
        address /* token */
    ) external view returns (bool) {
        // If no checks are configured, allow all
        if (!checkSender && !checkReceiver) {
            return true;
        }

        // Check sender if required
        if (checkSender && from != address(0)) {
            if (!_isAddressWhitelisted(from)) {
                return false;
            }
        }

        // Check receiver if required
        if (checkReceiver && to != address(0)) {
            if (!_isAddressWhitelisted(to)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Called when tokens are minted
     */
    function moduleMint(address /* to */, uint256 /* value */) external pure {
        // No action needed
    }

    /**
     * @notice Called when tokens are burned
     */
    function moduleBurn(address /* from */, uint256 /* value */) external pure {
        // No action needed
    }

    /**
     * @notice Called when tokens are transferred
     */
    function moduleTransfer(
        address /* from */,
        address /* to */,
        uint256 /* value */
    ) external pure {
        // No action needed (check happens in moduleCheck)
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Check if address is whitelisted
     */
    function _isAddressWhitelisted(address account) internal view returns (bool) {
        // Check identity registry first if enabled
        if (useIdentityRegistry && identityRegistry != address(0)) {
            if (_checkIdentityRegistry(account)) {
                return true;
            }
        }

        // Check manual whitelist
        WhitelistEntry storage entry = whitelist[account];

        if (!entry.isWhitelisted) {
            return false;
        }

        // Check expiration
        if (entry.expiresAt != 0 && block.timestamp > entry.expiresAt) {
            return false;
        }

        return true;
    }

    /**
     * @notice Check identity registry for verified status
     */
    function _checkIdentityRegistry(address account) internal view returns (bool) {
        if (identityRegistry == address(0)) {
            return false;
        }

        // Call: function isVerified(address) returns (bool)
        (bool success, bytes memory data) = identityRegistry.staticcall(
            abi.encodeWithSignature("isVerified(address)", account)
        );

        if (success && data.length >= 32) {
            return abi.decode(data, (bool));
        }

        return false;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Check if address is currently whitelisted
     * @param account Address to check
     * @return Whether whitelisted
     */
    function isWhitelisted(address account) external view returns (bool) {
        return _isAddressWhitelisted(account);
    }

    /**
     * @notice Get whitelist entry for an address
     * @param account Address to check
     * @return Whitelist entry
     */
    function getWhitelistEntry(address account) external view returns (WhitelistEntry memory) {
        return whitelist[account];
    }

    /**
     * @notice Get all whitelisted addresses
     * @return Array of addresses
     */
    function getWhitelistedAddresses() external view returns (address[] memory) {
        return _whitelistedAddresses;
    }

    /**
     * @notice Get whitelisted addresses with pagination
     * @param offset Start index
     * @param limit Max number to return
     * @return addresses Array of addresses
     * @return total Total count
     */
    function getWhitelistedAddressesPaginated(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory addresses, uint256 total) {
        total = _whitelistedAddresses.length;

        if (offset >= total) {
            return (new address[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        addresses = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            addresses[i - offset] = _whitelistedAddresses[i];
        }
    }

    /**
     * @notice Get count of whitelisted addresses
     * @return Count
     */
    function getWhitelistCount() external view returns (uint256) {
        return _whitelistedAddresses.length;
    }

    /**
     * @notice Check if whitelist entry is expired
     * @param account Address to check
     * @return Whether expired
     */
    function isExpired(address account) external view returns (bool) {
        WhitelistEntry storage entry = whitelist[account];
        if (!entry.isWhitelisted) {
            return true;
        }
        if (entry.expiresAt == 0) {
            return false;
        }
        return block.timestamp > entry.expiresAt;
    }

    /**
     * @notice Get time until whitelist entry expires
     * @param account Address to check
     * @return Seconds until expiration (0 if already expired, max uint if never expires)
     */
    function timeUntilExpiration(address account) external view returns (uint256) {
        WhitelistEntry storage entry = whitelist[account];

        if (!entry.isWhitelisted) {
            return 0;
        }

        if (entry.expiresAt == 0) {
            return type(uint256).max;
        }

        if (block.timestamp >= entry.expiresAt) {
            return 0;
        }

        return entry.expiresAt - block.timestamp;
    }
}
