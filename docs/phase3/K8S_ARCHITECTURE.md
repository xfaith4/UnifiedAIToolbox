# Kubernetes Architecture Documentation
## Unified AI Toolbox v2.0 - Phase 3

**Status:** Draft  
**Owner:** DevOps/Architecture Team  
**Last Updated:** December 2025  
**Version:** 1.0

---

## Overview

This document describes the Kubernetes architecture for the Unified AI Toolbox v2.0, including deployment strategies, resource management, scaling approaches, and operational considerations.

## Architecture Principles

### Design Goals
- **High Availability:** Zero-downtime deployments with redundancy
- **Scalability:** Horizontal scaling based on load
- **Security:** Network policies, RBAC, secrets management
- **Observability:** Comprehensive monitoring and logging
- **Cost Efficiency:** Resource optimization and auto-scaling

### Deployment Environments
- **Development:** Local (kind/minikube) single-node cluster
- **Staging:** Cloud-based multi-node cluster (2-3 nodes)
- **Production:** Cloud-based HA cluster (3+ nodes, multi-AZ)

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Ingress Controller                       │
│                    (NGINX/Traefik + Cert Manager)               │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
┌───────────▼──────────┐  ┌──▼──────────┐  ┌──▼──────────┐
│  Dashboard Service   │  │ API Service │  │ Web Portal  │
│  (React/Vite)        │  │ (FastAPI)   │  │ (Next.js)   │
│  ClusterIP + Ingress │  │ ClusterIP   │  │ ClusterIP   │
│  3 replicas          │  │ 3 replicas  │  │ 2 replicas  │
└──────────────────────┘  └─────┬───────┘  └─────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
          ┌─────────▼────┐  ┌───▼────────┐  ┌▼──────────┐
          │  PostgreSQL  │  │   Redis    │  │  Storage  │
          │  StatefulSet │  │ StatefulSet│  │    PVC    │
          │  3 replicas  │  │ 3 replicas │  │           │
          └──────────────┘  └────────────┘  └───────────┘
```

---

## Core Components

### 1. API Service (FastAPI Backend)

**Deployment Specification:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: unified-api
  namespace: unified-toolbox
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: unified-api
  template:
    metadata:
      labels:
        app: unified-api
        version: v2.0
    spec:
      containers:
      - name: api
        image: unified-toolbox/api:v2.0
        ports:
        - containerPort: 8000
          name: http
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: connection-string
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: redis-config
              key: url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
```

**Service:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: unified-api
  namespace: unified-toolbox
spec:
  type: ClusterIP
  selector:
    app: unified-api
  ports:
  - port: 8000
    targetPort: 8000
    protocol: TCP
    name: http
```

### 2. Dashboard (React/Vite Frontend)

**Deployment Specification:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: unified-dashboard
  namespace: unified-toolbox
spec:
  replicas: 3
  selector:
    matchLabels:
      app: unified-dashboard
  template:
    metadata:
      labels:
        app: unified-dashboard
    spec:
      containers:
      - name: dashboard
        image: unified-toolbox/dashboard:v2.0
        ports:
        - containerPort: 80
          name: http
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
```

### 3. PostgreSQL Database

**StatefulSet Specification:**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: unified-toolbox
spec:
  serviceName: postgres
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
          name: postgres
        env:
        - name: POSTGRES_DB
          value: unified_dev
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 20Gi
```

### 4. Redis Cache

**StatefulSet Specification:**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: unified-toolbox
spec:
  serviceName: redis
  replicas: 3
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
          name: redis
        args:
        - redis-server
        - --appendonly
        - "yes"
        - --maxmemory
        - "256mb"
        - --maxmemory-policy
        - allkeys-lru
        volumeMounts:
        - name: redis-storage
          mountPath: /data
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
  volumeClaimTemplates:
  - metadata:
      name: redis-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi
```

---

## Networking

### Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: unified-toolbox-ingress
  namespace: unified-toolbox
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - "*.unified-toolbox.com"
    - unified-toolbox.com
    secretName: unified-toolbox-tls
  rules:
  - host: app.unified-toolbox.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: unified-dashboard
            port:
              number: 80
  - host: api.unified-toolbox.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: unified-api
            port:
              number: 8000
  - host: "*.unified-toolbox.com"
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: unified-dashboard
            port:
              number: 80
```

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-network-policy
  namespace: unified-toolbox
spec:
  podSelector:
    matchLabels:
      app: unified-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: unified-dashboard
    - podSelector:
        matchLabels:
          app: ingress-nginx
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
```

---

## Auto-Scaling

### Horizontal Pod Autoscaler (HPA)

**API Service HPA:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: unified-api-hpa
  namespace: unified-toolbox
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: unified-api
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
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
```

### Cluster Autoscaler

For cloud deployments, configure cluster autoscaler based on provider:

**AWS (EKS):**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-autoscaler-config
  namespace: kube-system
data:
  min-nodes: "3"
  max-nodes: "10"
  scale-down-delay-after-add: "10m"
```

---

## Configuration Management

### ConfigMaps

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: unified-config
  namespace: unified-toolbox
