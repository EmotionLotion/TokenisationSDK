# Development Environment Configuration
# Use: terraform plan -var-file=environments/dev/terraform.tfvars

environment = "dev"
aws_region  = "eu-west-1"

# VPC
vpc_cidr           = "10.0.0.0/16"
enable_nat_gateway = true

# EKS
eks_cluster_version       = "1.28"
eks_instance_types        = ["t3.medium"]
eks_node_desired_capacity = 2
eks_node_min_capacity     = 1
eks_node_max_capacity     = 5

# RDS
rds_instance_class    = "db.t3.micro"
rds_allocated_storage = 20

# Services
governance_replica_count = 1
governance_image_tag     = "dev"
compliance_replica_count = 1
compliance_image_tag     = "dev"
