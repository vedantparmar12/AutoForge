#!/bin/bash
set -e

echo "🔄 Disaster Recovery - Restore from backup"

# List available backups
echo "Available backups:"
velero backup get

# Prompt for backup name
read -p "Enter backup name to restore: " BACKUP_NAME

# Restore
velero restore create --from-backup $BACKUP_NAME

# Wait for restore to complete
velero restore describe $BACKUP_NAME --wait

echo "✅ Restore completed successfully!"
