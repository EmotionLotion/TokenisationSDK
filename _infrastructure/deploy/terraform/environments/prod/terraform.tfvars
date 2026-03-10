# Production Environment Configuration
# Use: terraform plan -var-file=environments/prod/terraform.tfvars

environment = "prod"
aws_region  = "eu-west-1"

# VPC
vpc_cidr           = "10.2.0.0/16"
enable_nat_gateway = true

# EKS
eks_cluster_version       = "1.28"
eks_instance_types        = ["t3.large", "t3.xlarge"]
eks_node_desired_capacity = 5
eks_node_min_capacity     = 3
eks_node_max_capacity     = 20

# RDS
rds_instance_class    = "db.r6g.large"
rds_allocated_storage = 100

# Services
governance_replica_count = 3
governance_image_tag     = "v1.0.0"
compliance_replica_count = 3
compliance_image_tag     = "v1.0.0"
