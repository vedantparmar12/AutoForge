# OPA (Open Policy Agent) Policies
package kubernetes.admission

# Deny containers running as root
deny[msg] {
  input.request.kind.kind == "Pod"
  container := input.request.object.spec.containers[_]
  not container.securityContext.runAsNonRoot
  msg := sprintf("Container %v must run as non-root", [container.name])
}

# Require resource limits
deny[msg] {
  input.request.kind.kind == "Pod"
  container := input.request.object.spec.containers[_]
  not container.resources.limits.cpu
  msg := sprintf("Container %v must have CPU limits", [container.name])
}

# Deny privilege escalation
deny[msg] {
  input.request.kind.kind == "Pod"
  container := input.request.object.spec.containers[_]
  container.securityContext.allowPrivilegeEscalation
  msg := sprintf("Container %v cannot allow privilege escalation", [container.name])
}

# Require image from trusted registry
# TODO: Replace with your actual trusted registries (ECR, Docker Hub private, etc.)
trusted_registries := [
  # Example ECR registries - replace with your actual values
  # "123456789012.dkr.ecr.us-east-1.amazonaws.com",
  # "123456789012.dkr.ecr.us-west-2.amazonaws.com",
  # Example Docker Hub private registry
  # "registry.hub.docker.com/yourorg",
  # Example Google Container Registry
  # "gcr.io/your-project"
]

registry_is_trusted(image) {
  registry := trusted_registries[_]
  startswith(image, registry)
}

deny[msg] {
  input.request.kind.kind == "Pod"
  container := input.request.object.spec.containers[_]
  # Only enforce if trusted_registries is configured (not empty)
  count(trusted_registries) > 0
  not registry_is_trusted(container.image)
  msg := sprintf("Container %v must use images from trusted registry. Allowed: %v", [container.name, trusted_registries])
}
