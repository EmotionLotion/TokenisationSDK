# Tokenisation SDK - Terraform Infrastructure
# Main configuration for deploying Governance and Compliance services
#
# Usage:
#   terraform init
#   terraform plan -var-file=environments/dev/terraform.tfvars
#   terraform apply -var-file=environments/dev/terraform.tfvars

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  # Backend configuration - uncomment for production
  # backend "s3" {
  #   bucket         = "tokenisation-terraform-state"
  #   key            = "infrastructure/terraform.tfstate"
  #   region         = "eu-west-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-locks"
  # }
}

# ============================================================================
# Provider Configuration
# ============================================================================

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "TokenisationSDK"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {}

# ============================================================================
# Modules
# ============================================================================

module "vpc" {
  source = "./modules/vpc"

  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  availability_zones  = slice(data.aws_availability_zones.available.names, 0, 3)
  enable_nat_gateway  = var.enable_nat_gateway
  single_nat_gateway  = var.environment != "prod"
}

module "eks" {
  source = "./modules/eks"

  environment           = var.environment
  cluster_name          = "tokenisation-${var.environment}"
  cluster_version       = var.eks_cluster_version
  vpc_id                = module.vpc.vpc_id
  subnet_ids            = module.vpc.private_subnet_ids

  node_groups = {
    general = {
      desired_capacity = var.eks_node_desired_capacity
      min_capacity     = var.eks_node_min_capacity
      max_capacity     = var.eks_node_max_capacity
      instance_types   = var.eks_instance_types
      disk_size        = 50
    }
  }

  enable_cluster_autoscaler = true
}

module "rds" {
  source = "./modules/rds"

  environment         = var.environment
  identifier          = "tokenisation-${var.environment}"
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.private_subnet_ids
  allowed_cidr_blocks = [var.vpc_cidr]

  instance_class      = var.rds_instance_class
  allocated_storage   = var.rds_allocated_storage
  database_name       = "tokenisation"

  multi_az            = var.environment == "prod"
  deletion_protection = var.environment == "prod"
}

# ============================================================================
# Kubernetes Namespace
# ============================================================================

resource "kubernetes_namespace" "tokenisation" {
  metadata {
    name = "tokenisation"

    labels = {
      name        = "tokenisation"
      environment = var.environment
    }
  }

  depends_on = [module.eks]
}

# ============================================================================
# Helm Releases
# ============================================================================

resource "helm_release" "governance_service" {
  name       = "governance-service"
  namespace  = kubernetes_namespace.tokenisation.metadata[0].name
  chart      = "${path.module}/../helm/governance-service"

  values = [
    templatefile("${path.module}/helm-values/governance-${var.environment}.yaml", {
      environment     = var.environment
      database_host   = module.rds.endpoint
      database_name   = module.rds.database_name
      replica_count   = var.governance_replica_count
      image_tag       = var.governance_image_tag
    })
  ]

  set_sensitive {
    name  = "secrets.databasePassword"
    value = module.rds.password
  }

  depends_on = [module.eks, module.rds]
}

resource "helm_release" "compliance_service" {
  name       = "compliance-service"
  namespace  = kubernetes_namespace.tokenisation.metadata[0].name
  chart      = "${path.module}/../helm/compliance-service"

  values = [
    templatefile("${path.module}/helm-values/compliance-${var.environment}.yaml", {
      environment     = var.environment
      database_host   = module.rds.endpoint
      database_name   = module.rds.database_name
      replica_count   = var.compliance_replica_count
      image_tag       = var.compliance_image_tag
    })
  ]

  set_sensitive {
    name  = "secrets.databasePassword"
    value = module.rds.password
  }

  depends_on = [module.eks, module.rds]
}
