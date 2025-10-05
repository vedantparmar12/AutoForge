# ECR Repositories for all services
resource "aws_ecr_repository" "repos" {
  for_each = toset([
    "analyzers",
    "calculators",
    "generators",
    "tools",
    "types"
  ])

  name                 = "${var.cluster_name}/${each.value}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(
    var.tags,
    {
      Service = each.value
    }
  )
}

# ECR Lifecycle Policy
resource "aws_ecr_lifecycle_policy" "repos_policy" {
  for_each = aws_ecr_repository.repos

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 30 images"
        selection = {
          tagStatus     = "any"
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
