# RDS Module - Creates PostgreSQL database for TokenisationSDK
#
# Creates:
# - RDS PostgreSQL instance
# - DB subnet group
# - Security group
# - Parameter group

locals {
  name = var.identifier
}

# ============================================================================
# Random Password
# ============================================================================

resource "random_password" "master" {
  length  = 32
  special = false
}

# ============================================================================
# DB Subnet Group
# ============================================================================

resource "aws_db_subnet_group" "main" {
  name        = local.name
  description = "Database subnet group for ${local.name}"
  subnet_ids  = var.subnet_ids

  tags = {
    Name = local.name
  }
}

# ============================================================================
# Security Group
# ============================================================================

resource "aws_security_group" "main" {
  name        = "${local.name}-db"
  description = "Security group for RDS instance"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name}-db"
  }
}

# ============================================================================
# Parameter Group
# ============================================================================

resource "aws_db_parameter_group" "main" {
  name   = local.name
  family = "postgres15"

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  tags = {
    Name = local.name
  }
}

# ============================================================================
# RDS Instance
# ============================================================================

resource "aws_db_instance" "main" {
  identifier = local.name

  # Engine
  engine               = "postgres"
  engine_version       = "15.4"
  instance_class       = var.instance_class
  allocated_storage    = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2
  storage_type         = "gp3"
  storage_encrypted    = true

  # Database
  db_name  = var.database_name
  username = "tokenisation"
  password = random_password.master.result
  port     = 5432

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.main.id]
  publicly_accessible    = false

  # High Availability
  multi_az = var.multi_az

  # Backup
  backup_retention_period = var.environment == "prod" ? 30 : 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # Monitoring
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.monitoring.arn

  # Parameter Group
  parameter_group_name = aws_db_parameter_group.main.name

  # Protection
  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.name}-final-snapshot" : null

  tags = {
    Name        = local.name
    Environment = var.environment
  }
}

# ============================================================================
# Monitoring IAM Role
# ============================================================================

resource "aws_iam_role" "monitoring" {
  name = "${local.name}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "monitoring.rds.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "monitoring" {
  role       = aws_iam_role.monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
