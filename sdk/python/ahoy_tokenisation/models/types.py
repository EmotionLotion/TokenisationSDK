"""
Pydantic models for all AHOY API types.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field


# ============================================================================
# ENUMS
# ============================================================================


class InvestorType(str, Enum):
    INDIVIDUAL = "individual"
    INSTITUTIONAL = "institutional"
    QUALIFIED = "qualified"
    ACCREDITED = "accredited"


class InvestorStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    BLOCKED = "blocked"


class KycStatus(str, Enum):
    NONE = "none"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class WalletStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    BLOCKED = "blocked"


class TokenStatus(str, Enum):
    DRAFT = "draft"
    DEPLOYING = "deploying"
    DEPLOYED = "deployed"
    PAUSED = "paused"
    FROZEN = "frozen"
    DEPRECATED = "deprecated"


class TokenStandard(str, Enum):
    ERC3643 = "ERC3643"
    ERC1400 = "ERC1400"
    ERC20 = "ERC20"


class TransferStatus(str, Enum):
    PENDING = "pending"
    PRECHECKED = "prechecked"
    APPROVED = "approved"
    SIGNED = "signed"
    SUBMITTED = "submitted"
    CONFIRMED = "confirmed"
    RECONCILED = "reconciled"
    SETTLED = "settled"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DistributionType(str, Enum):
    DIVIDEND = "DIVIDEND"
    INTEREST = "INTEREST"
    ROYALTY = "ROYALTY"
    REVENUE_SHARE = "REVENUE_SHARE"
    RENT = "RENT"
    PROFIT_SHARE = "PROFIT_SHARE"
    YIELD = "YIELD"
    CUSTOM = "CUSTOM"


class DistributionFrequency(str, Enum):
    ONE_TIME = "ONE_TIME"
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    BIWEEKLY = "BIWEEKLY"
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"
    SEMI_ANNUAL = "SEMI_ANNUAL"
    ANNUAL = "ANNUAL"
    ON_DEMAND = "ON_DEMAND"


class AllocationStrategy(str, Enum):
    PRO_RATA = "PRO_RATA"
    EQUAL = "EQUAL"
    TIERED = "TIERED"
    TIME_WEIGHTED = "TIME_WEIGHTED"
    CUSTOM = "CUSTOM"


class DistributionEventStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


# ============================================================================
# BASE MODEL
# ============================================================================


class AhoyModel(BaseModel):
    """Base model with common configuration."""

    class Config:
        use_enum_values = True
        populate_by_name = True


# ============================================================================
# INVESTOR MODELS
# ============================================================================


class Investor(AhoyModel):
    id: str
    org_id: str = Field(alias="orgId")
    external_id: Optional[str] = Field(None, alias="externalId")
    email: str
    phone: Optional[str] = None
    type: InvestorType
    status: InvestorStatus
    kyc_status: KycStatus = Field(alias="kycStatus")
    kyc_level: Optional[str] = Field(None, alias="kycLevel")
    country_code: str = Field(alias="countryCode")
    tax_residency: Optional[str] = Field(None, alias="taxResidency")
    profile: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class KycSession(AhoyModel):
    id: str
    investor_id: str = Field(alias="investorId")
    provider: str
    external_id: Optional[str] = Field(None, alias="externalId")
    status: str
    level_requested: str = Field(alias="levelRequested")
    level_granted: Optional[str] = Field(None, alias="levelGranted")
    verification_url: Optional[str] = Field(None, alias="verificationUrl")
    result: Optional[Dict[str, Any]] = None
    completed_at: Optional[datetime] = Field(None, alias="completedAt")
    expires_at: Optional[datetime] = Field(None, alias="expiresAt")
    created_at: datetime = Field(alias="createdAt")


class InvestorWallet(AhoyModel):
    id: str
    investor_id: str = Field(alias="investorId")
    address: str
    chain_id: int = Field(alias="chainId")
    label: Optional[str] = None
    status: WalletStatus
    verified_at: Optional[datetime] = Field(None, alias="verifiedAt")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")


# ============================================================================
# TOKEN MODELS
# ============================================================================


class Token(AhoyModel):
    id: str
    org_id: str = Field(alias="orgId")
    project_id: str = Field(alias="projectId")
    name: str
    symbol: str
    decimals: int = 18
    standard: TokenStandard
    total_supply: str = Field(alias="totalSupply")
    issued_supply: str = Field("0", alias="issuedSupply")
    chain_id: int = Field(alias="chainId")
    contract_address: Optional[str] = Field(None, alias="contractAddress")
    status: TokenStatus
    compliance_modules: List[str] = Field(default_factory=list, alias="complianceModules")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class CapTableEntry(AhoyModel):
    investor_id: str = Field(alias="investorId")
    wallet_address: str = Field(alias="walletAddress")
    balance: str
    percentage: str
    locked_balance: str = Field("0", alias="lockedBalance")


# ============================================================================
# TRANSFER MODELS
# ============================================================================


class Transfer(AhoyModel):
    id: str
    org_id: str = Field(alias="orgId")
    token_id: str = Field(alias="tokenId")
    from_wallet: str = Field(alias="fromWallet")
    to_wallet: str = Field(alias="toWallet")
    from_investor_id: Optional[str] = Field(None, alias="fromInvestorId")
    to_investor_id: Optional[str] = Field(None, alias="toInvestorId")
    amount: str
    status: TransferStatus
    decision_id: Optional[str] = Field(None, alias="decisionId")
    tx_hash: Optional[str] = Field(None, alias="txHash")
    block_number: Optional[int] = Field(None, alias="blockNumber")
    idempotency_key: Optional[str] = Field(None, alias="idempotencyKey")
    expires_at: Optional[datetime] = Field(None, alias="expiresAt")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


# ============================================================================
# DISTRIBUTION MODELS
# ============================================================================


class DistributionSchedule(AhoyModel):
    id: str
    org_id: str = Field(alias="orgId")
    token_id: str = Field(alias="tokenId")
    type: DistributionType
    frequency: DistributionFrequency
    allocation_strategy: AllocationStrategy = Field(alias="allocationStrategy")
    payment_currency: str = Field(alias="paymentCurrency")
    amount: Optional[str] = None
    rate: Optional[float] = None
    start_date: str = Field(alias="startDate")
    end_date: Optional[str] = Field(None, alias="endDate")
    next_distribution: Optional[str] = Field(None, alias="nextDistribution")
    is_active: bool = Field(alias="isActive")
    minimum_balance: Optional[str] = Field(None, alias="minimumBalance")
    parameters: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class DistributionEvent(AhoyModel):
    id: str
    org_id: str = Field(alias="orgId")
    schedule_id: str = Field(alias="scheduleId")
    token_id: str = Field(alias="tokenId")
    type: DistributionType
    status: DistributionEventStatus
    total_amount: str = Field(alias="totalAmount")
    currency: str
    recipient_count: int = Field(alias="recipientCount")
    snapshot_at: str = Field(alias="snapshotAt")
    executed_at: Optional[str] = Field(None, alias="executedAt")
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(alias="createdAt")


class Payout(AhoyModel):
    id: str
    org_id: str = Field(alias="orgId")
    distribution_id: str = Field(alias="distributionId")
    recipient_id: str = Field(alias="recipientId")
    recipient_address: Optional[str] = Field(None, alias="recipientAddress")
    amount: str
    claimed: bool
    claimed_at: Optional[str] = Field(None, alias="claimedAt")
    tx_hash: Optional[str] = Field(None, alias="txHash")
    created_at: str = Field(alias="createdAt")


# ============================================================================
# COMPLIANCE MODELS
# ============================================================================


class Rule(AhoyModel):
    id: str
    type: str
    field: str
    op: str
    value: Any
    message: Optional[str] = None
    code: Optional[str] = None


class Policy(AhoyModel):
    id: str
    org_id: str = Field(alias="orgId")
    name: str
    description: Optional[str] = None
    type: str
    status: str
    current_version: int = Field(alias="currentVersion")
    rules: List[Rule] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class ComplianceDecision(AhoyModel):
    id: str
    org_id: str = Field(alias="orgId")
    type: str
    result: str  # "allow" | "deny"
    reasons: List[str] = Field(default_factory=list)
    policy_id: Optional[str] = Field(None, alias="policyId")
    policy_version: Optional[int] = Field(None, alias="policyVersion")
    inputs_hash: Optional[str] = Field(None, alias="inputsHash")
    signature: Optional[str] = None
    subject_ref: Optional[str] = Field(None, alias="subjectRef")
    created_at: datetime = Field(alias="createdAt")


# ============================================================================
# WEBHOOK MODELS
# ============================================================================


class WebhookEndpoint(AhoyModel):
    id: str
    org_id: str = Field(alias="orgId")
    url: str
    description: Optional[str] = None
    events: List[str] = Field(default_factory=list)
    status: str
    secret: Optional[str] = None  # Only returned on creation
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class WebhookDelivery(AhoyModel):
    id: str
    endpoint_id: str = Field(alias="endpointId")
    event_type: str = Field(alias="eventType")
    status: str
    attempts: int
    last_attempt_at: Optional[datetime] = Field(None, alias="lastAttemptAt")
    response_status: Optional[int] = Field(None, alias="responseStatus")
    created_at: datetime = Field(alias="createdAt")


# ============================================================================
# COMMON MODELS
# ============================================================================

T = TypeVar("T")


class PaginatedResponse(AhoyModel, Generic[T]):
    data: List[T]
    count: int
    total: Optional[int] = None
    limit: Optional[int] = None
    offset: Optional[int] = None
