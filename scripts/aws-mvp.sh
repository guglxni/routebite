#!/usr/bin/env bash
# FinOps helpers for the RouteBite Lightsail MVP (ap-south-1 / rb-mvp).
# Usage: ./scripts/aws-mvp.sh {status|stop|start|cost|ssh}
set -euo pipefail

REGION="${AWS_MVP_REGION:-ap-south-1}"
INSTANCE="${AWS_MVP_INSTANCE:-rb-mvp}"
KEY="${AWS_MVP_KEY:-$HOME/.ssh/routebite-mvp.pem}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"

cmd="${1:-status}"

case "$cmd" in
  status)
    aws lightsail get-instance --region "$REGION" --instance-name "$INSTANCE" \
      --query 'instance.{name:name,state:state.name,ip:publicIpAddress,bundle:bundleId,az:location.availabilityZone}' \
      --output table
    echo
    aws budgets describe-budget --account-id "$ACCOUNT" --budget-name routebite-mvp-lightsail \
      --query 'Budget.{name:BudgetName,limit:BudgetLimit.Amount,actual:CalculatedSpend.ActualSpend.Amount,forecast:CalculatedSpend.ForecastedSpend.Amount}' \
      --output table 2>/dev/null || true
    ;;
  stop)
    echo "Stopping $INSTANCE (Lightsail billing pauses compute; static IP if any still bills)."
    aws lightsail stop-instance --region "$REGION" --instance-name "$INSTANCE"
    ;;
  start)
    aws lightsail start-instance --region "$REGION" --instance-name "$INSTANCE"
    ;;
  cost)
    aws budgets describe-budgets --account-id "$ACCOUNT" \
      --query 'Budgets[].{name:BudgetName,limit:BudgetLimit.Amount,actual:CalculatedSpend.ActualSpend.Amount,forecast:CalculatedSpend.ForecastedSpend.Amount}' \
      --output table
    ;;
  ssh)
    IP="$(aws lightsail get-instance --region "$REGION" --instance-name "$INSTANCE" --query 'instance.publicIpAddress' --output text)"
    exec ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "ubuntu@$IP"
    ;;
  *)
    echo "Usage: $0 {status|stop|start|cost|ssh}" >&2
    exit 1
    ;;
esac
