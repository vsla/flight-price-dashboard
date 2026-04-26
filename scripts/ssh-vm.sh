#!/usr/bin/env bash
# SSH direto na VM Azure
source "$(dirname "$0")/config.sh"
ssh -i "$KEY" $VM_USER@$VM_HOST
