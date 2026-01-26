// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AhoyToken
 * @dev ERC20 Loyalty Token for the Ahoy Ecosystem
 * @notice Used across all verticals: COMET, PADI, MIRA, ELEMENT, BOLT
 *
 * Features:
 * - Mintable by authorized issuers (vertical contracts)
 * - Burnable for rewards redemption
 * - Pausable for emergencies
 * - Permit for gasless approvals (EIP-2612)
 */
contract AhoyToken {
    // ============================================================================
    // ERC20 STATE
    // ============================================================================

    string public constant name = "AHOY Loyalty Token";
    string public constant symbol = "AHOY";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ============================================================================
    // ADMIN STATE
    // ============================================================================

    address public owner;
    mapping(address => bool) public minters;      // Can mint tokens (vertical contracts)
    mapping(address => bool) public burners;      // Can burn tokens (redemption contracts)
    bool public paused;

    // Minting limits per vertical
    mapping(address => uint256) public mintingLimit;
    mapping(address => uint256) public mintedAmount;

    // ============================================================================
    // PERMIT STATE (EIP-2612)
    // ============================================================================

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    mapping(address => uint256) public nonces;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterAdded(address indexed minter, uint256 limit);
    event MinterRemoved(address indexed minter);
    event Mint(address indexed to, uint256 amount, address indexed minter, string reason);
    event Burn(address indexed from, uint256 amount, string reason);
    event Paused(address account);
    event Unpaused(address account);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error NotAuthorized();
    error IsPaused();
    error InsufficientBalance();
    error InsufficientAllowance();
    error MintingLimitExceeded();
    error ExpiredDeadline();
    error InvalidSignature();
    error ZeroAddress();

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    modifier onlyMinter() {
        if (!minters[msg.sender] && msg.sender != owner) revert NotAuthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor() {
        owner = msg.sender;
        minters[msg.sender] = true;
        mintingLimit[msg.sender] = type(uint256).max;

        // EIP-712 Domain Separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ============================================================================
    // ERC20 CORE
    // ============================================================================

    function transfer(address to, uint256 amount) external whenNotPaused returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external whenNotPaused returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();

        if (msg.sender != from) {
            uint256 allowed = allowance[from][msg.sender];
            if (allowed != type(uint256).max) {
                if (allowed < amount) revert InsufficientAllowance();
                allowance[from][msg.sender] = allowed - amount;
            }
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }

    // ============================================================================
    // MINTING
    // ============================================================================

    /**
     * @notice Mint AHOY tokens to an address
     * @param to Recipient address
     * @param amount Amount to mint (18 decimals)
     * @param reason Reason for minting (e.g., "DELIVERY_COMPLETED", "SAFETY_BONUS")
     */
    function mint(address to, uint256 amount, string calldata reason) external onlyMinter whenNotPaused {
        if (to == address(0)) revert ZeroAddress();

        // Check minting limit
        if (msg.sender != owner) {
            uint256 newMinted = mintedAmount[msg.sender] + amount;
            if (newMinted > mintingLimit[msg.sender]) revert MintingLimitExceeded();
            mintedAmount[msg.sender] = newMinted;
        }

        totalSupply += amount;
        balanceOf[to] += amount;

        emit Transfer(address(0), to, amount);
        emit Mint(to, amount, msg.sender, reason);
    }

    /**
     * @notice Batch mint to multiple addresses
     */
    function mintBatch(
        address[] calldata recipients,
        uint256[] calldata amounts,
        string calldata reason
    ) external onlyMinter whenNotPaused {
        require(recipients.length == amounts.length, "Length mismatch");

        uint256 totalAmount;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            totalAmount += amounts[i];
        }

        // Check minting limit
        if (msg.sender != owner) {
            uint256 newMinted = mintedAmount[msg.sender] + totalAmount;
            if (newMinted > mintingLimit[msg.sender]) revert MintingLimitExceeded();
            mintedAmount[msg.sender] = newMinted;
        }

        totalSupply += totalAmount;

        for (uint256 i = 0; i < recipients.length; i++) {
            balanceOf[recipients[i]] += amounts[i];
            emit Transfer(address(0), recipients[i], amounts[i]);
        }

        emit Mint(address(0), totalAmount, msg.sender, reason);
    }

    // ============================================================================
    // BURNING
    // ============================================================================

    /**
     * @notice Burn AHOY tokens from caller's balance
     * @param amount Amount to burn
     * @param reason Reason for burning (e.g., "PRIORITY_DISPATCH", "PREMIUM_ACCESS")
     */
    function burn(uint256 amount, string calldata reason) external whenNotPaused {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;

        emit Transfer(msg.sender, address(0), amount);
        emit Burn(msg.sender, amount, reason);
    }

    /**
     * @notice Burn AHOY tokens from another address (requires approval)
     */
    function burnFrom(address from, uint256 amount, string calldata reason) external whenNotPaused {
        if (balanceOf[from] < amount) revert InsufficientBalance();

        if (msg.sender != from) {
            uint256 allowed = allowance[from][msg.sender];
            if (allowed != type(uint256).max) {
                if (allowed < amount) revert InsufficientAllowance();
                allowance[from][msg.sender] = allowed - amount;
            }
        }

        balanceOf[from] -= amount;
        totalSupply -= amount;

        emit Transfer(from, address(0), amount);
        emit Burn(from, amount, reason);
    }

    // ============================================================================
    // PERMIT (EIP-2612)
    // ============================================================================

    function permit(
        address _owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (block.timestamp > deadline) revert ExpiredDeadline();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        PERMIT_TYPEHASH,
                        _owner,
                        spender,
                        value,
                        nonces[_owner]++,
                        deadline
                    )
                )
            )
        );

        address recoveredAddress = ecrecover(digest, v, r, s);
        if (recoveredAddress == address(0) || recoveredAddress != _owner) {
            revert InvalidSignature();
        }

        allowance[_owner][spender] = value;
        emit Approval(_owner, spender, value);
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    function addMinter(address minter, uint256 limit) external onlyOwner {
        minters[minter] = true;
        mintingLimit[minter] = limit;
        emit MinterAdded(minter, limit);
    }

    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }

    function updateMintingLimit(address minter, uint256 newLimit) external onlyOwner {
        mintingLimit[minter] = newLimit;
    }

    function resetMintedAmount(address minter) external onlyOwner {
        mintedAmount[minter] = 0;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    function getRemainingMintingLimit(address minter) external view returns (uint256) {
        if (minter == owner) return type(uint256).max;
        if (mintingLimit[minter] <= mintedAmount[minter]) return 0;
        return mintingLimit[minter] - mintedAmount[minter];
    }
}
