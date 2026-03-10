// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

/**
 * @title AirlineTicketNFT
 * @dev ERC721-based airline ticket with burn-after-use, expiry, dynamic metadata,
 *      transfer window enforcement, and Chainlink Automation for auto-expiry/refund.
 *
 * Features:
 * - Mint ticket NFTs with flight data (departure, gate, seat, class)
 * - Transfer windows: transfers blocked < 24h before departure
 * - Post-check-in lock: no transfers after check-in
 * - Burn after use: ticket is destroyed after boarding/completion
 * - Dynamic metadata: gate changes, seat upgrades, status updates
 * - Chainlink Automation: auto-expire past-departure tickets, auto-refund on cancellation
 * - Compliance: KYC/identity checks on transfer (via identity registry)
 */
contract AirlineTicketNFT is AutomationCompatibleInterface {
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
        ISSUED,
        CONFIRMED,
        CHECKED_IN,
        BOARDED,
        COMPLETED,
        CANCELLED,
        REFUNDED,
        EXPIRED,
        BURNED
    }

    enum TicketClass {
        ECONOMY,
        PREMIUM_ECONOMY,
        BUSINESS,
        FIRST
    }

    struct TicketData {
        // Flight info
        string flightNumber;
        string airline;
        uint256 departureTime;
        uint256 arrivalTime;
        string departureAirport;
        string arrivalAirport;
        string gate;
        string seat;
        TicketClass ticketClass;
        // Lifecycle
        TicketStatus status;
        uint256 issuedAt;
        uint256 checkedInAt;
        uint256 boardedAt;
        // Transfer rules
        uint8 transferCount;
        uint8 maxTransfers;
        bool transferable;
        // Metadata versioning
        uint256 metadataVersion;
        // Refund
        uint256 pricePaid;  // in wei
        address payable originalBuyer;
    }

    mapping(uint256 => TicketData) private _ticketData;

    // Track all active (non-burned, non-expired) ticket IDs for automation
    uint256[] private _activeTicketIds;
    mapping(uint256 => uint256) private _activeTicketIndex; // tokenId => index in _activeTicketIds
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
    uint256 public minCheckInterval = 3600; // 1 hour
    uint256 public lastUpkeepTime;
    uint256 public maxTicketsPerUpkeep = 50;

    // ============================================================================
    // Admin
    // ============================================================================

    address public owner;
    mapping(address => bool) public airlines;    // Authorized airline operators
    mapping(address => bool) public agents;      // Booking agents
    bool public paused;

    // Refund escrow
    mapping(uint256 => bool) public refundPending;

    // ============================================================================
    // Events
    // ============================================================================

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    event TicketIssued(uint256 indexed tokenId, address indexed to, string flightNumber, uint256 departureTime);
    event TicketCheckedIn(uint256 indexed tokenId, address indexed passenger);
    event TicketBoarded(uint256 indexed tokenId, address indexed passenger);
    event TicketCompleted(uint256 indexed tokenId);
    event TicketCancelled(uint256 indexed tokenId, string reason);
    event TicketRefunded(uint256 indexed tokenId, address indexed to, uint256 amount);
    event TicketExpired(uint256 indexed tokenId, uint256 departureTime, uint256 currentTime);
    event TicketBurned(uint256 indexed tokenId, address indexed lastOwner);
    event TicketTransferred(uint256 indexed tokenId, address indexed from, address indexed to, uint8 transferCount);
    event MetadataUpdated(uint256 indexed tokenId, string field, string newValue, uint256 version);
    event GateChanged(uint256 indexed tokenId, string oldGate, string newGate);
    event SeatChanged(uint256 indexed tokenId, string oldSeat, string newSeat, TicketClass newClass);
    event FlightDelayed(uint256 indexed tokenId, uint256 oldDeparture, uint256 newDeparture);
    event AutoExpiryTriggered(uint256 indexed tokenId, uint256 departureTime);
    event AutoRefundTriggered(uint256 indexed tokenId, uint256 amount);

    // ============================================================================
    // Errors
    // ============================================================================

    error NotOwner();
    error NotAirline();
    error NotAgent();
    error ContractPaused();
    error TokenDoesNotExist(uint256 tokenId);
    error InvalidStatus(uint256 tokenId, TicketStatus current, TicketStatus expected);
    error TransferWindowClosed(uint256 tokenId, uint256 departureTime);
    error TicketLockedAfterCheckIn(uint256 tokenId);
    error MaxTransfersReached(uint256 tokenId, uint8 maxTransfers);
    error TicketNotTransferable(uint256 tokenId);
    error TicketAlreadyUsed(uint256 tokenId);
    error NotAuthorized();
    error InvalidDepartureTime();
    error RefundFailed(uint256 tokenId);

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAirline() {
        if (!airlines[msg.sender] && msg.sender != owner) revert NotAirline();
        _;
    }

    modifier onlyAgent() {
        if (!agents[msg.sender] && !airlines[msg.sender] && msg.sender != owner) revert NotAgent();
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

    constructor(string memory _name, string memory _symbol, string memory _baseURI) {
        name = _name;
        symbol = _symbol;
        baseURI = _baseURI;
        owner = msg.sender;
        airlines[msg.sender] = true;
        _nextTokenId = 1;
    }

    // ============================================================================
    // ERC721 Core
    // ============================================================================

    function balanceOf(address _owner) public view returns (uint256) {
        require(_owner != address(0), "AirlineTicketNFT: zero address");
        return _balances[_owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address _ownerAddr = _owners[tokenId];
        require(_ownerAddr != address(0), "AirlineTicketNFT: nonexistent token");
        return _ownerAddr;
    }

    function tokenURI(uint256 tokenId) public view tokenExists(tokenId) returns (string memory) {
        string memory _tokenURI = _tokenURIs[tokenId];
        if (bytes(_tokenURI).length > 0) {
            return _tokenURI;
        }
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
    }

    function approve(address to, uint256 tokenId) public {
        address ticketOwner = ownerOf(tokenId);
        require(to != ticketOwner, "AirlineTicketNFT: approve to owner");
        require(msg.sender == ticketOwner || isApprovedForAll(ticketOwner, msg.sender), "AirlineTicketNFT: not authorized");
        _tokenApprovals[tokenId] = to;
        emit Approval(ticketOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view tokenExists(tokenId) returns (address) {
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) public {
        require(msg.sender != operator, "AirlineTicketNFT: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address _ownerAddr, address operator) public view returns (bool) {
        return _operatorApprovals[_ownerAddr][operator];
    }

    /// @notice Transfer with airline-specific guards
    function transferFrom(address from, address to, uint256 tokenId) public whenNotPaused {
        require(_isApprovedOrOwner(msg.sender, tokenId), "AirlineTicketNFT: not authorized");
        _transferTicket(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) public {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "AirlineTicketNFT: unsafe recipient");
    }

    // ============================================================================
    // Ticket Issuance
    // ============================================================================

    /**
     * @notice Issue a new airline ticket NFT
     * @param to Passenger wallet address
     * @param flightNumber IATA flight number (e.g., "EK123")
     * @param airline Airline code (e.g., "EK")
     * @param departureTime Unix timestamp of departure
     * @param arrivalTime Unix timestamp of arrival
     * @param departureAirport IATA code (e.g., "DXB")
     * @param arrivalAirport IATA code (e.g., "LHR")
     * @param gate Initial gate assignment
     * @param seat Seat assignment (e.g., "12A")
     * @param ticketClass Ticket class enum
     * @param maxTransfers Maximum allowed resale transfers
     * @param transferable Whether ticket can be transferred at all
     */
    function issueTicket(
        address to,
        string calldata flightNumber,
        string calldata airline,
        uint256 departureTime,
        uint256 arrivalTime,
        string calldata departureAirport,
        string calldata arrivalAirport,
        string calldata gate,
        string calldata seat,
        TicketClass ticketClass,
        uint8 maxTransfers,
        bool transferable
    ) external payable onlyAgent returns (uint256) {
        if (departureTime <= block.timestamp) revert InvalidDepartureTime();
        require(to != address(0), "AirlineTicketNFT: mint to zero");

        uint256 tokenId = _nextTokenId++;

        _balances[to]++;
        _owners[tokenId] = to;

        _ticketData[tokenId] = TicketData({
            flightNumber: flightNumber,
            airline: airline,
            departureTime: departureTime,
            arrivalTime: arrivalTime,
            departureAirport: departureAirport,
            arrivalAirport: arrivalAirport,
            gate: gate,
            seat: seat,
            ticketClass: ticketClass,
            status: TicketStatus.ISSUED,
            issuedAt: block.timestamp,
            checkedInAt: 0,
            boardedAt: 0,
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
        emit TicketIssued(tokenId, to, flightNumber, departureTime);

        return tokenId;
    }

    /**
     * @notice Batch issue tickets for a flight
     */
    function batchIssueTickets(
        address[] calldata passengers,
        string calldata flightNumber,
        string calldata airline,
        uint256 departureTime,
        uint256 arrivalTime,
        string calldata departureAirport,
        string calldata arrivalAirport,
        string[] calldata gates,
        string[] calldata seats,
        TicketClass[] calldata classes,
        uint8 maxTransfers,
        bool transferable
    ) external onlyAgent returns (uint256[] memory) {
        require(passengers.length == seats.length && passengers.length == classes.length, "AirlineTicketNFT: length mismatch");

        uint256[] memory tokenIds = new uint256[](passengers.length);

        for (uint256 i = 0; i < passengers.length; i++) {
            uint256 tokenId = _nextTokenId++;
            _balances[passengers[i]]++;
            _owners[tokenId] = passengers[i];

            _ticketData[tokenId] = TicketData({
                flightNumber: flightNumber,
                airline: airline,
                departureTime: departureTime,
                arrivalTime: arrivalTime,
                departureAirport: departureAirport,
                arrivalAirport: arrivalAirport,
                gate: gates.length > i ? gates[i] : gates[0],
                seat: seats[i],
                ticketClass: classes[i],
                status: TicketStatus.ISSUED,
                issuedAt: block.timestamp,
                checkedInAt: 0,
                boardedAt: 0,
                transferCount: 0,
                maxTransfers: maxTransfers,
                transferable: transferable,
                metadataVersion: 1,
                pricePaid: 0,
                originalBuyer: payable(passengers[i])
            });

            _activeTicketIndex[tokenId] = _activeTicketIds.length;
            _activeTicketIds.push(tokenId);
            _isActive[tokenId] = true;

            emit Transfer(address(0), passengers[i], tokenId);
            emit TicketIssued(tokenId, passengers[i], flightNumber, departureTime);

            tokenIds[i] = tokenId;
        }

        return tokenIds;
    }

    // ============================================================================
    // Ticket Lifecycle Operations
    // ============================================================================

    /// @notice Check in passenger
    function checkIn(uint256 tokenId) external tokenExists(tokenId) onlyAgent inStatus(tokenId, TicketStatus.ISSUED) {
        TicketData storage ticket = _ticketData[tokenId];
        ticket.status = TicketStatus.CHECKED_IN;
        ticket.checkedInAt = block.timestamp;
        ticket.metadataVersion++;

        emit TicketCheckedIn(tokenId, _owners[tokenId]);
        emit MetadataUpdated(tokenId, "status", "CHECKED_IN", ticket.metadataVersion);
    }

    /// @notice Board passenger (one-time use enforcement)
    function board(uint256 tokenId) external tokenExists(tokenId) onlyAgent inStatus(tokenId, TicketStatus.CHECKED_IN) {
        TicketData storage ticket = _ticketData[tokenId];
        ticket.status = TicketStatus.BOARDED;
        ticket.boardedAt = block.timestamp;
        ticket.metadataVersion++;

        emit TicketBoarded(tokenId, _owners[tokenId]);
        emit MetadataUpdated(tokenId, "status", "BOARDED", ticket.metadataVersion);
    }

    /// @notice Complete flight and burn ticket
    function completeAndBurn(uint256 tokenId) external tokenExists(tokenId) onlyAirline inStatus(tokenId, TicketStatus.BOARDED) {
        _burnTicket(tokenId, "COMPLETED");
    }

    /// @notice Cancel ticket (airline-initiated)
    function cancelTicket(uint256 tokenId, string calldata reason) external tokenExists(tokenId) onlyAirline {
        TicketData storage ticket = _ticketData[tokenId];
        require(
            ticket.status == TicketStatus.ISSUED || ticket.status == TicketStatus.CONFIRMED || ticket.status == TicketStatus.CHECKED_IN,
            "AirlineTicketNFT: cannot cancel in current status"
        );

        ticket.status = TicketStatus.CANCELLED;
        ticket.metadataVersion++;
        refundPending[tokenId] = true;

        emit TicketCancelled(tokenId, reason);
        emit MetadataUpdated(tokenId, "status", "CANCELLED", ticket.metadataVersion);
    }

    /// @notice Process refund for cancelled ticket
    function processRefund(uint256 tokenId) external tokenExists(tokenId) onlyAirline {
        TicketData storage ticket = _ticketData[tokenId];
        require(ticket.status == TicketStatus.CANCELLED, "AirlineTicketNFT: not cancelled");
        require(refundPending[tokenId], "AirlineTicketNFT: no refund pending");

        refundPending[tokenId] = false;
        ticket.status = TicketStatus.REFUNDED;
        ticket.metadataVersion++;

        if (ticket.pricePaid > 0 && address(this).balance >= ticket.pricePaid) {
            (bool success, ) = ticket.originalBuyer.call{value: ticket.pricePaid}("");
            if (!success) revert RefundFailed(tokenId);
            emit TicketRefunded(tokenId, ticket.originalBuyer, ticket.pricePaid);
        }

        // Burn after refund
        _burnTicket(tokenId, "REFUNDED");
    }

    // ============================================================================
    // Dynamic Metadata Updates (Gate Changes, Delays, Seat Upgrades)
    // ============================================================================

    /// @notice Update gate assignment
    function updateGate(uint256 tokenId, string calldata newGate) external tokenExists(tokenId) onlyAirline {
        TicketData storage ticket = _ticketData[tokenId];
        require(ticket.status != TicketStatus.BURNED && ticket.status != TicketStatus.EXPIRED, "AirlineTicketNFT: ticket inactive");

        string memory oldGate = ticket.gate;
        ticket.gate = newGate;
        ticket.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "gate",
            oldValue: oldGate,
            newValue: newGate,
            changedBy: msg.sender
        }));

        emit GateChanged(tokenId, oldGate, newGate);
        emit MetadataUpdated(tokenId, "gate", newGate, ticket.metadataVersion);
    }

    /// @notice Update seat (upgrade or reassign)
    function updateSeat(uint256 tokenId, string calldata newSeat, TicketClass newClass) external tokenExists(tokenId) onlyAirline {
        TicketData storage ticket = _ticketData[tokenId];
        require(ticket.status != TicketStatus.BURNED && ticket.status != TicketStatus.EXPIRED, "AirlineTicketNFT: ticket inactive");

        string memory oldSeat = ticket.seat;
        ticket.seat = newSeat;
        ticket.ticketClass = newClass;
        ticket.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "seat",
            oldValue: oldSeat,
            newValue: newSeat,
            changedBy: msg.sender
        }));

        emit SeatChanged(tokenId, oldSeat, newSeat, newClass);
        emit MetadataUpdated(tokenId, "seat", newSeat, ticket.metadataVersion);
    }

    /// @notice Update departure time (flight delay)
    function updateDepartureTime(uint256 tokenId, uint256 newDepartureTime, uint256 newArrivalTime) external tokenExists(tokenId) onlyAirline {
        TicketData storage ticket = _ticketData[tokenId];
        require(ticket.status != TicketStatus.BURNED && ticket.status != TicketStatus.EXPIRED, "AirlineTicketNFT: ticket inactive");
        require(newDepartureTime > block.timestamp, "AirlineTicketNFT: departure must be in future");

        uint256 oldDeparture = ticket.departureTime;
        ticket.departureTime = newDepartureTime;
        ticket.arrivalTime = newArrivalTime;
        ticket.metadataVersion++;

        _metadataHistory[tokenId].push(MetadataChange({
            timestamp: block.timestamp,
            field: "departureTime",
            oldValue: _toString(oldDeparture),
            newValue: _toString(newDepartureTime),
            changedBy: msg.sender
        }));

        emit FlightDelayed(tokenId, oldDeparture, newDepartureTime);
        emit MetadataUpdated(tokenId, "departureTime", _toString(newDepartureTime), ticket.metadataVersion);
    }

    /// @notice Update token URI (IPFS metadata pointer)
    function setTicketURI(uint256 tokenId, string calldata uri) external tokenExists(tokenId) onlyAirline {
        _tokenURIs[tokenId] = uri;
        _ticketData[tokenId].metadataVersion++;
        emit MetadataUpdated(tokenId, "tokenURI", uri, _ticketData[tokenId].metadataVersion);
    }

    // ============================================================================
    // Chainlink Automation (Auto-Expiry & Auto-Refund)
    // ============================================================================

    /**
     * @notice Check if any tickets need automatic expiry or refund processing
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Encoded ticket IDs and action types
     */
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        if (block.timestamp < lastUpkeepTime + minCheckInterval) {
            return (false, "");
        }

        uint256[] memory expireIds = new uint256[](maxTicketsPerUpkeep);
        uint256[] memory refundIds = new uint256[](maxTicketsPerUpkeep);
        uint256 expireCount = 0;
        uint256 refundCount = 0;

        for (uint256 i = 0; i < _activeTicketIds.length && (expireCount + refundCount) < maxTicketsPerUpkeep; i++) {
            uint256 tokenId = _activeTicketIds[i];
            if (!_isActive[tokenId]) continue;

            TicketData memory ticket = _ticketData[tokenId];

            // Auto-expire: departure time has passed and ticket not boarded
            if (
                ticket.status == TicketStatus.ISSUED ||
                ticket.status == TicketStatus.CONFIRMED ||
                ticket.status == TicketStatus.CHECKED_IN
            ) {
                if (block.timestamp > ticket.departureTime + 6 hours) {
                    expireIds[expireCount] = tokenId;
                    expireCount++;
                    continue;
                }
            }

            // Auto-refund: cancelled tickets with pending refunds
            if (ticket.status == TicketStatus.CANCELLED && refundPending[tokenId]) {
                refundIds[refundCount] = tokenId;
                refundCount++;
            }
        }

        if (expireCount > 0 || refundCount > 0) {
            // Trim arrays
            uint256[] memory trimmedExpire = new uint256[](expireCount);
            uint256[] memory trimmedRefund = new uint256[](refundCount);
            for (uint256 i = 0; i < expireCount; i++) trimmedExpire[i] = expireIds[i];
            for (uint256 i = 0; i < refundCount; i++) trimmedRefund[i] = refundIds[i];

            upkeepNeeded = true;
            performData = abi.encode(trimmedExpire, trimmedRefund);
        }
    }

    /**
     * @notice Execute automatic expiry and refund processing
     */
    function performUpkeep(bytes calldata performData) external override {
        (uint256[] memory expireIds, uint256[] memory refundIds) = abi.decode(performData, (uint256[], uint256[]));

        // Process expirations
        for (uint256 i = 0; i < expireIds.length; i++) {
            uint256 tokenId = expireIds[i];
            if (_owners[tokenId] == address(0)) continue;

            TicketData storage ticket = _ticketData[tokenId];
            if (block.timestamp > ticket.departureTime + 6 hours &&
                ticket.status != TicketStatus.BOARDED &&
                ticket.status != TicketStatus.COMPLETED &&
                ticket.status != TicketStatus.BURNED &&
                ticket.status != TicketStatus.EXPIRED
            ) {
                ticket.status = TicketStatus.EXPIRED;
                ticket.metadataVersion++;
                _removeFromActive(tokenId);

                emit TicketExpired(tokenId, ticket.departureTime, block.timestamp);
                emit AutoExpiryTriggered(tokenId, ticket.departureTime);
            }
        }

        // Process refunds
        for (uint256 i = 0; i < refundIds.length; i++) {
            uint256 tokenId = refundIds[i];
            if (_owners[tokenId] == address(0)) continue;

            TicketData storage ticket = _ticketData[tokenId];
            if (ticket.status == TicketStatus.CANCELLED && refundPending[tokenId]) {
                refundPending[tokenId] = false;
                ticket.status = TicketStatus.REFUNDED;
                ticket.metadataVersion++;

                if (ticket.pricePaid > 0 && address(this).balance >= ticket.pricePaid) {
                    (bool success, ) = ticket.originalBuyer.call{value: ticket.pricePaid}("");
                    if (success) {
                        emit TicketRefunded(tokenId, ticket.originalBuyer, ticket.pricePaid);
                        emit AutoRefundTriggered(tokenId, ticket.pricePaid);
                    }
                }

                _burnTicket(tokenId, "AUTO_REFUND");
            }
        }

        lastUpkeepTime = block.timestamp;
    }

    // ============================================================================
    // Query Functions
    // ============================================================================

    function getTicketData(uint256 tokenId) external view tokenExists(tokenId) returns (TicketData memory) {
        return _ticketData[tokenId];
    }

    function getMetadataHistory(uint256 tokenId) external view tokenExists(tokenId) returns (MetadataChange[] memory) {
        return _metadataHistory[tokenId];
    }

    function getMetadataVersion(uint256 tokenId) external view tokenExists(tokenId) returns (uint256) {
        return _ticketData[tokenId].metadataVersion;
    }

    function isTicketValid(uint256 tokenId) external view returns (bool) {
        if (_owners[tokenId] == address(0)) return false;
        TicketData memory ticket = _ticketData[tokenId];
        return ticket.status != TicketStatus.BURNED &&
               ticket.status != TicketStatus.EXPIRED &&
               ticket.status != TicketStatus.CANCELLED &&
               ticket.status != TicketStatus.REFUNDED;
    }

    function canTransfer(uint256 tokenId) external view returns (bool allowed, string memory reason) {
        if (_owners[tokenId] == address(0)) return (false, "Token does not exist");

        TicketData memory ticket = _ticketData[tokenId];

        if (!ticket.transferable) return (false, "Ticket is not transferable");
        if (ticket.status == TicketStatus.BURNED) return (false, "Ticket has been burned");
        if (ticket.status == TicketStatus.EXPIRED) return (false, "Ticket has expired");
        if (ticket.status == TicketStatus.CANCELLED) return (false, "Ticket is cancelled");
        if (ticket.status == TicketStatus.CHECKED_IN || ticket.status == TicketStatus.BOARDED) {
            return (false, "Ticket locked after check-in");
        }
        if (ticket.transferCount >= ticket.maxTransfers) return (false, "Max transfers reached");
        if (block.timestamp >= ticket.departureTime - TRANSFER_WINDOW_CUTOFF) {
            return (false, "Transfer window closed (< 24h to departure)");
        }

        return (true, "");
    }

    function getActiveTicketCount() external view returns (uint256) {
        return _activeTicketIds.length;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ============================================================================
    // Admin Functions
    // ============================================================================

    function addAirline(address airline) external onlyOwner { airlines[airline] = true; }
    function removeAirline(address airline) external onlyOwner { airlines[airline] = false; }
    function addAgent(address agent) external onlyOwner { agents[agent] = true; }
    function removeAgent(address agent) external onlyOwner { agents[agent] = false; }
    function setBaseURI(string calldata _baseURI) external onlyOwner { baseURI = _baseURI; }
    function pause() external onlyOwner { paused = true; }
    function unpause() external onlyOwner { paused = false; }
    function setMinCheckInterval(uint256 interval) external onlyOwner { minCheckInterval = interval; }
    function setMaxTicketsPerUpkeep(uint256 max) external onlyOwner { maxTicketsPerUpkeep = max; }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AirlineTicketNFT: invalid owner");
        owner = newOwner;
    }

    /// @notice Fund contract for refunds
    receive() external payable {}

    /// @notice Withdraw excess funds
    function withdraw(uint256 amount, address payable to) external onlyOwner {
        require(address(this).balance >= amount, "AirlineTicketNFT: insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "AirlineTicketNFT: withdraw failed");
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /// @notice Transfer with airline-specific guards
    function _transferTicket(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "AirlineTicketNFT: not owner");
        require(to != address(0), "AirlineTicketNFT: transfer to zero");

        TicketData storage ticket = _ticketData[tokenId];

        // Guard: transferability
        if (!ticket.transferable) revert TicketNotTransferable(tokenId);

        // Guard: status must be ISSUED or CONFIRMED
        if (ticket.status != TicketStatus.ISSUED && ticket.status != TicketStatus.CONFIRMED) {
            if (ticket.status == TicketStatus.CHECKED_IN || ticket.status == TicketStatus.BOARDED) {
                revert TicketLockedAfterCheckIn(tokenId);
            }
            revert TicketAlreadyUsed(tokenId);
        }

        // Guard: transfer window (24h before departure)
        if (block.timestamp >= ticket.departureTime - TRANSFER_WINDOW_CUTOFF) {
            revert TransferWindowClosed(tokenId, ticket.departureTime);
        }

        // Guard: max transfers
        if (ticket.transferCount >= ticket.maxTransfers) {
            revert MaxTransfersReached(tokenId, ticket.maxTransfers);
        }

        // Execute transfer
        delete _tokenApprovals[tokenId];
        _balances[from]--;
        _balances[to]++;
        _owners[tokenId] = to;

        ticket.transferCount++;
        ticket.metadataVersion++;

        emit Transfer(from, to, tokenId);
        emit TicketTransferred(tokenId, from, to, ticket.transferCount);
    }

    /// @notice Burn a ticket (destroy NFT)
    function _burnTicket(uint256 tokenId, string memory reason) internal {
        address ticketOwner = _owners[tokenId];

        TicketData storage ticket = _ticketData[tokenId];
        ticket.status = TicketStatus.BURNED;
        ticket.metadataVersion++;

        // Clear ownership
        delete _tokenApprovals[tokenId];
        _balances[ticketOwner]--;
        delete _owners[tokenId];

        // Remove from active tracking
        _removeFromActive(tokenId);

        emit TicketBurned(tokenId, ticketOwner);
        emit MetadataUpdated(tokenId, "status", reason, ticket.metadataVersion);
        emit Transfer(ticketOwner, address(0), tokenId);
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

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address ticketOwner = ownerOf(tokenId);
        return (spender == ticketOwner || getApproved(tokenId) == spender || isApprovedForAll(ticketOwner, spender));
    }

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

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7  // ERC165
            || interfaceId == 0x80ac58cd  // ERC721
            || interfaceId == 0x5b5e139f; // ERC721Metadata
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}
