# EKS Module - Variables

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for EKS"
  type        = list(string)
}

variable "node_groups" {
  description = "Map of node group configurations"
  type = map(object({
    desired_capacity = number
    min_capacity     = number
    max_capacity     = number
    instance_types   = list(string)
    disk_size        = number
  }))
}

variable "enable_cluster_autoscaler" {
  description = "Enable IAM policy for cluster autoscaler"
  type        = bool
  default     = false
}
