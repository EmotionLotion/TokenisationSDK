// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

/**
 * @title ConcertTicketNFT
 * @dev ERC721-based concert ticket with anti-scalping price cap enforcement, admission tracking,
 *      transfer window enforcement, role-based access control, and Chainlink Automation
 *      for auto-expiry of post-event tickets.
 *
 * Features:
 * - Mint ticket NFTs with full event, venue, and seating data
 * - Anti-scalping: transfers revert if msg.value exceeds resalePriceCap
 * - Transfer windows: transfers blocked < 24h before event
 * - Post-admission lock: no transfers after fan is admitted
 * - Max transfer enforcement per token
 * - Full lifecycle: CREATED -> ISSUED -> ADMITTED -> USED -> CLOSED
 * - Cancellation, refund, and expiry paths
 * - Chainlink Automation: auto-expire post-event+6h
 * - Refund escrow: payments held in contract, released on refund
 * - On-chain metadata change audit trail
 */
contract ConcertTicketNFT is AutomationCompatibleInterface {
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
    // Ticket State
    // ============================================================================

    enum TicketStatus {
        CREATED,
        ISSUED,
        ADMITTED,
        USED,
        CLOSED,
        CANCELLED,
        REFUNDED,
        EXPIRED,
        VOID
    }

    enum SeatingTier {
        GA,
        FLOOR,
        LOWER,
        UPPER,
        VIP,
        BACKSTAGE
    }

    struct TicketData {
        // Venue & event info
        string venueCode;
        string venueName;
        string eventName;
        string artist;
        uint256 eventDate;
        uint256 doorsOpen;
        // Seating
        string section;
        string row;
        string seatNumber;
        SeatingTier seatingTier;
        // Pricing & anti-scalping
        uint256 faceValue;
        uint256 resalePriceCap;
        // Fan info
        string fanName;
        bool ageVerified;
        uint256 admittedAt;
        // Lifecycle
        TicketStatus status;
        uint256 createdAt;
        uint256 issuedAt;
        // Transfer rules
        uint8 transferCount;
        uint8 maxTransfers;
        bool transferable;
        // Metadata versioning
        uint256 metadataVersion;
        // Payment / refund
        uint256 pricePaid;
        address payable originalBuyer;
    }

    mapping(uint256 => TicketData) private _ticketData;

    // Track all active ticket IDs for automation
    uint256[] private _activeTicketIds;
    mapping(uint256 => uint256) private _activeTicketIndex;
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
    uint256 public constant AUTO_EXPIRE_GRACE = 6 hours;

    uint256 public minCheckInterval = 3600; // 1 hour
    uint256 public lastUpkeepTime;
    uint256 public maxTicketsPerUpkeep = 50;

    // ============================================================================
    // Role-Based Access Control
    // ============================================================================

    bytes32 public constant VENUE_ROLE = keccak256("VENUE_ROLE");
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

    event TicketCreated(uint256 indexed tokenId, address indexed to, string eventName, uint256 eventDate);
    event TicketIssued(uint256 indexed tokenId, address indexed to, string eventName, string seatNumber);
    event FanAdmitted(uint256 indexed tokenId, address indexed fan, uint256 admittedAt);
    event TicketUsed(uint256 indexed tokenId, address indexed fan);
    event TicketClosed(uint256 indexed tokenId);
    event TicketCancelled(uint256 indexed tokenId, string reason);
    event TicketRefunded(uint256 indexed tokenId, address indexed to, uint256 amount);
    event TicketExpired(uint256 indexed tokenId, uint256 eventDate, uint256 currentTime);
    event TicketVoided(uint256 indexed tokenId, string reason);
    event TicketTransferred(uint256 indexed tokenId, address indexed from, address indexed to, uint8 transferCount);
    event MetadataUpdated(uint256 indexed tokenId, string field, string newValue, uint256 version);
    event AutoExpiryTriggered(uint256 indexed tokenId, uint256 eventDate);
    event ResalePriceCapEnforced(uint256 indexed tokenId, uint256 attemptedPrice, uint256 cap);
    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);
    event SeatChanged(uint256 indexed tokenId, string oldSection, string oldRow, string oldSeat, string newSection, string newRow, string newSeat);
    event EventDateChanged(uint256 indexed tokenId, uint256 oldDate, uint256 newDate);

    // ============================================================================
    // Errors
    // ============================================================================

    error NotOwner();
    error NotVenue();
    error NotAgent();
    error NotAdmin();
    error ContractPaused();
    error TokenDoesNotExist(uint256 tokenId);
    error InvalidStatus(uint256 tokenId, TicketStatus current, TicketStatus expected);
    error TransferWindowClosed(uint256 tokenId, uint256 eventDate);
    error TicketLockedAfterAdmission(uint256 tokenId);
    error MaxTransfersReached(uint256 tokenId, uint8 maxTransfers);
    error TicketNotTransferable(uint256 tokenId);
    error TicketAlreadyUsed(uint256 tokenId);
    error NotAuthorized();
    error InvalidEventDate();
    error InvalidDoorsOpenTime();
    error RefundFailed(uint256 tokenId);
    error ZeroAddress();
    error StatusNotCancellable(uint256 tokenId, TicketStatus current);
    error ResalePriceExceeded(uint256 tokenId, uint256 price, uint256 cap);
    error AgeVerificationRequired(uint256 tokenId);

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyVenue() {
        if (!_roles[VENUE_ROLE][msg.sender] && msg.sender != owner) revert NotVenue();
        _;
    }

    modifier onlyAgent() {
        if (!_roles[AGENT_ROLE][msg.sender] && !_roles[VENUE_ROLE][msg.sender] && msg.sender != owner) revert NotAgent();
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

    modifier inStatus(uint256 tokenId, TicketStatus expected) {
        if (_ticketData[tokenId].status != expected) {
            revert InvalidStatus(tokenId, _ticketData[tokenId].status, expected);
        }
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    /**
     * @notice Deploy a new ConcertTicketNFT contract
     * @param _name ERC721 collection name
     * @param _symbol ERC721 collection symbol
     * @param _baseURI Base URI for token metadata
     */
    constructor(string memory _name, string memory _symbol, string memory _baseURI) {
        name = _name;
        symbol = _symbol;
        baseURI = _baseURI;
        owner = msg.sender;
        _roles[VENUE_ROLE][msg.sender] = true;
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
        address ticketOwner = ownerOf(tokenId);
        require(to != ticketOwner, "ConcertTicketNFT: approve to owner");
        require(
            msg.sender == ticketOwner || isApprovedForAll(ticketOwner, msg.sender),
            "ConcertTicketNFT: not authorized"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(ticketOwner, to, tokenId);
    }

    /// @notice Returns the approved address for a token
    function getApproved(uint256 tokenId) public view tokenExists(tokenId) returns (address) {
        return _tokenApprovals[tokenId];
    }

    /// @notice Set or revoke operator approval for all tokens
    function setApprovalForAll(address operator, bool approved) public {
        require(msg.sender != operator, "ConcertTicketNFT: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// @notice Check if an operator is approved for all tokens of an owner
    function isApprovedForAll(address _ownerAddr, address operator) public view returns (bool) {
        return _operatorApprovals[_ownerAddr][operator];
    }

    /**
     * @notice Transfer with concert ticket-specific guards including anti-scalping
     * @dev Reverts if msg.value exceeds the ticket's resalePriceCap
     */
    function transferFrom(address from, address to, uint256 tokenId) public payable whenNotPaused {
        require(_isApprovedOrOwner(msg.sender, tokenId), "ConcertTicketNFT: not authorized");
        _transferTicket(from, to, tokenId);
    }

    /// @notice Safe transfer (checks recipient supports ERC721)
    function safeTransferFrom(address from, address to, uint256 tokenId) public payable {
        safeTransferFrom(from, to, tokenId, "");
    }

    /// @notice Safe transfer with data
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public payable {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "ConcertTicketNFT: unsafe recipient");
    }

    // ============================================================================
    // Ticket Issuance
    // ============================================================================

    /**
     * @notice Issue a new concert ticket NFT
     * @param to Fan wallet address
     * @param venueCode Venue identifier code
     * @param venueName Venue name
     * @param eventName Event / concert name
     * @param artist Performing artist or band
     * @param eventDate Unix timestamp of event date
     * @param doorsOpen Unix timestamp when doors open
     * @param section Seating section
     * @param row Seating row
     * @param seatNumber Seat number
     * @param seatingTier Seating tier enum
     * @param faceValue Original face value (in wei)
     * @param resalePriceCap Maximum resale price (in wei, 0 = no resale)
     * @param fanName Fan name for the ticket
     * @param maxTransfers Maximum allowed transfers
     * @param transferable Whether ticket can be transferred
     * @return tokenId The newly minted token ID
     */
    function issueTicket(
        address to,
        string calldata venueCode,
        string calldata venueName,
        string calldata eventName,
        string calldata artist,
        uint256 eventDate,
        uint256 doorsOpen,
        string calldata section,
        string calldata row,
        string calldata seatNumber,
        SeatingTier seatingTier,
        uint256 faceValue,
        uint256 resalePriceCap,
        string calldata fanName,
        uint8 maxTransfers,
        bool transferable
    ) external payable onlyAgent whenNotPaused returns (uint256) {
        if (eventDate <= block.timestamp) revert InvalidEventDate();
        if (doorsOpen >= eventDate) revert InvalidDoorsOpenTime();
        if (to == address(0)) revert ZeroAddress();

        uint256 tokenId = _nextTokenId++;

        _balances[to]++;
        _owners[tokenId] = to;

        _ticketData[tokenId] = TicketData({
            venueCode: venueCode,
            venueName: venueName,
            eventName: eventName,
            artist: artist,
            eventDate: eventDate,
            doorsOpen: doorsOpen,
            section: section,
            row: row,
            seatNumber: seatNumber,
            seatingTier: seatingTier,
            faceValue: faceValue,
            resalePriceCap: resalePriceCap,
            fanName: fanName,
            ageVerified: false,
            admittedAt: 0,
            status: TicketStatus.ISSUED,
            createdAt: block.timestamp,
            issuedAt: block.timestamp,
            transferCount: 0,
            maxTransfers: maxTransfers,
            transferable: transferable,
            metadataVersion: 1,
            pricePaid: msg.value,
            originalBuyer: payable(to)
        });

        // Track as active
        _activeTicketIndex[tokenId] = _activeTicketIds.length;
        _activeTicketIds.push(tokenId);
        _isActive[tokenId] = true;

        emit Transfer(address(0), to, tokenId);
        emit TicketIssued(tokenId, to, eventName, seatNumber);

        return tokenId;
    }

    /**
     * @notice Batch issue tickets for an event
     * @param fans Array of fan wallet addresses
     * @param venueCode Venue identifier code
     * @param venueName Venue name
     * @param eventName Event / concert name
     * @param artist Performing artist or band
     * @param eventDate Unix timestamp of event date
     * @param doorsOpen Unix timestamp when doors open
     * @param sections Array of seating sections
     * @param rows Array of seating rows
     * @param seatNumbers Array of seat numbers
     * @param seatingTiers Array of seating tier enums
     * @param faceValue Face value for all tickets
     * @param resalePriceCap Resale price cap for all tickets
     * @param fanNames Array of fan names
     * @param maxTransfers Maximum allowed transfers per ticket
     * @param transferable Whether tickets can be transferred
     * @return tokenIds Array of newly minted token IDs
     */
    function batchIssueTickets(
        address[] calldata fans,
        string calldata venueCode,
        string calldata venueName,
        string calldata eventName,
        string calldata artist,
        uint256 eventDate,
        uint256 doorsOpen,
        string[] calldata sections,
        string[] calldata rows,
        string[] calldata seatNumbers,
        SeatingTier[] calldata seatingTiers,
        uint256 faceValue,
        uint256 resalePriceCap,
        string[] calldata fanNames,
        uint8 maxTransfers,
        bool transferable
    ) external onlyAgent whenNotPaused returns (uint256[] memory) {
        require(
            fans.length == seatNumbers.length &&
            fans.length == sections.length &&
            fans.length == rows.length &&
            fans.length == seatingTiers.length &&
            fans.length == fanNames.length,
            "ConcertTicketNFT: length mismatch"
        );
        if (eventDate <= block.timestamp) revert InvalidEventDate();
        if (doorsOpen >= eventDate) revert InvalidDoorsOpenTime();

        uint256[] memory tokenIds = new uint256[](fans.length);

        for (uint256 i = 0; i < fans.length; i++) {
            if (fans[i] == address(0)) revert ZeroAddress();

            uint256 tokenId = _nextTokenId++;
            _balances[fans[i]]++;
            _owners[tokenId] = fans[i];

            _ticketData[tokenId] = TicketData({
                venueCode: venueCode,
                venueName: venueName,
                eventName: eventName,
                artist: artist,
                eventDate: eventDate,
                doorsOpen: doorsOpen,
                section: sections[i],
                row: rows[i],
                seatNumber: seatNumbers[i],
                seatingTier: seatingTiers[i],
                faceValue: faceValue,
                resalePriceCap: resalePriceCap,
                fanName: fanNames[i],
                ageVerified: false,
                admittedAt: 0,
                status: TicketStatus.ISSUED,
                createdAt: block.timestamp,
                issuedAt: block.timestamp,
                transferCount: 0,
                maxTransfers: maxTransfers,
                transferable: transferable,
                metadataVersion: 1,
                pricePaid: 0,
                originalBuyer: payable(fans[i])
            });

            _activeTicketIndex[tokenId] = _activeTicketIds.length;
            _activeTicketIds.push(tokenId);
            _isActive[tokenId] = true;

            emit Transfer(address(0), fans[i], tokenId);
            emit TicketIssued(tokenId, fans[i], eventName, seatNumbers[i]);

            tokenIds[i] = tokenId;
        }

        return tokenIds;
    }

    // ============================================================================
    // Ticket Lifecycle Operations
    // ============================================================================

    /**
     * @notice Admit a fan at the gate (gate scan)
     * @param tokenId The ticket token ID
     */
    function admitFan(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyVenue inStatus(tokenId, TicketStatus.ISSUED) {
        TicketData storage ticket = _ticketData[tokenId];
        ticket.status = TicketStatus.ADMITTED;
        ticket.admittedAt = block.timestamp;
        ticket.metadataVersion++;

        emit FanAdmitted(tokenId, _owners[tokenId], block.timestamp);
        emit MetadataUpdated(tokenId, "status", "ADMITTED", ticket.metadataVersion);
    }

    /**
     * @notice Mark ticket as used (event attended / completed)
     * @param tokenId The ticket token ID
     */
    function markUsed(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyVenue inStatus(tokenId, TicketStatus.ADMITTED) {
        TicketData storage ticket = _ticketData[tokenId];
        ticket.status = TicketStatus.USED;
        ticket.metadataVersion++;

        emit TicketUsed(tokenId, _owners[tokenId]);
        emit MetadataUpdated(tokenId, "status", "USED", ticket.metadataVersion);
    }

    /**
     * @notice Cancel a ticket
     * @param tokenId The ticket token ID
     * @param reason Cancellation reason
     */
    function cancelTicket(uint256 tokenId, string calldata reason) external tokenExists(tokenId) onlyVenue {
        TicketData storage ticket = _ticketData[tokenId];

        if (
            ticket.status != TicketStatus.CREATED &&
            ticket.status != TicketStatus.ISSUED
        ) {
            revert StatusNotCancellable(tokenId, ticket.status);
        }

        ticket.status = TicketStatus.CANCELLED;
        ticket.metadataVersion++;
        refundPending[tokenId] = true;

        emit TicketCancelled(tokenId, reason);
        emit MetadataUpdated(tokenId, "status", "CANCELLED", ticket.metadataVersion);
    }

    /**
     * @notice Refund a cancelled ticket
     * @param tokenId The ticket token ID
     */
    function refundTicket(uint256 tokenId) external tokenExists(tokenId) onlyVenue {
        TicketData storage ticket = _ticketData[tokenId];
        require(ticket.status == TicketStatus.CANCELLED, "ConcertTicketNFT: not cancelled");
        require(refundPending[tokenId], "ConcertTicketNFT: no refund pending");

        refundPending[tokenId] = false;
        ticket.status = TicketStatus.REFUNDED;
        ticket.metadataVersion++;

        if (ticket.pricePaid > 0 && address(this).balance >= ticket.pricePaid) {
            (bool success, ) = ticket.originalBuyer.call{value: ticket.pricePaid}("");
            if (!success) revert RefundFailed(tokenId);
            emit TicketRefunded(tokenId, ticket.originalBuyer, ticket.pricePaid);
        }

        _removeFromActive(tokenId);

        emit MetadataUpdated(tokenId, "status", "REFUNDED", ticket.metadataVersion);
    }

    /**
     * @notice Close a used ticket (final state)
     * @param tokenId The ticket token ID
     */
    function closeTicket(
        uint256 tokenId
    ) external tokenExists(tokenId) onlyVenue inStatus(tokenId, TicketStatus.USED) {
        TicketData storage ticket = _ticketData[tokenId];
        ticket.status = TicketStatus.CLOSED;
        ticket.metadataVersion++;

        _removeFromActive(tokenId);

        emit TicketClosed(tokenId);
        emit MetadataUpdated(tokenId, "status", "CLOSED", ticket.metadataVersion);
    }

    /**
     * @notice Void a ticket (admin override for exceptional circumstances)
     * @param tokenId The ticket token ID
     * @param reason Reason for voiding
     */
    function voidTicket(uint256 tokenId, string calldata reason) external tokenExists(tokenId) onlyAdmin {
        TicketData storage ticket = _ticketData[tokenId];
        ticket.status = TicketStatus.VOID;
        ticket.metadataVersion++;

        _removeFromActive(tokenId);

        emit TicketVoided(tokenId, reason);
        emit MetadataUpdated(tokenId, "status", "VOID", ticket.metadataVersion);
    }

    /**
     * @notice Verify age for age-restricted events
     * @param tokenId The ticket token ID
     */
    function verifyAge(uint256 tokenId) external tokenExists(tokenId) onlyVenue {
        TicketData storage ticket = _ticketData[tokenId];
        ticket.ageVerified = true;
        ticket.metadataVersion++;

        emit MetadataUpdated(tokenId, "ageVerified", "true", ticket.metadataVersion);
    }

    // ============================================================================
    // Dynamic Metadata Updates
    // ============================================================================

    /**
     * @notice Update seat assignment
     * @param tokenId The ticket token ID
     * @param newSection New section
     * @param newRow New row
     * @param newSeatNumber New seat number
     * @param newTier New seating tier
     */
    function updateSeat(
        uint256 tokenId,
        string calldata newSection,
        string calldata newRow,
        string calldata newSeatNumber,
        SeatingTier newTier
    ) external tokenExists(tokenId) onlyVenue {
        TicketData storage ticket = _ticketData[tokenId];
        require(
            ticket.status == TicketStatus.CREATED || ticket.status == TicketStatus.ISSUED,
            "ConcertTicketNFT: can only update seat before admission"
        );

        string memory oldSection = ticket.section;
        string memory oldRow = ticket.row;
        string memory oldSeat = ticket.seatNumber;

        ticket.section = newSection;
        ticket.row = newRow;
        ticket.seatNumber = newSeatNumber;
        ticket.seatingTier = newTier;
        ticket.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "seat",
            oldValue: string(abi.encodePacked(oldSection, "-", oldRow, "-", oldSeat)),
            newValue: string(abi.encodePacked(newSection, "-", newRow, "-", newSeatNumber)),
            changedBy: msg.sender
        }));

        emit SeatChanged(tokenId, oldSection, oldRow, oldSeat, newSection, newRow, newSeatNumber);
        emit MetadataUpdated(tokenId, "seatNumber", newSeatNumber, ticket.metadataVersion);
    }

    /**
     * @notice Update event date (reschedule)
     * @param tokenId The ticket token ID
     * @param newEventDate New event date
     * @param newDoorsOpen New doors open time
     */
    function updateEventDate(
        uint256 tokenId,
        uint256 newEventDate,
        uint256 newDoorsOpen
    ) external tokenExists(tokenId) onlyVenue {
        TicketData storage ticket = _ticketData[tokenId];
        require(
            ticket.status != TicketStatus.CLOSED &&
            ticket.status != TicketStatus.VOID &&
            ticket.status != TicketStatus.EXPIRED &&
            ticket.status != TicketStatus.REFUNDED,
            "ConcertTicketNFT: ticket inactive"
        );
        if (newEventDate <= block.timestamp) revert InvalidEventDate();
        if (newDoorsOpen >= newEventDate) revert InvalidDoorsOpenTime();

        uint256 oldEventDate = ticket.eventDate;
        ticket.eventDate = newEventDate;
        ticket.doorsOpen = newDoorsOpen;
        ticket.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "eventDate",
            oldValue: _toString(oldEventDate),
            newValue: _toString(newEventDate),
            changedBy: msg.sender
        }));

        emit EventDateChanged(tokenId, oldEventDate, newEventDate);
        emit MetadataUpdated(tokenId, "eventDate", _toString(newEventDate), ticket.metadataVersion);
    }

    /**
     * @notice Update resale price cap
     * @param tokenId The ticket token ID
     * @param newCap New resale price cap (in wei)
     */
    function updateResalePriceCap(uint256 tokenId, uint256 newCap) external tokenExists(tokenId) onlyVenue {
        TicketData storage ticket = _ticketData[tokenId];
        require(
            ticket.status == TicketStatus.CREATED || ticket.status == TicketStatus.ISSUED,
            "ConcertTicketNFT: can only update cap before admission"
        );

        uint256 oldCap = ticket.resalePriceCap;
        ticket.resalePriceCap = newCap;
        ticket.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "resalePriceCap",
            oldValue: _toString(oldCap),
            newValue: _toString(newCap),
            changedBy: msg.sender
        }));

        emit MetadataUpdated(tokenId, "resalePriceCap", _toString(newCap), ticket.metadataVersion);
    }

    /**
     * @notice Update token URI (IPFS metadata pointer)
     * @param tokenId The ticket token ID
     * @param uri New URI string
     */
    function setTicketURI(uint256 tokenId, string calldata uri) external tokenExists(tokenId) onlyVenue {
        _tokenURIs[tokenId] = uri;
        _ticketData[tokenId].metadataVersion++;
        emit MetadataUpdated(tokenId, "tokenURI", uri, _ticketData[tokenId].metadataVersion);
    }

    // ============================================================================
    // Chainlink Automation (Auto-Expiry)
    // ============================================================================

    /**
     * @notice Check if any tickets need automatic expiry processing
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Encoded ticket IDs to expire
     */
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        if (block.timestamp < lastUpkeepTime + minCheckInterval) {
            return (false, "");
        }

        uint256[] memory expireIds = new uint256[](maxTicketsPerUpkeep);
        uint256 expireCount = 0;

        for (uint256 i = 0; i < _activeTicketIds.length && expireCount < maxTicketsPerUpkeep; i++) {
            uint256 tokenId = _activeTicketIds[i];
            if (!_isActive[tokenId]) continue;

            TicketData memory ticket = _ticketData[tokenId];

            // Auto-expire: event date + 6h grace has passed and ticket not used/closed
            if (
                ticket.status == TicketStatus.CREATED ||
                ticket.status == TicketStatus.ISSUED ||
                ticket.status == TicketStatus.ADMITTED
            ) {
                if (block.timestamp > ticket.eventDate + AUTO_EXPIRE_GRACE) {
                    expireIds[expireCount] = tokenId;
                    expireCount++;
                }
            }
        }

        if (expireCount > 0) {
            uint256[] memory trimmedExpire = new uint256[](expireCount);
            for (uint256 i = 0; i < expireCount; i++) trimmedExpire[i] = expireIds[i];

            upkeepNeeded = true;
            performData = abi.encode(trimmedExpire);
        }
    }

    /**
     * @notice Execute automatic expiry processing
     * @param performData Encoded array of token IDs to expire
     */
    function performUpkeep(bytes calldata performData) external override {
        uint256[] memory expireIds = abi.decode(performData, (uint256[]));

        for (uint256 i = 0; i < expireIds.length; i++) {
            uint256 tokenId = expireIds[i];
            if (_owners[tokenId] == address(0)) continue;

            TicketData storage ticket = _ticketData[tokenId];
            if (
                block.timestamp > ticket.eventDate + AUTO_EXPIRE_GRACE &&
                ticket.status != TicketStatus.USED &&
                ticket.status != TicketStatus.CLOSED &&
                ticket.status != TicketStatus.CANCELLED &&
                ticket.status != TicketStatus.REFUNDED &&
                ticket.status != TicketStatus.EXPIRED &&
                ticket.status != TicketStatus.VOID
            ) {
                ticket.status = TicketStatus.EXPIRED;
                ticket.metadataVersion++;
                _removeFromActive(tokenId);

                emit TicketExpired(tokenId, ticket.eventDate, block.timestamp);
                emit AutoExpiryTriggered(tokenId, ticket.eventDate);
            }
        }

        lastUpkeepTime = block.timestamp;
    }

    // ============================================================================
    // Query Functions
    // ============================================================================

    /// @notice Get full ticket data for a token
    function getTicketData(uint256 tokenId) external view tokenExists(tokenId) returns (TicketData memory) {
        return _ticketData[tokenId];
    }

    /// @notice Get metadata change history for a token
    function getMetadataHistory(uint256 tokenId) external view tokenExists(tokenId) returns (MetadataChange[] memory) {
        return _metadataHistory[tokenId];
    }

    /// @notice Get current metadata version for a token
    function getMetadataVersion(uint256 tokenId) external view tokenExists(tokenId) returns (uint256) {
        return _ticketData[tokenId].metadataVersion;
    }

    /// @notice Check if a ticket is currently valid (active lifecycle)
    function isTicketValid(uint256 tokenId) external view returns (bool) {
        if (_owners[tokenId] == address(0)) return false;
        TicketData memory ticket = _ticketData[tokenId];
        return ticket.status != TicketStatus.CLOSED &&
               ticket.status != TicketStatus.EXPIRED &&
               ticket.status != TicketStatus.CANCELLED &&
               ticket.status != TicketStatus.REFUNDED &&
               ticket.status != TicketStatus.VOID;
    }

    /// @notice Check if a ticket can be transferred and the reason if not
    function canTransfer(uint256 tokenId) external view returns (bool allowed, string memory reason) {
        if (_owners[tokenId] == address(0)) return (false, "Token does not exist");

        TicketData memory ticket = _ticketData[tokenId];

        if (!ticket.transferable) return (false, "Ticket is not transferable");
        if (ticket.status == TicketStatus.CLOSED) return (false, "Ticket is closed");
        if (ticket.status == TicketStatus.EXPIRED) return (false, "Ticket has expired");
        if (ticket.status == TicketStatus.CANCELLED) return (false, "Ticket is cancelled");
        if (ticket.status == TicketStatus.REFUNDED) return (false, "Ticket is refunded");
        if (ticket.status == TicketStatus.VOID) return (false, "Ticket is void");
        if (ticket.status == TicketStatus.ADMITTED || ticket.status == TicketStatus.USED) {
            return (false, "Ticket locked after admission");
        }
        if (ticket.transferCount >= ticket.maxTransfers) return (false, "Max transfers reached");
        if (block.timestamp >= ticket.eventDate - TRANSFER_WINDOW_CUTOFF) {
            return (false, "Transfer window closed (< 24h to event)");
        }

        return (true, "");
    }

    /// @notice Get the number of currently active tickets
    function getActiveTicketCount() external view returns (uint256) {
        return _activeTicketIds.length;
    }

    /// @notice Get total number of tickets ever created
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

    /// @notice Set maximum tickets processed per upkeep call
    function setMaxTicketsPerUpkeep(uint256 max) external onlyOwner {
        maxTicketsPerUpkeep = max;
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
        require(address(this).balance >= amount, "ConcertTicketNFT: insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "ConcertTicketNFT: withdraw failed");
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Transfer with concert ticket-specific guards including anti-scalping
     * @dev Enforces resalePriceCap: if msg.value > cap, transfer reverts
     */
    function _transferTicket(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "ConcertTicketNFT: not owner");
        if (to == address(0)) revert ZeroAddress();

        TicketData storage ticket = _ticketData[tokenId];

        // Guard: transferability
        if (!ticket.transferable) revert TicketNotTransferable(tokenId);

        // Guard: status must be CREATED or ISSUED
        if (ticket.status != TicketStatus.CREATED && ticket.status != TicketStatus.ISSUED) {
            if (ticket.status == TicketStatus.ADMITTED || ticket.status == TicketStatus.USED) {
                revert TicketLockedAfterAdmission(tokenId);
            }
            revert TicketAlreadyUsed(tokenId);
        }

        // Guard: transfer window (24h before event)
        if (block.timestamp >= ticket.eventDate - TRANSFER_WINDOW_CUTOFF) {
            revert TransferWindowClosed(tokenId, ticket.eventDate);
        }

        // Guard: max transfers
        if (ticket.transferCount >= ticket.maxTransfers) {
            revert MaxTransfersReached(tokenId, ticket.maxTransfers);
        }

        // Anti-scalping: enforce resale price cap
        if (ticket.resalePriceCap > 0 && msg.value > ticket.resalePriceCap) {
            revert ResalePriceExceeded(tokenId, msg.value, ticket.resalePriceCap);
        }

        // Execute transfer
        delete _tokenApprovals[tokenId];
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        ticket.transferCount++;
        ticket.metadataVersion++;

        // Forward any payment to the seller
        if (msg.value > 0) {
            (bool success, ) = payable(from).call{value: msg.value}("");
            require(success, "ConcertTicketNFT: payment forwarding failed");
        }

        emit Transfer(from, to, tokenId);
        emit TicketTransferred(tokenId, from, to, ticket.transferCount);
    }

    /// @notice Remove from active ticket tracking (swap and pop)
    function _removeFromActive(uint256 tokenId) internal {
        if (!_isActive[tokenId]) return;
        _isActive[tokenId] = false;

        uint256 index = _activeTicketIndex[tokenId];
        uint256 lastIndex = _activeTicketIds.length - 1;

        if (index != lastIndex) {
            uint256 lastTokenId = _activeTicketIds[lastIndex];
            _activeTicketIds[index] = lastTokenId;
            _activeTicketIndex[lastTokenId] = index;
        }

        _activeTicketIds.pop();
        delete _activeTicketIndex[tokenId];
    }

    /// @notice Check if spender is approved or owner of token
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address ticketOwner = ownerOf(tokenId);
        return (spender == ticketOwner || getApproved(tokenId) == spender || isApprovedForAll(ticketOwner, spender));
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
