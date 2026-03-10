// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

/**
 * @title HotelReservationNFT
 * @dev ERC721-based hotel reservation with lifecycle management, transfer window enforcement,
 *      role-based access control, and Chainlink Automation for auto-expiry and no-show detection.
 *
 * Features:
 * - Mint reservation NFTs with hotel booking data (hotel, room, dates, rate)
 * - Transfer windows: transfers blocked < 48h before check-in
 * - Post-check-in lock: no transfers after guest checks in
 * - Max transfer enforcement per token
 * - Full lifecycle: CREATED -> CONFIRMED -> CHECKED_IN -> CHECKED_OUT -> CLOSED
 * - Cancellation, no-show, and expiry paths
 * - Extend stay functionality (modify check-out date)
 * - Chainlink Automation: auto-expire past checkout+24h, auto-no-show past check-in+12h
 * - Refund escrow: payments held in contract, released on cancellation
 * - On-chain metadata change audit trail
 */
contract HotelReservationNFT is AutomationCompatibleInterface {
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
    // Reservation State
    // ============================================================================

    enum ReservationStatus {
        CREATED,
        CONFIRMED,
        CHECKED_IN,
        CHECKED_OUT,
        CLOSED,
        CANCELLED,
        NO_SHOW,
        EXPIRED,
        VOID
    }

    struct ReservationData {
        string hotelCode;
        string guestName;
        string roomType;
        string roomNumber;
        uint256 checkInDate;
        uint256 checkOutDate;
        uint256 nightCount;
        uint256 rate;
        string currency;
        ReservationStatus status;
        // Lifecycle timestamps
        uint256 createdAt;
        uint256 confirmedAt;
        uint256 checkedInAt;
        uint256 checkedOutAt;
        // Transfer rules
        uint8 transferCount;
        uint8 maxTransfers;
        bool transferable;
        // Metadata versioning
        uint256 metadataVersion;
        // Payment / refund
        uint256 amountPaid;
        address payable originalBooker;
    }

    mapping(uint256 => ReservationData) private _reservationData;

    // Track all active (non-closed, non-expired, non-void) reservation IDs for automation
    uint256[] private _activeReservationIds;
    mapping(uint256 => uint256) private _activeReservationIndex;
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

    uint256 public constant TRANSFER_WINDOW_CUTOFF = 48 hours;
    uint256 public constant AUTO_EXPIRE_GRACE = 24 hours;
    uint256 public constant AUTO_NO_SHOW_GRACE = 12 hours;

    uint256 public minCheckInterval = 3600; // 1 hour
    uint256 public lastUpkeepTime;
    uint256 public maxReservationsPerUpkeep = 50;

    // ============================================================================
    // Role-Based Access Control
    // ============================================================================

    bytes32 public constant HOTEL_ROLE = keccak256("HOTEL_ROLE");
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    address public owner;
    mapping(bytes32 => mapping(address => bool)) private _roles;
    bool public paused;

    // Refund escrow
    mapping(uint256 => bool) public refundPending;

    // ============================================================================
    // Events
    // ============================================================================

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    event ReservationCreated(uint256 indexed tokenId, address indexed guest, string hotelCode, uint256 checkInDate);
    event ReservationConfirmed(uint256 indexed tokenId, address indexed guest);
    event GuestCheckedIn(uint256 indexed tokenId, address indexed guest, string roomNumber);
    event GuestCheckedOut(uint256 indexed tokenId, address indexed guest);
    event ReservationClosed(uint256 indexed tokenId);
    event ReservationCancelled(uint256 indexed tokenId, string reason);
    event ReservationNoShow(uint256 indexed tokenId, uint256 checkInDate, uint256 currentTime);
    event ReservationExpired(uint256 indexed tokenId, uint256 checkOutDate, uint256 currentTime);
    event ReservationVoided(uint256 indexed tokenId, string reason);
    event StayExtended(uint256 indexed tokenId, uint256 oldCheckOutDate, uint256 newCheckOutDate, uint256 newNightCount);
    event RefundProcessed(uint256 indexed tokenId, address indexed to, uint256 amount);
    event ReservationTransferred(uint256 indexed tokenId, address indexed from, address indexed to, uint8 transferCount);
    event MetadataUpdated(uint256 indexed tokenId, string field, string newValue, uint256 version);
    event AutoExpiryTriggered(uint256 indexed tokenId, uint256 checkOutDate);
    event AutoNoShowTriggered(uint256 indexed tokenId, uint256 checkInDate);
    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);

    // ============================================================================
    // Errors
    // ============================================================================

    error NotOwner();
    error NotHotel();
    error NotAgent();
    error NotAdmin();
    error ContractPaused();
    error TokenDoesNotExist(uint256 tokenId);
    error InvalidStatus(uint256 tokenId, ReservationStatus current, ReservationStatus expected);
    error TransferWindowClosed(uint256 tokenId, uint256 checkInDate);
    error ReservationLockedAfterCheckIn(uint256 tokenId);
    error MaxTransfersReached(uint256 tokenId, uint8 maxTransfers);
    error ReservationNotTransferable(uint256 tokenId);
    error ReservationAlreadyUsed(uint256 tokenId);
    error NotAuthorized();
    error InvalidCheckInDate();
    error InvalidCheckOutDate();
    error InvalidExtension();
    error RefundFailed(uint256 tokenId);
    error ZeroAddress();
    error InvalidRoomAssignment();
    error StatusNotCancellable(uint256 tokenId, ReservationStatus current);

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyHotel() {
        if (!_roles[HOTEL_ROLE][msg.sender] && msg.sender != owner) revert NotHotel();
        _;
    }

    modifier onlyAgent() {
        if (!_roles[AGENT_ROLE][msg.sender] && !_roles[HOTEL_ROLE][msg.sender] && msg.sender != owner) revert NotAgent();
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

    modifier inStatus(uint256 tokenId, ReservationStatus expected) {
        if (_reservationData[tokenId].status != expected) {
            revert InvalidStatus(tokenId, _reservationData[tokenId].status, expected);
        }
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    /**
     * @notice Deploy a new HotelReservationNFT contract
     * @param _name ERC721 collection name
     * @param _symbol ERC721 collection symbol
     * @param _baseURI Base URI for token metadata
     */
    constructor(string memory _name, string memory _symbol, string memory _baseURI) {
        name = _name;
        symbol = _symbol;
        baseURI = _baseURI;
        owner = msg.sender;
        _roles[HOTEL_ROLE][msg.sender] = true;
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
        address reservationOwner = ownerOf(tokenId);
        require(to != reservationOwner, "HotelReservationNFT: approve to owner");
        require(
            msg.sender == reservationOwner || isApprovedForAll(reservationOwner, msg.sender),
            "HotelReservationNFT: not authorized"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(reservationOwner, to, tokenId);
    }

    /// @notice Returns the approved address for a token
    function getApproved(uint256 tokenId) public view tokenExists(tokenId) returns (address) {
        return _tokenApprovals[tokenId];
    }

    /// @notice Set or revoke operator approval for all tokens
    function setApprovalForAll(address operator, bool approved) public {
        require(msg.sender != operator, "HotelReservationNFT: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// @notice Check if an operator is approved for all tokens of an owner
    function isApprovedForAll(address _ownerAddr, address operator) public view returns (bool) {
        return _operatorApprovals[_ownerAddr][operator];
    }

    /// @notice Transfer with reservation-specific guards
    function transferFrom(address from, address to, uint256 tokenId) public whenNotPaused {
        require(_isApprovedOrOwner(msg.sender, tokenId), "HotelReservationNFT: not authorized");
        _transferReservation(from, to, tokenId);
    }

    /// @notice Safe transfer (checks recipient supports ERC721)
    function safeTransferFrom(address from, address to, uint256 tokenId) public {
        safeTransferFrom(from, to, tokenId, "");
    }

    /// @notice Safe transfer with data
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "HotelReservationNFT: unsafe recipient");
    }

    // ============================================================================
    // Reservation Creation
    // ============================================================================

    /**
     * @notice Create a new hotel reservation NFT
     * @param to Guest wallet address
     * @param hotelCode Hotel property code (e.g., "HLT-NYC-001")
     * @param guestName Guest name for the reservation
     * @param roomType Room type (e.g., "KING_DELUXE", "TWIN_STANDARD")
     * @param checkInDate Unix timestamp of check-in date
     * @param checkOutDate Unix timestamp of check-out date
     * @param nightCount Number of nights
     * @param rate Nightly rate (in smallest currency unit)
     * @param currency Currency code (e.g., "USD", "EUR")
     * @param maxTransfers Maximum allowed transfers
     * @param transferable Whether reservation can be transferred
     * @return tokenId The newly minted token ID
     */
    function createReservation(
        address to,
        string calldata hotelCode,
        string calldata guestName,
        string calldata roomType,
        uint256 checkInDate,
        uint256 checkOutDate,
        uint256 nightCount,
        uint256 rate,
        string calldata currency,
        uint8 maxTransfers,
        bool transferable
    ) external payable onlyAgent whenNotPaused returns (uint256) {
        if (checkInDate <= block.timestamp) revert InvalidCheckInDate();
        if (checkOutDate <= checkInDate) revert InvalidCheckOutDate();
        if (to == address(0)) revert ZeroAddress();

        uint256 tokenId = _nextTokenId++;

        _balances[to]++;
        _owners[tokenId] = to;

        _reservationData[tokenId] = ReservationData({
            hotelCode: hotelCode,
            guestName: guestName,
            roomType: roomType,
            roomNumber: "",
            checkInDate: checkInDate,
            checkOutDate: checkOutDate,
            nightCount: nightCount,
            rate: rate,
            currency: currency,
            status: ReservationStatus.CREATED,
            createdAt: block.timestamp,
            confirmedAt: 0,
            checkedInAt: 0,
            checkedOutAt: 0,
            transferCount: 0,
            maxTransfers: maxTransfers,
            transferable: transferable,
            metadataVersion: 1,
            amountPaid: msg.value,
            originalBooker: payable(to)
        });

        // Track as active
        _activeReservationIndex[tokenId] = _activeReservationIds.length;
        _activeReservationIds.push(tokenId);
        _isActive[tokenId] = true;

        emit Transfer(address(0), to, tokenId);
        emit ReservationCreated(tokenId, to, hotelCode, checkInDate);

        return tokenId;
    }

    /**
     * @notice Batch create reservations for a group booking
     * @param guests Array of guest wallet addresses
     * @param hotelCode Hotel property code
     * @param guestNames Array of guest names
     * @param roomType Room type for all reservations
     * @param checkInDate Unix timestamp of check-in date
     * @param checkOutDate Unix timestamp of check-out date
     * @param nightCount Number of nights
     * @param rate Nightly rate
     * @param currency Currency code
     * @param maxTransfers Maximum allowed transfers per reservation
     * @param transferable Whether reservations can be transferred
     * @return tokenIds Array of newly minted token IDs
     */
    function batchCreateReservations(
        address[] calldata guests,
        string calldata hotelCode,
        string[] calldata guestNames,
        string calldata roomType,
        uint256 checkInDate,
        uint256 checkOutDate,
        uint256 nightCount,
        uint256 rate,
        string calldata currency,
        uint8 maxTransfers,
        bool transferable
    ) external onlyAgent whenNotPaused returns (uint256[] memory) {
        require(guests.length == guestNames.length, "HotelReservationNFT: length mismatch");
        if (checkInDate <= block.timestamp) revert InvalidCheckInDate();
        if (checkOutDate <= checkInDate) revert InvalidCheckOutDate();

        uint256[] memory tokenIds = new uint256[](guests.length);

        for (uint256 i = 0; i < guests.length; i++) {
            if (guests[i] == address(0)) revert ZeroAddress();

            uint256 tokenId = _nextTokenId++;
            _balances[guests[i]]++;
            _owners[tokenId] = guests[i];

            _reservationData[tokenId] = ReservationData({
                hotelCode: hotelCode,
                guestName: guestNames[i],
                roomType: roomType,
                roomNumber: "",
                checkInDate: checkInDate,
                checkOutDate: checkOutDate,
                nightCount: nightCount,
                rate: rate,
                currency: currency,
                status: ReservationStatus.CREATED,
                createdAt: block.timestamp,
                confirmedAt: 0,
                checkedInAt: 0,
                checkedOutAt: 0,
                transferCount: 0,
                maxTransfers: maxTransfers,
                transferable: transferable,
                metadataVersion: 1,
                amountPaid: 0,
                originalBooker: payable(guests[i])
            });

            _activeReservationIndex[tokenId] = _activeReservationIds.length;
            _activeReservationIds.push(tokenId);
            _isActive[tokenId] = true;

            emit Transfer(address(0), guests[i], tokenId);
            emit ReservationCreated(tokenId, guests[i], hotelCode, checkInDate);

            tokenIds[i] = tokenId;
        }

        return tokenIds;
    }

    // ============================================================================
    // Reservation Lifecycle Operations
    // ============================================================================

    /**
     * @notice Confirm a reservation
     * @param tokenId The reservation token ID
     */
    function confirmReservation(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyHotel inStatus(tokenId, ReservationStatus.CREATED) {
        ReservationData storage res = _reservationData[tokenId];
        res.status = ReservationStatus.CONFIRMED;
        res.confirmedAt = block.timestamp;
        res.metadataVersion++;

        emit ReservationConfirmed(tokenId, _owners[tokenId]);
        emit MetadataUpdated(tokenId, "status", "CONFIRMED", res.metadataVersion);
    }

    /**
     * @notice Check in a guest and assign a room number
     * @param tokenId The reservation token ID
     * @param roomNumber The assigned room number (e.g., "1204")
     */
    function checkIn(
        uint256 tokenId,
        string calldata roomNumber
    ) external tokenExists(tokenId) onlyHotel inStatus(tokenId, ReservationStatus.CONFIRMED) {
        if (bytes(roomNumber).length == 0) revert InvalidRoomAssignment();

        ReservationData storage res = _reservationData[tokenId];
        res.status = ReservationStatus.CHECKED_IN;
        res.checkedInAt = block.timestamp;
        res.roomNumber = roomNumber;
        res.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "roomNumber",
            oldValue: "",
            newValue: roomNumber,
            changedBy: msg.sender
        }));

        emit GuestCheckedIn(tokenId, _owners[tokenId], roomNumber);
        emit MetadataUpdated(tokenId, "status", "CHECKED_IN", res.metadataVersion);
    }

    /**
     * @notice Check out a guest
     * @param tokenId The reservation token ID
     */
    function checkOut(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyHotel inStatus(tokenId, ReservationStatus.CHECKED_IN) {
        ReservationData storage res = _reservationData[tokenId];
        res.status = ReservationStatus.CHECKED_OUT;
        res.checkedOutAt = block.timestamp;
        res.metadataVersion++;

        emit GuestCheckedOut(tokenId, _owners[tokenId]);
        emit MetadataUpdated(tokenId, "status", "CHECKED_OUT", res.metadataVersion);
    }

    /**
     * @notice Cancel a reservation and mark for refund
     * @param tokenId The reservation token ID
     * @param reason Cancellation reason
     */
    function cancelReservation(uint256 tokenId, string calldata reason) external tokenExists(tokenId) onlyHotel {
        ReservationData storage res = _reservationData[tokenId];

        if (
            res.status != ReservationStatus.CREATED &&
            res.status != ReservationStatus.CONFIRMED
        ) {
            revert StatusNotCancellable(tokenId, res.status);
        }

        res.status = ReservationStatus.CANCELLED;
        res.metadataVersion++;
        refundPending[tokenId] = true;

        emit ReservationCancelled(tokenId, reason);
        emit MetadataUpdated(tokenId, "status", "CANCELLED", res.metadataVersion);
    }

    /**
     * @notice Mark a reservation as no-show
     * @param tokenId The reservation token ID
     */
    function markNoShow(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyHotel inStatus(tokenId, ReservationStatus.CONFIRMED) {
        ReservationData storage res = _reservationData[tokenId];
        res.status = ReservationStatus.NO_SHOW;
        res.metadataVersion++;

        _removeFromActive(tokenId);

        emit ReservationNoShow(tokenId, res.checkInDate, block.timestamp);
        emit MetadataUpdated(tokenId, "status", "NO_SHOW", res.metadataVersion);
    }

    /**
     * @notice Extend a guest's stay by modifying check-out date
     * @param tokenId The reservation token ID
     * @param newCheckOutDate New check-out date (must be after current check-out)
     * @param newNightCount Updated night count
     */
    function extendStay(
        uint256 tokenId,
        uint256 newCheckOutDate,
        uint256 newNightCount
    ) external payable tokenExists(tokenId) onlyHotel inStatus(tokenId, ReservationStatus.CHECKED_IN) {
        ReservationData storage res = _reservationData[tokenId];

        if (newCheckOutDate <= res.checkOutDate) revert InvalidExtension();

        uint256 oldCheckOutDate = res.checkOutDate;
        res.checkOutDate = newCheckOutDate;
        res.nightCount = newNightCount;
        res.amountPaid += msg.value;
        res.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "checkOutDate",
            oldValue: _toString(oldCheckOutDate),
            newValue: _toString(newCheckOutDate),
            changedBy: msg.sender
        }));

        emit StayExtended(tokenId, oldCheckOutDate, newCheckOutDate, newNightCount);
        emit MetadataUpdated(tokenId, "checkOutDate", _toString(newCheckOutDate), res.metadataVersion);
    }

    /**
     * @notice Close a completed reservation (final state)
     * @param tokenId The reservation token ID
     */
    function closeReservation(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyHotel inStatus(tokenId, ReservationStatus.CHECKED_OUT) {
        ReservationData storage res = _reservationData[tokenId];
        res.status = ReservationStatus.CLOSED;
        res.metadataVersion++;

        _removeFromActive(tokenId);

        emit ReservationClosed(tokenId);
        emit MetadataUpdated(tokenId, "status", "CLOSED", res.metadataVersion);
    }

    /**
     * @notice Void a reservation (admin override for exceptional circumstances)
     * @param tokenId The reservation token ID
     * @param reason Reason for voiding
     */
    function voidReservation(uint256 tokenId, string calldata reason) external tokenExists(tokenId) onlyAdmin {
        ReservationData storage res = _reservationData[tokenId];
        res.status = ReservationStatus.VOID;
        res.metadataVersion++;

        _removeFromActive(tokenId);

        emit ReservationVoided(tokenId, reason);
        emit MetadataUpdated(tokenId, "status", "VOID", res.metadataVersion);
    }

    /**
     * @notice Process refund for a cancelled reservation
     * @param tokenId The reservation token ID
     */
    function processRefund(uint256 tokenId) external tokenExists(tokenId) onlyHotel {
        ReservationData storage res = _reservationData[tokenId];
        require(res.status == ReservationStatus.CANCELLED, "HotelReservationNFT: not cancelled");
        require(refundPending[tokenId], "HotelReservationNFT: no refund pending");

        refundPending[tokenId] = false;

        if (res.amountPaid > 0 && address(this).balance >= res.amountPaid) {
            (bool success, ) = res.originalBooker.call{value: res.amountPaid}("");
            if (!success) revert RefundFailed(tokenId);
            emit RefundProcessed(tokenId, res.originalBooker, res.amountPaid);
        }

        _removeFromActive(tokenId);
    }

    // ============================================================================
    // Dynamic Metadata Updates
    // ============================================================================

    /**
     * @notice Update room type for a reservation
     * @param tokenId The reservation token ID
     * @param newRoomType New room type string
     */
    function updateRoomType(uint256 tokenId, string calldata newRoomType) external tokenExists(tokenId) onlyHotel {
        ReservationData storage res = _reservationData[tokenId];
        require(
            res.status != ReservationStatus.CLOSED &&
            res.status != ReservationStatus.VOID &&
            res.status != ReservationStatus.EXPIRED,
            "HotelReservationNFT: reservation inactive"
        );

        string memory oldRoomType = res.roomType;
        res.roomType = newRoomType;
        res.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "roomType",
            oldValue: oldRoomType,
            newValue: newRoomType,
            changedBy: msg.sender
        }));

        emit MetadataUpdated(tokenId, "roomType", newRoomType, res.metadataVersion);
    }

    /**
     * @notice Update room number assignment
     * @param tokenId The reservation token ID
     * @param newRoomNumber New room number string
     */
    function updateRoomNumber(uint256 tokenId, string calldata newRoomNumber) external tokenExists(tokenId) onlyHotel {
        ReservationData storage res = _reservationData[tokenId];
        require(
            res.status == ReservationStatus.CHECKED_IN,
            "HotelReservationNFT: can only change room when checked in"
        );

        string memory oldRoomNumber = res.roomNumber;
        res.roomNumber = newRoomNumber;
        res.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "roomNumber",
            oldValue: oldRoomNumber,
            newValue: newRoomNumber,
            changedBy: msg.sender
        }));

        emit MetadataUpdated(tokenId, "roomNumber", newRoomNumber, res.metadataVersion);
    }

    /**
     * @notice Update token URI (IPFS metadata pointer)
     * @param tokenId The reservation token ID
     * @param uri New URI string
     */
    function setReservationURI(uint256 tokenId, string calldata uri) external tokenExists(tokenId) onlyHotel {
        _tokenURIs[tokenId] = uri;
        _reservationData[tokenId].metadataVersion++;
        emit MetadataUpdated(tokenId, "tokenURI", uri, _reservationData[tokenId].metadataVersion);
    }

    // ============================================================================
    // Chainlink Automation (Auto-Expiry & Auto-No-Show)
    // ============================================================================

    /**
     * @notice Check if any reservations need automatic expiry or no-show processing
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Encoded reservation IDs and action types
     */
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        if (block.timestamp < lastUpkeepTime + minCheckInterval) {
            return (false, "");
        }

        uint256[] memory expireIds = new uint256[](maxReservationsPerUpkeep);
        uint256[] memory noShowIds = new uint256[](maxReservationsPerUpkeep);
        uint256 expireCount = 0;
        uint256 noShowCount = 0;

        for (uint256 i = 0; i < _activeReservationIds.length && (expireCount + noShowCount) < maxReservationsPerUpkeep; i++) {
            uint256 tokenId = _activeReservationIds[i];
            if (!_isActive[tokenId]) continue;

            ReservationData memory res = _reservationData[tokenId];

            // Auto-expire: checkout date + 24h grace has passed and guest still checked in or checked out
            if (
                res.status == ReservationStatus.CHECKED_IN ||
                res.status == ReservationStatus.CHECKED_OUT
            ) {
                if (block.timestamp > res.checkOutDate + AUTO_EXPIRE_GRACE) {
                    expireIds[expireCount] = tokenId;
                    expireCount++;
                    continue;
                }
            }

            // Auto-no-show: check-in date + 12h grace has passed and still in CONFIRMED
            if (res.status == ReservationStatus.CONFIRMED) {
                if (block.timestamp > res.checkInDate + AUTO_NO_SHOW_GRACE) {
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

            ReservationData storage res = _reservationData[tokenId];
            if (
                block.timestamp > res.checkOutDate + AUTO_EXPIRE_GRACE &&
                (res.status == ReservationStatus.CHECKED_IN || res.status == ReservationStatus.CHECKED_OUT)
            ) {
                res.status = ReservationStatus.EXPIRED;
                res.metadataVersion++;
                _removeFromActive(tokenId);

                emit ReservationExpired(tokenId, res.checkOutDate, block.timestamp);
                emit AutoExpiryTriggered(tokenId, res.checkOutDate);
            }
        }

        // Process no-shows
        for (uint256 i = 0; i < noShowIds.length; i++) {
            uint256 tokenId = noShowIds[i];
            if (_owners[tokenId] == address(0)) continue;

            ReservationData storage res = _reservationData[tokenId];
            if (
                block.timestamp > res.checkInDate + AUTO_NO_SHOW_GRACE &&
                res.status == ReservationStatus.CONFIRMED
            ) {
                res.status = ReservationStatus.NO_SHOW;
                res.metadataVersion++;
                _removeFromActive(tokenId);

                emit ReservationNoShow(tokenId, res.checkInDate, block.timestamp);
                emit AutoNoShowTriggered(tokenId, res.checkInDate);
            }
        }

        lastUpkeepTime = block.timestamp;
    }

    // ============================================================================
    // Query Functions
    // ============================================================================

    /// @notice Get full reservation data for a token
    function getReservationData(uint256 tokenId) external view tokenExists(tokenId) returns (ReservationData memory) {
        return _reservationData[tokenId];
    }

    /// @notice Get metadata change history for a token
    function getMetadataHistory(uint256 tokenId) external view tokenExists(tokenId) returns (MetadataChange[] memory) {
        return _metadataHistory[tokenId];
    }

    /// @notice Get current metadata version for a token
    function getMetadataVersion(uint256 tokenId) external view tokenExists(tokenId) returns (uint256) {
        return _reservationData[tokenId].metadataVersion;
    }

    /// @notice Check if a reservation is currently valid (active lifecycle)
    function isReservationValid(uint256 tokenId) external view returns (bool) {
        if (_owners[tokenId] == address(0)) return false;
        ReservationData memory res = _reservationData[tokenId];
        return res.status != ReservationStatus.CLOSED &&
               res.status != ReservationStatus.EXPIRED &&
               res.status != ReservationStatus.CANCELLED &&
               res.status != ReservationStatus.NO_SHOW &&
               res.status != ReservationStatus.VOID;
    }

    /// @notice Check if a reservation can be transferred and the reason if not
    function canTransfer(uint256 tokenId) external view returns (bool allowed, string memory reason) {
        if (_owners[tokenId] == address(0)) return (false, "Token does not exist");

        ReservationData memory res = _reservationData[tokenId];

        if (!res.transferable) return (false, "Reservation is not transferable");
        if (res.status == ReservationStatus.CLOSED) return (false, "Reservation is closed");
        if (res.status == ReservationStatus.EXPIRED) return (false, "Reservation has expired");
        if (res.status == ReservationStatus.CANCELLED) return (false, "Reservation is cancelled");
        if (res.status == ReservationStatus.VOID) return (false, "Reservation is void");
        if (res.status == ReservationStatus.CHECKED_IN || res.status == ReservationStatus.CHECKED_OUT) {
            return (false, "Reservation locked after check-in");
        }
        if (res.transferCount >= res.maxTransfers) return (false, "Max transfers reached");
        if (block.timestamp >= res.checkInDate - TRANSFER_WINDOW_CUTOFF) {
            return (false, "Transfer window closed (< 48h to check-in)");
        }

        return (true, "");
    }

    /// @notice Get the number of currently active reservations
    function getActiveReservationCount() external view returns (uint256) {
        return _activeReservationIds.length;
    }

    /// @notice Get total number of reservations ever created
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

    /// @notice Set maximum reservations processed per upkeep call
    function setMaxReservationsPerUpkeep(uint256 max) external onlyOwner {
        maxReservationsPerUpkeep = max;
    }

    /// @notice Transfer contract ownership
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    /// @notice Fund contract for refunds
    receive() external payable {}

    /// @notice Withdraw excess funds
    function withdraw(uint256 amount, address payable to) external onlyOwner {
        require(address(this).balance >= amount, "HotelReservationNFT: insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "HotelReservationNFT: withdraw failed");
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /// @notice Transfer with reservation-specific guards
    function _transferReservation(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "HotelReservationNFT: not owner");
        if (to == address(0)) revert ZeroAddress();

        ReservationData storage res = _reservationData[tokenId];

        // Guard: transferability
        if (!res.transferable) revert ReservationNotTransferable(tokenId);

        // Guard: status must be CREATED or CONFIRMED
        if (res.status != ReservationStatus.CREATED && res.status != ReservationStatus.CONFIRMED) {
            if (res.status == ReservationStatus.CHECKED_IN || res.status == ReservationStatus.CHECKED_OUT) {
                revert ReservationLockedAfterCheckIn(tokenId);
            }
            revert ReservationAlreadyUsed(tokenId);
        }

        // Guard: transfer window (48h before check-in)
        if (block.timestamp >= res.checkInDate - TRANSFER_WINDOW_CUTOFF) {
            revert TransferWindowClosed(tokenId, res.checkInDate);
        }

        // Guard: max transfers
        if (res.transferCount >= res.maxTransfers) {
            revert MaxTransfersReached(tokenId, res.maxTransfers);
        }

        // Execute transfer
        delete _tokenApprovals[tokenId];
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        res.transferCount++;
        res.metadataVersion++;

        emit Transfer(from, to, tokenId);
        emit ReservationTransferred(tokenId, from, to, res.transferCount);
    }

    /// @notice Remove from active reservation tracking (swap and pop)
    function _removeFromActive(uint256 tokenId) internal {
        if (!_isActive[tokenId]) return;
        _isActive[tokenId] = false;

        uint256 index = _activeReservationIndex[tokenId];
        uint256 lastIndex = _activeReservationIds.length - 1;

        if (index != lastIndex) {
            uint256 lastTokenId = _activeReservationIds[lastIndex];
            _activeReservationIds[index] = lastTokenId;
            _activeReservationIndex[lastTokenId] = index;
        }

        _activeReservationIds.pop();
        delete _activeReservationIndex[tokenId];
    }

    /// @notice Check if spender is approved or owner of token
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address reservationOwner = ownerOf(tokenId);
        return (spender == reservationOwner || getApproved(tokenId) == spender || isApprovedForAll(reservationOwner, spender));
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
