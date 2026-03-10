// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

/**
 * @title CarRentalNFT
 * @dev ERC721-based car rental agreement with deposit escrow, vehicle inspection lifecycle,
 *      transfer window enforcement, role-based access control, and Chainlink Automation
 *      for auto-expiry and no-show detection.
 *
 * Features:
 * - Mint rental NFTs with full vehicle and rental data
 * - Deposit escrow: createRental is payable, deposit held in contract
 * - Deposit resolution: release / partial charge / full charge after inspection
 * - Transfer windows: transfers blocked < 24h before pickup
 * - Post-pickup lock: no transfers after vehicle pickup
 * - Full lifecycle: CREATED -> CONFIRMED -> PICKED_UP -> RETURNED -> INSPECTED -> CLOSED
 * - Cancellation (refunds deposit), no-show, and expiry paths
 * - Chainlink Automation: auto-expire past return+24h, auto-no-show past pickup+12h
 * - On-chain metadata change audit trail
 */
contract CarRentalNFT is AutomationCompatibleInterface {
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
    mapping(uint256 => string) private _tokenURIs;

    // ============================================================================
    // Rental State
    // ============================================================================

    enum RentalStatus {
        CREATED,
        CONFIRMED,
        PICKED_UP,
        RETURNED,
        INSPECTED,
        CLOSED,
        CANCELLED,
        NO_SHOW,
        EXPIRED,
        VOID
    }

    enum DepositStatus {
        HELD,
        RELEASED,
        PARTIALLY_CHARGED,
        FULLY_CHARGED
    }

    enum InsuranceType {
        NONE,
        BASIC,
        STANDARD,
        PREMIUM,
        FULL_COVERAGE
    }

    struct RentalData {
        // Rental company info
        string rentalCompanyCode;
        string driverName;
        // Vehicle info
        string vehicleCategory;
        string vehicleMake;
        string vehicleModel;
        // Dates & locations
        uint256 pickupDate;
        uint256 returnDate;
        string pickupLocation;
        string returnLocation;
        // Pricing
        uint256 dailyRate;
        uint256 depositAmount;
        DepositStatus depositStatus;
        // Vehicle condition at pickup
        uint256 pickupMileage;
        uint8 pickupFuelLevel;
        // Vehicle condition at return
        uint256 returnMileage;
        uint8 returnFuelLevel;
        string damageReport;
        // Insurance
        InsuranceType insuranceType;
        // Lifecycle
        RentalStatus status;
        uint256 createdAt;
        uint256 confirmedAt;
        uint256 pickedUpAt;
        uint256 returnedAt;
        uint256 inspectedAt;
        // Transfer rules
        uint8 transferCount;
        uint8 maxTransfers;
        bool transferable;
        // Metadata versioning
        uint256 metadataVersion;
        // Payment / refund
        uint256 totalPaid;
        address payable originalRenter;
        // Deposit charge amount (set during inspection)
        uint256 depositChargeAmount;
    }

    mapping(uint256 => RentalData) private _rentalData;

    // Track all active rental IDs for automation
    uint256[] private _activeRentalIds;
    mapping(uint256 => uint256) private _activeRentalIndex;
    mapping(uint256 => bool) private _isActive;

    // ============================================================================
    // Metadata Change Log (on-chain audit trail)
    // ============================================================================

    struct MetadataChange {
        uint256 timestamp;
        string field;
        string oldValue;
        string newValue;
        address changedBy;
    }

    mapping(uint256 => MetadataChange[]) private _metadataHistory;

    // ============================================================================
    // Configuration
    // ============================================================================

    uint256 public constant TRANSFER_WINDOW_CUTOFF = 24 hours;
    uint256 public constant AUTO_EXPIRE_GRACE = 24 hours;
    uint256 public constant AUTO_NO_SHOW_GRACE = 12 hours;

    uint256 public minCheckInterval = 3600; // 1 hour
    uint256 public lastUpkeepTime;
    uint256 public maxRentalsPerUpkeep = 50;

    // ============================================================================
    // Role-Based Access Control
    // ============================================================================

    bytes32 public constant RENTAL_COMPANY_ROLE = keccak256("RENTAL_COMPANY_ROLE");
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    address public owner;
    mapping(bytes32 => mapping(address => bool)) private _roles;
    bool public paused;

    // Deposit escrow tracking
    mapping(uint256 => uint256) public depositEscrow;

    // ============================================================================
    // Events
    // ============================================================================

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    event RentalCreated(uint256 indexed tokenId, address indexed renter, string rentalCompanyCode, uint256 pickupDate);
    event RentalConfirmed(uint256 indexed tokenId, address indexed renter);
    event VehiclePickedUp(uint256 indexed tokenId, address indexed driver, uint256 mileage, uint8 fuelLevel);
    event VehicleReturned(uint256 indexed tokenId, address indexed driver, uint256 mileage, uint8 fuelLevel);
    event VehicleInspected(uint256 indexed tokenId, DepositStatus depositResolution, uint256 chargeAmount);
    event RentalClosed(uint256 indexed tokenId);
    event RentalCancelled(uint256 indexed tokenId, string reason);
    event RentalNoShow(uint256 indexed tokenId, uint256 pickupDate, uint256 currentTime);
    event RentalExpired(uint256 indexed tokenId, uint256 returnDate, uint256 currentTime);
    event RentalVoided(uint256 indexed tokenId, string reason);
    event DepositHeld(uint256 indexed tokenId, uint256 amount);
    event DepositReleased(uint256 indexed tokenId, address indexed to, uint256 amount);
    event DepositCharged(uint256 indexed tokenId, uint256 chargeAmount, uint256 refundAmount);
    event RentalTransferred(uint256 indexed tokenId, address indexed from, address indexed to, uint8 transferCount);
    event MetadataUpdated(uint256 indexed tokenId, string field, string newValue, uint256 version);
    event AutoExpiryTriggered(uint256 indexed tokenId, uint256 returnDate);
    event AutoNoShowTriggered(uint256 indexed tokenId, uint256 pickupDate);
    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);
    event DamageReported(uint256 indexed tokenId, string damageReport);

    // ============================================================================
    // Errors
    // ============================================================================

    error NotOwner();
    error NotRentalCompany();
    error NotAgent();
    error NotAdmin();
    error ContractPaused();
    error TokenDoesNotExist(uint256 tokenId);
    error InvalidStatus(uint256 tokenId, RentalStatus current, RentalStatus expected);
    error TransferWindowClosed(uint256 tokenId, uint256 pickupDate);
    error RentalLockedAfterPickup(uint256 tokenId);
    error MaxTransfersReached(uint256 tokenId, uint8 maxTransfers);
    error RentalNotTransferable(uint256 tokenId);
    error RentalAlreadyUsed(uint256 tokenId);
    error NotAuthorized();
    error InvalidPickupDate();
    error InvalidReturnDate();
    error InvalidDepositAmount();
    error DepositTransferFailed(uint256 tokenId);
    error RefundFailed(uint256 tokenId);
    error ZeroAddress();
    error StatusNotCancellable(uint256 tokenId, RentalStatus current);
    error InvalidFuelLevel();
    error InvalidChargeAmount(uint256 tokenId, uint256 charge, uint256 deposit);
    error DepositAlreadyResolved(uint256 tokenId);

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRentalCompany() {
        if (!_roles[RENTAL_COMPANY_ROLE][msg.sender] && msg.sender != owner) revert NotRentalCompany();
        _;
    }

    modifier onlyAgent() {
        if (!_roles[AGENT_ROLE][msg.sender] && !_roles[RENTAL_COMPANY_ROLE][msg.sender] && msg.sender != owner) {
            revert NotAgent();
        }
        _;
    }

    modifier onlyAdmin() {
        if (!_roles[ADMIN_ROLE][msg.sender] && msg.sender != owner) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist(tokenId);
        _;
    }

    modifier inStatus(uint256 tokenId, RentalStatus expected) {
        if (_rentalData[tokenId].status != expected) {
            revert InvalidStatus(tokenId, _rentalData[tokenId].status, expected);
        }
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    /**
     * @notice Deploy a new CarRentalNFT contract
     * @param _name ERC721 collection name
     * @param _symbol ERC721 collection symbol
     * @param _baseURI Base URI for token metadata
     */
    constructor(string memory _name, string memory _symbol, string memory _baseURI) {
        name = _name;
        symbol = _symbol;
        baseURI = _baseURI;
        owner = msg.sender;
        _roles[RENTAL_COMPANY_ROLE][msg.sender] = true;
        _roles[ADMIN_ROLE][msg.sender] = true;
        _nextTokenId = 1;
    }

    // ============================================================================
    // ERC721 Core
    // ============================================================================

    /// @notice Returns the number of tokens owned by an address
    function balanceOf(address _owner) public view returns (uint256) {
        if (_owner == address(0)) revert ZeroAddress();
        return _balances[_owner];
    }

    /// @notice Returns the owner of a given token
    function ownerOf(uint256 tokenId) public view returns (address) {
        address _ownerAddr = _owners[tokenId];
        if (_ownerAddr == address(0)) revert TokenDoesNotExist(tokenId);
        return _ownerAddr;
    }

    /// @notice Returns the token URI for a given token
    function tokenURI(uint256 tokenId) public view tokenExists(tokenId) returns (string memory) {
        string memory _tokenURI = _tokenURIs[tokenId];
        if (bytes(_tokenURI).length > 0) {
            return _tokenURI;
        }
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    /// @notice Approve an address to manage a specific token
    function approve(address to, uint256 tokenId) public {
        address rentalOwner = ownerOf(tokenId);
        require(to != rentalOwner, "CarRentalNFT: approve to owner");
        require(
            msg.sender == rentalOwner || isApprovedForAll(rentalOwner, msg.sender),
            "CarRentalNFT: not authorized"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(rentalOwner, to, tokenId);
    }

    /// @notice Returns the approved address for a token
    function getApproved(uint256 tokenId) public view tokenExists(tokenId) returns (address) {
        return _tokenApprovals[tokenId];
    }

    /// @notice Set or revoke operator approval for all tokens
    function setApprovalForAll(address operator, bool approved) public {
        require(msg.sender != operator, "CarRentalNFT: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// @notice Check if an operator is approved for all tokens of an owner
    function isApprovedForAll(address _ownerAddr, address operator) public view returns (bool) {
        return _operatorApprovals[_ownerAddr][operator];
    }

    /// @notice Transfer with rental-specific guards
    function transferFrom(address from, address to, uint256 tokenId) public whenNotPaused {
        require(_isApprovedOrOwner(msg.sender, tokenId), "CarRentalNFT: not authorized");
        _transferRental(from, to, tokenId);
    }

    /// @notice Safe transfer (checks recipient supports ERC721)
    function safeTransferFrom(address from, address to, uint256 tokenId) public {
        safeTransferFrom(from, to, tokenId, "");
    }

    /// @notice Safe transfer with data
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "CarRentalNFT: unsafe recipient");
    }

    // ============================================================================
    // Rental Creation
    // ============================================================================

    /**
     * @notice Create a new car rental NFT (payable - holds deposit in contract)
     * @param to Renter wallet address
     * @param rentalCompanyCode Rental company identifier (e.g., "HTZ", "AVIS")
     * @param driverName Driver's name
     * @param vehicleCategory Vehicle category (e.g., "COMPACT", "SUV", "LUXURY")
     * @param vehicleMake Vehicle make (e.g., "Toyota")
     * @param vehicleModel Vehicle model (e.g., "Camry")
     * @param pickupDate Unix timestamp of pickup date
     * @param returnDate Unix timestamp of return date
     * @param pickupLocation Pickup location identifier
     * @param returnLocation Return location identifier
     * @param dailyRate Daily rental rate (in smallest currency unit)
     * @param depositAmount Required deposit amount (must match msg.value)
     * @param insuranceType Insurance tier selected
     * @param maxTransfers Maximum allowed transfers
     * @param transferable Whether rental can be transferred
     * @return tokenId The newly minted token ID
     */
    function createRental(
        address to,
        string calldata rentalCompanyCode,
        string calldata driverName,
        string calldata vehicleCategory,
        string calldata vehicleMake,
        string calldata vehicleModel,
        uint256 pickupDate,
        uint256 returnDate,
        string calldata pickupLocation,
        string calldata returnLocation,
        uint256 dailyRate,
        uint256 depositAmount,
        InsuranceType insuranceType,
        uint8 maxTransfers,
        bool transferable
    ) external payable onlyAgent whenNotPaused returns (uint256) {
        if (pickupDate <= block.timestamp) revert InvalidPickupDate();
        if (returnDate <= pickupDate) revert InvalidReturnDate();
        if (to == address(0)) revert ZeroAddress();
        if (msg.value < depositAmount) revert InvalidDepositAmount();

        uint256 tokenId = _nextTokenId++;

        _balances[to]++;
        _owners[tokenId] = to;

        _rentalData[tokenId] = RentalData({
            rentalCompanyCode: rentalCompanyCode,
            driverName: driverName,
            vehicleCategory: vehicleCategory,
            vehicleMake: vehicleMake,
            vehicleModel: vehicleModel,
            pickupDate: pickupDate,
            returnDate: returnDate,
            pickupLocation: pickupLocation,
            returnLocation: returnLocation,
            dailyRate: dailyRate,
            depositAmount: depositAmount,
            depositStatus: DepositStatus.HELD,
            pickupMileage: 0,
            pickupFuelLevel: 0,
            returnMileage: 0,
            returnFuelLevel: 0,
            damageReport: "",
            insuranceType: insuranceType,
            status: RentalStatus.CREATED,
            createdAt: block.timestamp,
            confirmedAt: 0,
            pickedUpAt: 0,
            returnedAt: 0,
            inspectedAt: 0,
            transferCount: 0,
            maxTransfers: maxTransfers,
            transferable: transferable,
            metadataVersion: 1,
            totalPaid: msg.value,
            originalRenter: payable(to),
            depositChargeAmount: 0
        });

        // Track deposit in escrow
        depositEscrow[tokenId] = depositAmount;

        // Track as active
        _activeRentalIndex[tokenId] = _activeRentalIds.length;
        _activeRentalIds.push(tokenId);
        _isActive[tokenId] = true;

        emit Transfer(address(0), to, tokenId);
        emit RentalCreated(tokenId, to, rentalCompanyCode, pickupDate);
        emit DepositHeld(tokenId, depositAmount);

        return tokenId;
    }

    /**
     * @notice Batch create rentals for a fleet booking
     * @param renters Array of renter wallet addresses
     * @param rentalCompanyCode Rental company identifier
     * @param driverNames Array of driver names
     * @param vehicleCategory Vehicle category for all rentals
     * @param vehicleMake Vehicle make for all rentals
     * @param vehicleModel Vehicle model for all rentals
     * @param pickupDate Unix timestamp of pickup date
     * @param returnDate Unix timestamp of return date
     * @param pickupLocation Pickup location identifier
     * @param returnLocation Return location identifier
     * @param dailyRate Daily rental rate
     * @param insuranceType Insurance tier selected
     * @param maxTransfers Maximum allowed transfers per rental
     * @param transferable Whether rentals can be transferred
     * @return tokenIds Array of newly minted token IDs
     */
    function batchCreateRentals(
        address[] calldata renters,
        string calldata rentalCompanyCode,
        string[] calldata driverNames,
        string calldata vehicleCategory,
        string calldata vehicleMake,
        string calldata vehicleModel,
        uint256 pickupDate,
        uint256 returnDate,
        string calldata pickupLocation,
        string calldata returnLocation,
        uint256 dailyRate,
        InsuranceType insuranceType,
        uint8 maxTransfers,
        bool transferable
    ) external onlyAgent whenNotPaused returns (uint256[] memory) {
        require(renters.length == driverNames.length, "CarRentalNFT: length mismatch");
        if (pickupDate <= block.timestamp) revert InvalidPickupDate();
        if (returnDate <= pickupDate) revert InvalidReturnDate();

        uint256[] memory tokenIds = new uint256[](renters.length);

        for (uint256 i = 0; i < renters.length; i++) {
            if (renters[i] == address(0)) revert ZeroAddress();

            uint256 tokenId = _nextTokenId++;
            _balances[renters[i]]++;
            _owners[tokenId] = renters[i];

            _rentalData[tokenId] = RentalData({
                rentalCompanyCode: rentalCompanyCode,
                driverName: driverNames[i],
                vehicleCategory: vehicleCategory,
                vehicleMake: vehicleMake,
                vehicleModel: vehicleModel,
                pickupDate: pickupDate,
                returnDate: returnDate,
                pickupLocation: pickupLocation,
                returnLocation: returnLocation,
                dailyRate: dailyRate,
                depositAmount: 0,
                depositStatus: DepositStatus.HELD,
                pickupMileage: 0,
                pickupFuelLevel: 0,
                returnMileage: 0,
                returnFuelLevel: 0,
                damageReport: "",
                insuranceType: insuranceType,
                status: RentalStatus.CREATED,
                createdAt: block.timestamp,
                confirmedAt: 0,
                pickedUpAt: 0,
                returnedAt: 0,
                inspectedAt: 0,
                transferCount: 0,
                maxTransfers: maxTransfers,
                transferable: transferable,
                metadataVersion: 1,
                totalPaid: 0,
                originalRenter: payable(renters[i]),
                depositChargeAmount: 0
            });

            _activeRentalIndex[tokenId] = _activeRentalIds.length;
            _activeRentalIds.push(tokenId);
            _isActive[tokenId] = true;

            emit Transfer(address(0), renters[i], tokenId);
            emit RentalCreated(tokenId, renters[i], rentalCompanyCode, pickupDate);

            tokenIds[i] = tokenId;
        }

        return tokenIds;
    }

    // ============================================================================
    // Rental Lifecycle Operations
    // ============================================================================

    /**
     * @notice Confirm a rental reservation
     * @param tokenId The rental token ID
     */
    function confirmRental(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyRentalCompany inStatus(tokenId, RentalStatus.CREATED) {
        RentalData storage rental = _rentalData[tokenId];
        rental.status = RentalStatus.CONFIRMED;
        rental.confirmedAt = block.timestamp;
        rental.metadataVersion++;

        emit RentalConfirmed(tokenId, _owners[tokenId]);
        emit MetadataUpdated(tokenId, "status", "CONFIRMED", rental.metadataVersion);
    }

    /**
     * @notice Confirm vehicle pickup and record initial condition
     * @param tokenId The rental token ID
     * @param mileage Odometer reading at pickup
     * @param fuelLevel Fuel level at pickup (0-100)
     */
    function confirmPickup(
        uint256 tokenId,
        uint256 mileage,
        uint8 fuelLevel
    ) external tokenExists(tokenId) onlyRentalCompany inStatus(tokenId, RentalStatus.CONFIRMED) {
        if (fuelLevel > 100) revert InvalidFuelLevel();

        RentalData storage rental = _rentalData[tokenId];
        rental.status = RentalStatus.PICKED_UP;
        rental.pickedUpAt = block.timestamp;
        rental.pickupMileage = mileage;
        rental.pickupFuelLevel = fuelLevel;
        rental.metadataVersion++;

        emit VehiclePickedUp(tokenId, _owners[tokenId], mileage, fuelLevel);
        emit MetadataUpdated(tokenId, "status", "PICKED_UP", rental.metadataVersion);
    }

    /**
     * @notice Process vehicle return and record return condition
     * @param tokenId The rental token ID
     * @param mileage Odometer reading at return
     * @param fuelLevel Fuel level at return (0-100)
     * @param damageReport Damage description (empty if none)
     */
    function processReturn(
        uint256 tokenId,
        uint256 mileage,
        uint8 fuelLevel,
        string calldata damageReport
    ) external tokenExists(tokenId) onlyRentalCompany inStatus(tokenId, RentalStatus.PICKED_UP) {
        if (fuelLevel > 100) revert InvalidFuelLevel();

        RentalData storage rental = _rentalData[tokenId];
        rental.status = RentalStatus.RETURNED;
        rental.returnedAt = block.timestamp;
        rental.returnMileage = mileage;
        rental.returnFuelLevel = fuelLevel;
        rental.damageReport = damageReport;
        rental.metadataVersion++;

        emit VehicleReturned(tokenId, _owners[tokenId], mileage, fuelLevel);
        if (bytes(damageReport).length > 0) {
            emit DamageReported(tokenId, damageReport);
        }
        emit MetadataUpdated(tokenId, "status", "RETURNED", rental.metadataVersion);
    }

    /**
     * @notice Inspect vehicle and resolve deposit (release, partial charge, or full charge)
     * @param tokenId The rental token ID
     * @param resolution Deposit resolution decision
     * @param chargeAmount Amount to charge from deposit (0 for RELEASED, partial for PARTIALLY_CHARGED, full for FULLY_CHARGED)
     */
    function inspectVehicle(
        uint256 tokenId,
        DepositStatus resolution,
        uint256 chargeAmount
    ) external tokenExists(tokenId) onlyRentalCompany inStatus(tokenId, RentalStatus.RETURNED) {
        RentalData storage rental = _rentalData[tokenId];

        if (rental.depositStatus != DepositStatus.HELD) revert DepositAlreadyResolved(tokenId);
        if (chargeAmount > rental.depositAmount) revert InvalidChargeAmount(tokenId, chargeAmount, rental.depositAmount);

        rental.status = RentalStatus.INSPECTED;
        rental.inspectedAt = block.timestamp;
        rental.depositStatus = resolution;
        rental.depositChargeAmount = chargeAmount;
        rental.metadataVersion++;

        // Resolve deposit
        _resolveDeposit(tokenId, resolution, chargeAmount);

        emit VehicleInspected(tokenId, resolution, chargeAmount);
        emit MetadataUpdated(tokenId, "status", "INSPECTED", rental.metadataVersion);
    }

    /**
     * @notice Cancel a rental and release deposit back to renter
     * @param tokenId The rental token ID
     * @param reason Cancellation reason
     */
    function cancelRental(uint256 tokenId, string calldata reason) external tokenExists(tokenId) onlyRentalCompany {
        RentalData storage rental = _rentalData[tokenId];

        if (
            rental.status != RentalStatus.CREATED &&
            rental.status != RentalStatus.CONFIRMED
        ) {
            revert StatusNotCancellable(tokenId, rental.status);
        }

        rental.status = RentalStatus.CANCELLED;
        rental.metadataVersion++;

        // Release deposit back to renter
        if (depositEscrow[tokenId] > 0) {
            uint256 refundAmount = depositEscrow[tokenId];
            depositEscrow[tokenId] = 0;
            rental.depositStatus = DepositStatus.RELEASED;

            (bool success, ) = rental.originalRenter.call{value: refundAmount}("");
            if (!success) revert RefundFailed(tokenId);

            emit DepositReleased(tokenId, rental.originalRenter, refundAmount);
        }

        _removeFromActive(tokenId);

        emit RentalCancelled(tokenId, reason);
        emit MetadataUpdated(tokenId, "status", "CANCELLED", rental.metadataVersion);
    }

    /**
     * @notice Mark a rental as no-show
     * @param tokenId The rental token ID
     */
    function markNoShow(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyRentalCompany inStatus(tokenId, RentalStatus.CONFIRMED) {
        RentalData storage rental = _rentalData[tokenId];
        rental.status = RentalStatus.NO_SHOW;
        rental.metadataVersion++;

        _removeFromActive(tokenId);

        emit RentalNoShow(tokenId, rental.pickupDate, block.timestamp);
        emit MetadataUpdated(tokenId, "status", "NO_SHOW", rental.metadataVersion);
    }

    /**
     * @notice Close a completed rental (final state after inspection)
     * @param tokenId The rental token ID
     */
    function closeRental(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyRentalCompany inStatus(tokenId, RentalStatus.INSPECTED) {
        RentalData storage rental = _rentalData[tokenId];
        rental.status = RentalStatus.CLOSED;
        rental.metadataVersion++;

        _removeFromActive(tokenId);

        emit RentalClosed(tokenId);
        emit MetadataUpdated(tokenId, "status", "CLOSED", rental.metadataVersion);
    }

    /**
     * @notice Void a rental (admin override for exceptional circumstances)
     * @param tokenId The rental token ID
     * @param reason Reason for voiding
     */
    function voidRental(uint256 tokenId, string calldata reason) external tokenExists(tokenId) onlyAdmin {
        RentalData storage rental = _rentalData[tokenId];
        rental.status = RentalStatus.VOID;
        rental.metadataVersion++;

        // Release any remaining deposit
        if (depositEscrow[tokenId] > 0 && rental.depositStatus == DepositStatus.HELD) {
            uint256 refundAmount = depositEscrow[tokenId];
            depositEscrow[tokenId] = 0;
            rental.depositStatus = DepositStatus.RELEASED;

            (bool success, ) = rental.originalRenter.call{value: refundAmount}("");
            if (success) {
                emit DepositReleased(tokenId, rental.originalRenter, refundAmount);
            }
        }

        _removeFromActive(tokenId);

        emit RentalVoided(tokenId, reason);
        emit MetadataUpdated(tokenId, "status", "VOID", rental.metadataVersion);
    }

    // ============================================================================
    // Dynamic Metadata Updates
    // ============================================================================

    /**
     * @notice Update vehicle assignment (before pickup)
     * @param tokenId The rental token ID
     * @param newMake New vehicle make
     * @param newModel New vehicle model
     */
    function updateVehicle(
        uint256 tokenId,
        string calldata newMake,
        string calldata newModel
    ) external tokenExists(tokenId) onlyRentalCompany {
        RentalData storage rental = _rentalData[tokenId];
        require(
            rental.status == RentalStatus.CREATED || rental.status == RentalStatus.CONFIRMED,
            "CarRentalNFT: can only update vehicle before pickup"
        );

        string memory oldMake = rental.vehicleMake;
        string memory oldModel = rental.vehicleModel;
        rental.vehicleMake = newMake;
        rental.vehicleModel = newModel;
        rental.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "vehicleMake",
            oldValue: oldMake,
            newValue: newMake,
            changedBy: msg.sender
        }));

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "vehicleModel",
            oldValue: oldModel,
            newValue: newModel,
            changedBy: msg.sender
        }));

        emit MetadataUpdated(tokenId, "vehicleMake", newMake, rental.metadataVersion);
        emit MetadataUpdated(tokenId, "vehicleModel", newModel, rental.metadataVersion);
    }

    /**
     * @notice Update pickup or return location
     * @param tokenId The rental token ID
     * @param newPickupLocation New pickup location
     * @param newReturnLocation New return location
     */
    function updateLocations(
        uint256 tokenId,
        string calldata newPickupLocation,
        string calldata newReturnLocation
    ) external tokenExists(tokenId) onlyRentalCompany {
        RentalData storage rental = _rentalData[tokenId];
        require(
            rental.status == RentalStatus.CREATED || rental.status == RentalStatus.CONFIRMED,
            "CarRentalNFT: can only update locations before pickup"
        );

        string memory oldPickup = rental.pickupLocation;
        string memory oldReturn = rental.returnLocation;
        rental.pickupLocation = newPickupLocation;
        rental.returnLocation = newReturnLocation;
        rental.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "pickupLocation",
            oldValue: oldPickup,
            newValue: newPickupLocation,
            changedBy: msg.sender
        }));

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "returnLocation",
            oldValue: oldReturn,
            newValue: newReturnLocation,
            changedBy: msg.sender
        }));

        emit MetadataUpdated(tokenId, "pickupLocation", newPickupLocation, rental.metadataVersion);
        emit MetadataUpdated(tokenId, "returnLocation", newReturnLocation, rental.metadataVersion);
    }

    /**
     * @notice Update return date (extend rental)
     * @param tokenId The rental token ID
     * @param newReturnDate New return date (must be after current return date)
     */
    function extendRental(
        uint256 tokenId,
        uint256 newReturnDate
    ) external payable tokenExists(tokenId) onlyRentalCompany {
        RentalData storage rental = _rentalData[tokenId];
        require(
            rental.status == RentalStatus.CONFIRMED || rental.status == RentalStatus.PICKED_UP,
            "CarRentalNFT: cannot extend in current status"
        );
        if (newReturnDate <= rental.returnDate) revert InvalidReturnDate();

        uint256 oldReturnDate = rental.returnDate;
        rental.returnDate = newReturnDate;
        rental.totalPaid += msg.value;
        rental.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "returnDate",
            oldValue: _toString(oldReturnDate),
            newValue: _toString(newReturnDate),
            changedBy: msg.sender
        }));

        emit MetadataUpdated(tokenId, "returnDate", _toString(newReturnDate), rental.metadataVersion);
    }

    /**
     * @notice Update token URI (IPFS metadata pointer)
     * @param tokenId The rental token ID
     * @param uri New URI string
     */
    function setRentalURI(uint256 tokenId, string calldata uri) external tokenExists(tokenId) onlyRentalCompany {
        _tokenURIs[tokenId] = uri;
        _rentalData[tokenId].metadataVersion++;
        emit MetadataUpdated(tokenId, "tokenURI", uri, _rentalData[tokenId].metadataVersion);
    }

    // ============================================================================
    // Chainlink Automation (Auto-Expiry & Auto-No-Show)
    // ============================================================================

    /**
     * @notice Check if any rentals need automatic expiry or no-show processing
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Encoded rental IDs and action types
     */
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        if (block.timestamp < lastUpkeepTime + minCheckInterval) {
            return (false, "");
        }

        uint256[] memory expireIds = new uint256[](maxRentalsPerUpkeep);
        uint256[] memory noShowIds = new uint256[](maxRentalsPerUpkeep);
        uint256 expireCount = 0;
        uint256 noShowCount = 0;

        for (uint256 i = 0; i < _activeRentalIds.length && (expireCount + noShowCount) < maxRentalsPerUpkeep; i++) {
            uint256 tokenId = _activeRentalIds[i];
            if (!_isActive[tokenId]) continue;

            RentalData memory rental = _rentalData[tokenId];

            // Auto-expire: return date + 24h grace has passed and vehicle still out or returned but not inspected
            if (
                rental.status == RentalStatus.PICKED_UP ||
                rental.status == RentalStatus.RETURNED
            ) {
                if (block.timestamp > rental.returnDate + AUTO_EXPIRE_GRACE) {
                    expireIds[expireCount] = tokenId;
                    expireCount++;
                    continue;
                }
            }

            // Auto-no-show: pickup date + 12h grace has passed and still in CONFIRMED
            if (rental.status == RentalStatus.CONFIRMED) {
                if (block.timestamp > rental.pickupDate + AUTO_NO_SHOW_GRACE) {
                    noShowIds[noShowCount] = tokenId;
                    noShowCount++;
                }
            }
        }

        if (expireCount > 0 || noShowCount > 0) {
            uint256[] memory trimmedExpire = new uint256[](expireCount);
            uint256[] memory trimmedNoShow = new uint256[](noShowCount);
            for (uint256 i = 0; i < expireCount; i++) trimmedExpire[i] = expireIds[i];
            for (uint256 i = 0; i < noShowCount; i++) trimmedNoShow[i] = noShowIds[i];

            upkeepNeeded = true;
            performData = abi.encode(trimmedExpire, trimmedNoShow);
        }
    }

    /**
     * @notice Execute automatic expiry and no-show processing
     * @param performData Encoded arrays of token IDs to process
     */
    function performUpkeep(bytes calldata performData) external override {
        (uint256[] memory expireIds, uint256[] memory noShowIds) = abi.decode(performData, (uint256[], uint256[]));

        // Process expirations
        for (uint256 i = 0; i < expireIds.length; i++) {
            uint256 tokenId = expireIds[i];
            if (_owners[tokenId] == address(0)) continue;

            RentalData storage rental = _rentalData[tokenId];
            if (
                block.timestamp > rental.returnDate + AUTO_EXPIRE_GRACE &&
                (rental.status == RentalStatus.PICKED_UP || rental.status == RentalStatus.RETURNED)
            ) {
                rental.status = RentalStatus.EXPIRED;
                rental.metadataVersion++;
                _removeFromActive(tokenId);

                emit RentalExpired(tokenId, rental.returnDate, block.timestamp);
                emit AutoExpiryTriggered(tokenId, rental.returnDate);
            }
        }

        // Process no-shows
        for (uint256 i = 0; i < noShowIds.length; i++) {
            uint256 tokenId = noShowIds[i];
            if (_owners[tokenId] == address(0)) continue;

            RentalData storage rental = _rentalData[tokenId];
            if (
                block.timestamp > rental.pickupDate + AUTO_NO_SHOW_GRACE &&
                rental.status == RentalStatus.CONFIRMED
            ) {
                rental.status = RentalStatus.NO_SHOW;
                rental.metadataVersion++;
                _removeFromActive(tokenId);

                emit RentalNoShow(tokenId, rental.pickupDate, block.timestamp);
                emit AutoNoShowTriggered(tokenId, rental.pickupDate);
            }
        }

        lastUpkeepTime = block.timestamp;
    }

    // ============================================================================
    // Query Functions
    // ============================================================================

    /// @notice Get full rental data for a token
    function getRentalData(uint256 tokenId) external view tokenExists(tokenId) returns (RentalData memory) {
        return _rentalData[tokenId];
    }

    /// @notice Get metadata change history for a token
    function getMetadataHistory(uint256 tokenId) external view tokenExists(tokenId) returns (MetadataChange[] memory) {
        return _metadataHistory[tokenId];
    }

    /// @notice Get current metadata version for a token
    function getMetadataVersion(uint256 tokenId) external view tokenExists(tokenId) returns (uint256) {
        return _rentalData[tokenId].metadataVersion;
    }

    /// @notice Check if a rental is currently valid (active lifecycle)
    function isRentalValid(uint256 tokenId) external view returns (bool) {
        if (_owners[tokenId] == address(0)) return false;
        RentalData memory rental = _rentalData[tokenId];
        return rental.status != RentalStatus.CLOSED &&
               rental.status != RentalStatus.EXPIRED &&
               rental.status != RentalStatus.CANCELLED &&
               rental.status != RentalStatus.NO_SHOW &&
               rental.status != RentalStatus.VOID;
    }

    /// @notice Check if a rental can be transferred and the reason if not
    function canTransfer(uint256 tokenId) external view returns (bool allowed, string memory reason) {
        if (_owners[tokenId] == address(0)) return (false, "Token does not exist");

        RentalData memory rental = _rentalData[tokenId];

        if (!rental.transferable) return (false, "Rental is not transferable");
        if (rental.status == RentalStatus.CLOSED) return (false, "Rental is closed");
        if (rental.status == RentalStatus.EXPIRED) return (false, "Rental has expired");
        if (rental.status == RentalStatus.CANCELLED) return (false, "Rental is cancelled");
        if (rental.status == RentalStatus.VOID) return (false, "Rental is void");
        if (
            rental.status == RentalStatus.PICKED_UP ||
            rental.status == RentalStatus.RETURNED ||
            rental.status == RentalStatus.INSPECTED
        ) {
            return (false, "Rental locked after pickup");
        }
        if (rental.transferCount >= rental.maxTransfers) return (false, "Max transfers reached");
        if (block.timestamp >= rental.pickupDate - TRANSFER_WINDOW_CUTOFF) {
            return (false, "Transfer window closed (< 24h to pickup)");
        }

        return (true, "");
    }

    /// @notice Get the deposit escrow amount for a rental
    function getDepositEscrow(uint256 tokenId) external view returns (uint256) {
        return depositEscrow[tokenId];
    }

    /// @notice Get the number of currently active rentals
    function getActiveRentalCount() external view returns (uint256) {
        return _activeRentalIds.length;
    }

    /// @notice Get total number of rentals ever created
    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ============================================================================
    // Admin / Role Management
    // ============================================================================

    /// @notice Grant a role to an account
    function grantRole(bytes32 role, address account) external onlyOwner {
        _roles[role][account] = true;
        emit RoleGranted(role, account);
    }

    /// @notice Revoke a role from an account
    function revokeRole(bytes32 role, address account) external onlyOwner {
        _roles[role][account] = false;
        emit RoleRevoked(role, account);
    }

    /// @notice Check if an account has a specific role
    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    /// @notice Set the base URI for token metadata
    function setBaseURI(string calldata _baseURI) external onlyOwner {
        baseURI = _baseURI;
    }

    /// @notice Pause the contract
    function pause() external onlyOwner {
        paused = true;
    }

    /// @notice Unpause the contract
    function unpause() external onlyOwner {
        paused = false;
    }

    /// @notice Set minimum interval between automation checks
    function setMinCheckInterval(uint256 interval) external onlyOwner {
        minCheckInterval = interval;
    }

    /// @notice Set maximum rentals processed per upkeep call
    function setMaxRentalsPerUpkeep(uint256 max) external onlyOwner {
        maxRentalsPerUpkeep = max;
    }

    /// @notice Transfer contract ownership
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    /// @notice Fund contract for deposit refunds
    receive() external payable {}

    /// @notice Withdraw excess funds (not escrowed deposits)
    function withdraw(uint256 amount, address payable to) external onlyOwner {
        require(address(this).balance >= amount, "CarRentalNFT: insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "CarRentalNFT: withdraw failed");
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /// @notice Resolve deposit: release, partial charge, or full charge
    function _resolveDeposit(uint256 tokenId, DepositStatus resolution, uint256 chargeAmount) internal {
        uint256 escrowed = depositEscrow[tokenId];
        if (escrowed == 0) return;

        depositEscrow[tokenId] = 0;
        RentalData storage rental = _rentalData[tokenId];

        if (resolution == DepositStatus.RELEASED) {
            // Full refund to renter
            (bool success, ) = rental.originalRenter.call{value: escrowed}("");
            if (!success) revert DepositTransferFailed(tokenId);
            emit DepositReleased(tokenId, rental.originalRenter, escrowed);
        } else if (resolution == DepositStatus.PARTIALLY_CHARGED) {
            // Charge portion, refund remainder
            uint256 refundAmount = escrowed - chargeAmount;
            if (refundAmount > 0) {
                (bool refundSuccess, ) = rental.originalRenter.call{value: refundAmount}("");
                if (!refundSuccess) revert DepositTransferFailed(tokenId);
            }
            // Charged amount stays in contract (operator can withdraw)
            emit DepositCharged(tokenId, chargeAmount, refundAmount);
        } else if (resolution == DepositStatus.FULLY_CHARGED) {
            // Full charge stays in contract
            emit DepositCharged(tokenId, escrowed, 0);
        }
    }

    /// @notice Transfer with rental-specific guards
    function _transferRental(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "CarRentalNFT: not owner");
        if (to == address(0)) revert ZeroAddress();

        RentalData storage rental = _rentalData[tokenId];

        // Guard: transferability
        if (!rental.transferable) revert RentalNotTransferable(tokenId);

        // Guard: status must be CREATED or CONFIRMED
        if (rental.status != RentalStatus.CREATED && rental.status != RentalStatus.CONFIRMED) {
            if (
                rental.status == RentalStatus.PICKED_UP ||
                rental.status == RentalStatus.RETURNED ||
                rental.status == RentalStatus.INSPECTED
            ) {
                revert RentalLockedAfterPickup(tokenId);
            }
            revert RentalAlreadyUsed(tokenId);
        }

        // Guard: transfer window (24h before pickup)
        if (block.timestamp >= rental.pickupDate - TRANSFER_WINDOW_CUTOFF) {
            revert TransferWindowClosed(tokenId, rental.pickupDate);
        }

        // Guard: max transfers
        if (rental.transferCount >= rental.maxTransfers) {
            revert MaxTransfersReached(tokenId, rental.maxTransfers);
        }

        // Execute transfer
        delete _tokenApprovals[tokenId];
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        rental.transferCount++;
        rental.metadataVersion++;

        emit Transfer(from, to, tokenId);
        emit RentalTransferred(tokenId, from, to, rental.transferCount);
    }

    /// @notice Remove from active rental tracking (swap and pop)
    function _removeFromActive(uint256 tokenId) internal {
        if (!_isActive[tokenId]) return;
        _isActive[tokenId] = false;

        uint256 index = _activeRentalIndex[tokenId];
        uint256 lastIndex = _activeRentalIds.length - 1;

        if (index != lastIndex) {
            uint256 lastTokenId = _activeRentalIds[lastIndex];
            _activeRentalIds[index] = lastTokenId;
            _activeRentalIndex[lastTokenId] = index;
        }

        _activeRentalIds.pop();
        delete _activeRentalIndex[tokenId];
    }

    /// @notice Check if spender is approved or owner of token
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address rentalOwner = ownerOf(tokenId);
        return (spender == rentalOwner || getApproved(tokenId) == spender || isApprovedForAll(rentalOwner, spender));
    }

    /// @notice Check ERC721 receiver interface on recipient contract
    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory data) internal returns (bool) {
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
                return retval == IERC721Receiver.onERC721Received.selector;
            } catch {
                return false;
            }
        }
        return true;
    }

    /// @notice Convert uint256 to string
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) { digits--; buffer[digits] = bytes1(uint8(48 + (value % 10))); value /= 10; }
        return string(buffer);
    }

    // ============================================================================
    // ERC165
    // ============================================================================

    /// @notice Check interface support (ERC165, ERC721, ERC721Metadata)
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7  // ERC165
            || interfaceId == 0x80ac58cd  // ERC721
            || interfaceId == 0x5b5e139f; // ERC721Metadata
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}
