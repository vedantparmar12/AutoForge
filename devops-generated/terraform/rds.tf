# RDS Database
resource "aws_db_subnet_group" "main" {
  name       = "mcp-devops-automation-db-subnet"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name = "mcp-devops-automation-db-subnet"
  }
}

resource "aws_security_group" "rds" {
  name        = "mcp-devops-automation-rds-sg"
  description = "Security group for RDS database"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "mcp-devops-automation-rds-sg"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "mcp-devops-automation-db"
  engine         = "postgresql"
  engine_version = "16.3"
  instance_class = "db.t3.small"

  allocated_storage     = 50
  max_allocated_storage = 100
  storage_encrypted     = true

  db_name  = "mcp_devops_automation"
  username = "admin"
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az               = true
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  skip_final_snapshot = false
  final_snapshot_identifier = "mcp-devops-automation-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = {
    Name = "mcp-devops-automation-database"
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name = "mcp-devops-automation/database/credentials"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.db_password.result
    engine   = aws_db_instance.main.engine
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
  })
}
