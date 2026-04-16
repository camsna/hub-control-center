#!/bin/bash
# MX6000 Backup: run in Docker, then sync to Mac Studio
set -e

cd /home/thehub/hub-control-center

# Run the backup container
docker compose run --rm mx6000-backup

# Get the volume mount path
VOLUME_PATH=$(docker volume inspect hub-control-center_mx6000-backups -f '{{.Mountpoint}}')

# Sync to Mac Studio (use thehub's SSH key explicitly)
sudo rsync -av -e "ssh -i /home/thehub/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new" "$VOLUME_PATH/" thehub@10.0.81.223:~/Desktop/MX6000-Backups/

echo "Backup complete and synced to Mac Studio"
