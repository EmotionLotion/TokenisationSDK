# =============================================================================
# AHOY Sandbox Environment - Terraform Variables
# =============================================================================

environment = "sandbox"
region      = "me-south-1" # Bahrain (closest to UAE)

# VPC
vpc_cidr           = "10.2.0.0/16"
availability_zones = ["me-south-1a", "me-south-1b"]

# EKS
cluster_name    = "ahoy-sandbox"
cluster_version = "1.28"
node_instance_types = ["t3.medium"]
node_min_size   = 2
node_max_size   = 4
node_desired_size = 2

# RDS
db_instance_class    = "db.t3.medium"
db_allocated_storage = 50
db_engine_version    = "16.1"
db_multi_az          = false
db_backup_retention  = 3

# Application
api_replicas     = 2
api_cpu_request  = "500m"
api_memory_request = "1Gi"
api_cpu_limit    = "1000m"
api_memory_limit = "2Gi"

# Domain
domain_name = "sandbox.api.ahoy.fund"

# Features
enable_monitoring = true
enable_logging    = true
enable_sandbox_mode = true
enable_mock_kyc   = true

# Tags
tags = {
  Environment = "sandbox"
  Project     = "ahoy-tokenisation"
  ManagedBy   = "terraform"
  Purpose     = "partner-testing"
}