data:
  API_HOST: "0.0.0.0"
  API_PORT: "8000"
  LOG_LEVEL: "INFO"
  ENVIRONMENT: "production"
  REDIS_URL: "redis://redis:6379/0"
  ENABLE_MULTI_TENANCY: "true"
```

### Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
  namespace: unified-toolbox
type: Opaque
stringData:
  username: unified_user
  password: CHANGE_ME_IN_PRODUCTION
  connection-string: postgresql://unified_user:CHANGE_ME@postgres:5432/unified_dev
```

**Best Practices:**
- Use external secret management (AWS Secrets Manager, HashiCorp Vault)
- Rotate secrets regularly
- Never commit secrets to Git
- Use sealed-secrets or external-secrets operator

---

## Storage

### Persistent Volume Claims

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-storage
  namespace: unified-toolbox
spec:
  accessModes:
  - ReadWriteMany
  storageClassName: efs-sc  # AWS EFS
  resources:
    requests:
      storage: 100Gi
```

### Storage Classes

**Development (Local):**
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-storage
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
```

**Production (Cloud):**
- **AWS:** Use EBS (gp3) for block storage, EFS for shared storage
- **Azure:** Use Azure Disk (Premium SSD), Azure Files for shared
- **GCP:** Use Persistent Disk (SSD), Filestore for shared

---

## Monitoring & Observability

### Prometheus & Grafana

Deploy using Helm:
```bash
# Add Prometheus community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus stack
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.enabled=true
```

### Service Monitors

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: unified-api-monitor
  namespace: unified-toolbox
spec:
  selector:
    matchLabels:
      app: unified-api
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

---

## CI/CD Integration

### GitHub Actions Deployment

```yaml
name: Deploy to Kubernetes

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Configure kubectl
      uses: azure/k8s-set-context@v3
      with:
        method: kubeconfig
        kubeconfig: ${{ secrets.KUBE_CONFIG }}
    
    - name: Deploy with Helm
      run: |
        helm upgrade --install unified-toolbox ./charts/unified-toolbox \
          --namespace unified-toolbox \
          --create-namespace \
          --set image.tag=${{ github.sha }}
```

---

## Disaster Recovery

### Backup Strategy

**Database Backups:**
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: unified-toolbox
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15-alpine
            command:
            - /bin/sh
            - -c
            - |
              pg_dump -h postgres -U unified_user unified_dev | \
              gzip > /backups/backup-$(date +%Y%m%d-%H%M%S).sql.gz
            volumeMounts:
            - name: backup-storage
              mountPath: /backups
          restartPolicy: OnFailure
          volumes:
          - name: backup-storage
            persistentVolumeClaim:
              claimName: backup-pvc
```

### Recovery Procedures

1. **Database Restore:**
   ```bash
   gunzip -c backup.sql.gz | psql -h postgres -U unified_user unified_dev
   ```

2. **Configuration Restore:**
   ```bash
   kubectl apply -f backup/configmaps/
   kubectl apply -f backup/secrets/
   ```

3. **Application Redeploy:**
   ```bash
   helm upgrade --install unified-toolbox ./charts/unified-toolbox
   ```

---

## Security Considerations

### RBAC Configuration

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: unified-api-sa
  namespace: unified-toolbox

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: unified-api-role
  namespace: unified-toolbox
rules:
- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: unified-api-binding
  namespace: unified-toolbox
subjects:
- kind: ServiceAccount
  name: unified-api-sa
roleRef:
  kind: Role
  name: unified-api-role
  apiGroup: rbac.authorization.k8s.io
```

### Pod Security Standards

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: unified-toolbox
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

---

## Cost Optimization

### Resource Quotas

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: unified-toolbox-quota
  namespace: unified-toolbox
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    persistentvolumeclaims: "10"
```

### Limit Ranges

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: unified-toolbox-limits
  namespace: unified-toolbox
spec:
  limits:
  - max:
      cpu: "2"
      memory: 4Gi
    min:
      cpu: "100m"
      memory: 128Mi
    default:
      cpu: "500m"
      memory: 512Mi
    defaultRequest:
      cpu: "250m"
      memory: 256Mi
    type: Container
```

---

## Troubleshooting Guide

### Common Issues

1. **Pod Not Starting:**
   ```bash
   kubectl describe pod <pod-name> -n unified-toolbox
   kubectl logs <pod-name> -n unified-toolbox
   ```

2. **Database Connection Issues:**
   ```bash
   kubectl exec -it postgres-0 -n unified-toolbox -- psql -U unified_user -d unified_dev
   ```

3. **Service Not Accessible:**
   ```bash
   kubectl get svc -n unified-toolbox
   kubectl get ingress -n unified-toolbox
   kubectl describe ingress unified-toolbox-ingress -n unified-toolbox
   ```

---

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [Prometheus Operator](https://github.com/prometheus-operator/prometheus-operator)
- [cert-manager Documentation](https://cert-manager.io/docs/)

---

**Document Owner:** DevOps Team  
**Review Cycle:** Quarterly  
**Next Review:** March 2026
