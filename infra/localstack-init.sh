#!/bin/sh
awslocal s3 mb s3://ev-cms-ocpp-raw || true
awslocal s3 mb s3://ev-cms-invoices || true
echo "S3 buckets created"
