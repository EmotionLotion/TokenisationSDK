# Staging Environment Configuration
# Use: terraform plan -var-file=environments/staging/terraform.tfvars

environment = "staging"
aws_region  = "eu-west-1"

# VPC
vpc_cidr           = "10.1.0.0/16"
enable_nat_gateway = true

# EKS
eks_cluster_version       = "1.28"
eks_instance_types        = ["t3.medium", "t3.large"]
eks_node_desired_capacity = 3
eks_node_min_capacity     = 2
eks_node_max_capacity     = 8

# RDS
rds_instance_class    = "db.t3.medium"
rds_allocated_storage = 50

# Services
governance_replica_count = 2
governance_image_tag     = "staging"
compliance_replica_count = 2
compliance_image_tag     = "staging"
