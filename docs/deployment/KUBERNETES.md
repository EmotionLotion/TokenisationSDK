---
sidebar_position: 2
title: Kubernetes / Helm Deployment
---

# Kubernetes / Helm Deployment

Deploy the AHOY Tokenisation SDK to production on Kubernetes using Terraform for AWS infrastructure provisioning and Helm for service deployment.

## Architecture

```
                 Internet
                    |
            +-------+-------+
            | AWS ALB / NLB  |
            | (Ingress NGINX)|
            +-------+-------+
                    |
         +----------+-----------+
         |                      |
  +------+------+       +------+------+
  | tokenisation|       | tokenisation|
  |   api (x3)  |       |   api (xN)  |
  +------+------+       +------+------+
         |                      |
    +----+----+           +----+----+
    |         |           |         |
+---+---+ +---+---+  +---+---+ +---+---+
|Postgres| | Redis |  | RPC   | |Monitor|
| (RDS)  | |(Elast-|  | Node  | |(Prom) |
|        | | Cache)|  |       | |       |
+--------+ +-------+  +-------+ +-------+
```

## Prerequisites

- AWS CLI configured with appropriate IAM permissions
- Terraform >= 1.5.0
- kubectl configured for your cluster
- Helm 3.x
- A domain with DNS control for TLS certificates

## Infrastructure with Terraform

The `deploy/terraform/` directory contains modular Terraform configuration for provisioning the full AWS stack.

### Modules

| Module | Purpose |
|---|---|
| `vpc` | VPC with public/private subnets across 3 AZs, NAT gateway |
| `eks` | Managed Kubernetes cluster with node groups and cluster autoscaler |
| `rds` | PostgreSQL 16 on RDS (multi-AZ in production) |

### Quick Start

```bash
cd deploy/terraform

# Initialize providers
terraform init

# Plan for staging
terraform plan -var-file=environments/staging/terraform.tfvars

# Apply
terraform apply -var-file=environments/staging/terraform.tfvars
```

### Key Variables

```hcl
# environments/staging/terraform.tfvars
environment            = "staging"
aws_region             = "eu-west-1"
vpc_cidr               = "10.0.0.0/16"
enable_nat_gateway     = true

# EKS
eks_cluster_version        = "1.29"
eks_instance_types         = ["m6i.large"]
eks_node_desired_capacity  = 3
eks_node_min_capacity      = 2
eks_node_max_capacity      = 10

# RDS
rds_instance_class    = "db.r6g.large"
rds_allocated_storage = 50
```

### State Management

For production, enable the S3 backend for remote state with DynamoDB locking:

```hcl
backend "s3" {
  bucket         = "tokenisation-terraform-state"
  key            = "infrastructure/terraform.tfstate"
  region         = "eu-west-1"
  encrypt        = true
  dynamodb_table = "terraform-locks"
}
```

## Kubernetes Manifests

The `deploy/kubernetes/deployment.yaml` contains the base Kubernetes resources. These can be applied directly or managed through Helm.

### Namespace

All resources live in the `tokenisation` namespace:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: tokenisation
  labels:
    app: tokenisation-sdk
```

### API Deployment

The API deployment is configured with production best practices:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tokenisation-api
  namespace: tokenisation
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
        - name: api
          image: tokenisation-sdk:latest
          ports:
            - containerPort: 3000  # HTTP
            - containerPort: 9090  # Metrics
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: tokenisation-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: tokenisation-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Pod Disruption Budget

Ensures at least 2 pods remain available during voluntary disruptions (node drains, upgrades):

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: tokenisation-api
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: tokenisation-api
```

### Network Policies

The network policy restricts traffic to only what is necessary:

**Ingress** -- Only accept traffic from:
- NGINX Ingress controller on port 3000
- Prometheus on port 9090 (metrics scraping)

**Egress** -- Only allow connections to:
- PostgreSQL on port 5432
- Redis on port 6379
- External HTTPS (port 443) for RPC nodes

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: tokenisation-api
spec:
  podSelector:
    matchLabels:
      app: tokenisation-api
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels: { name: ingress-nginx }
      ports: [{ port: 3000 }]
    - from:
        - namespaceSelector:
            matchLabels: { name: monitoring }
      ports: [{ port: 9090 }]
  egress:
    - to:
        - podSelector:
            matchLabels: { app: postgres }
      ports: [{ port: 5432 }]
    - to:
        - podSelector:
            matchLabels: { app: redis }
      ports: [{ port: 6379 }]
    - to:
        - ipBlock: { cidr: 0.0.0.0/0 }
      ports: [{ port: 443 }]
```

## Helm Charts

The `deploy/helm/` directory contains Helm charts for the governance and compliance services. Terraform deploys these charts using `helm_release` resources.

### Helm Values

Environment-specific values live in `deploy/terraform/helm-values/`:

```yaml
# helm-values/governance-staging.yaml
replicaCount: 2
image:
  repository: your-ecr-repo/governance-service
  tag: "${image_tag}"
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
database:
  host: "${database_host}"
  name: "${database_name}"
```

### Deploying via Terraform

The Terraform configuration automatically installs Helm charts:

```hcl
resource "helm_release" "governance_service" {
  name      = "governance-service"
  namespace = "tokenisation"
  chart     = "${path.module}/../helm/governance-service"

  values = [
    templatefile("helm-values/governance-${var.environment}.yaml", {
      database_host = module.rds.endpoint
      database_name = module.rds.database_name
      replica_count = var.governance_replica_count
      image_tag     = var.governance_image_tag
    })
  ]

  set_sensitive {
    name  = "secrets.databasePassword"
    value = module.rds.password
  }
}
```

## Ingress and TLS

The Ingress resource uses NGINX Ingress Controller with cert-manager for automatic Let's Encrypt certificates:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tokenisation-api
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: [api.tokenisation.example.com]
      secretName: tokenisation-tls
  rules:
    - host: api.tokenisation.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: tokenisation-api
                port: { name: http }
```

## Secrets Management

**Do not store secrets in Kubernetes manifests or Helm values.** Use one of:

- **AWS Secrets Manager** with the External Secrets Operator
- **HashiCorp Vault** with the Vault Secrets Operator
- **Sealed Secrets** for GitOps workflows

```bash
# Example: create a secret from AWS Secrets Manager
kubectl create secret generic tokenisation-secrets \
  --from-literal=DATABASE_URL="$(aws secretsmanager get-secret-value ...)" \
  --from-literal=JWT_SECRET="$(aws secretsmanager get-secret-value ...)" \
  -n tokenisation
```

## Monitoring

The API pod exposes Prometheus metrics on port 9090 at `/metrics`. Annotations on the pod template enable automatic scraping:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "9090"
  prometheus.io/path: "/metrics"
```

The `docker/` directory contains a full monitoring stack (Prometheus, Grafana, Loki, Alertmanager) that can be deployed alongside the application.

## Production Checklist

- [ ] Terraform state backend configured (S3 + DynamoDB)
- [ ] RDS multi-AZ enabled for production
- [ ] RDS deletion protection enabled
- [ ] EKS cluster autoscaler enabled
- [ ] Network policies applied
- [ ] Secrets stored in external secrets manager
- [ ] cert-manager and Ingress NGINX installed
- [ ] HPA configured with appropriate thresholds
- [ ] PDB set with `minAvailable: 2`
- [ ] Pod anti-affinity spreads replicas across nodes
- [ ] Prometheus metrics scraping configured
- [ ] Log aggregation (Loki/CloudWatch) configured
- [ ] Backup strategy for RDS snapshots
