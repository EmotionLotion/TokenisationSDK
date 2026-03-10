# Tokenisation SDK - Terraform Variables
# Define all configurable parameters for infrastructure deployment

# ============================================================================
# General Configuration
# ============================================================================

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-west-1"
}

# ============================================================================
# VPC Configuration
# ============================================================================

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnet internet access"
  type        = bool
  default     = true
}

# ============================================================================
# EKS Configuration
# ============================================================================

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.28"
}

variable "eks_instance_types" {
  description = "Instance types for EKS node groups"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "eks_node_desired_capacity" {
  description = "Desired number of worker nodes"
  type        = number
  default     = 3
}

variable "eks_node_min_capacity" {
  description = "Minimum number of worker nodes"
  type        = number
  default     = 2
}

variable "eks_node_max_capacity" {
  description = "Maximum number of worker nodes"
  type        = number
  default     = 10
}

# ============================================================================
# RDS Configuration
# ============================================================================

variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "rds_allocated_storage" {
  description = "Allocated storage for RDS in GB"
  type        = number
  default     = 20
}

# ============================================================================
# Service Configuration
# ============================================================================

variable "governance_replica_count" {
  description = "Number of Governance service replicas"
  type        = number
  default     = 2
}

variable "governance_image_tag" {
  description = "Docker image tag for Governance service"
  type        = string
  default     = "latest"
}

variable "compliance_replica_count" {
  description = "Number of Compliance service replicas"
  type        = number
  default     = 2
}

variable "compliance_image_tag" {
  description = "Docker image tag for Compliance service"
  type        = string
  default     = "latest"
}
