#!/bin/bash
# Script to run multiple fix_ria_names.js processes in parallel

# Create logs directory if it doesn't exist
mkdir -p logs

# Kill any existing processes
pkill -f 'node scripts/fix_ria_names.js' || true

# Calculate CRD ranges for 4 processes
MIN_CRD=793
MAX_CRD=338134
RANGE_SIZE=$(( (MAX_CRD - MIN_CRD) / 4 ))

# Define ranges for each process
RANGE1_MIN=$MIN_CRD
RANGE1_MAX=$(( MIN_CRD + RANGE_SIZE ))

RANGE2_MIN=$(( RANGE1_MAX + 1 ))
RANGE2_MAX=$(( RANGE2_MIN + RANGE_SIZE ))

RANGE3_MIN=$(( RANGE2_MAX + 1 ))
RANGE3_MAX=$(( RANGE3_MIN + RANGE_SIZE ))

RANGE4_MIN=$(( RANGE3_MAX + 1 ))
RANGE4_MAX=$MAX_CRD

echo "Starting 4 parallel processes for RIA name fixing"
echo "Process 1: CRD range $RANGE1_MIN-$RANGE1_MAX"
echo "Process 2: CRD range $RANGE2_MIN-$RANGE2_MAX"
echo "Process 3: CRD range $RANGE3_MIN-$RANGE3_MAX"
echo "Process 4: CRD range $RANGE4_MIN-$RANGE4_MAX"

# Start each process with its own range
node scripts/fix_ria_names.js --min-crd $RANGE1_MIN --max-crd $RANGE1_MAX --process-id "p1" > logs/fix_ria_names_p1.log 2>&1 &
echo "Process 1 started with PID $!"

node scripts/fix_ria_names.js --min-crd $RANGE2_MIN --max-crd $RANGE2_MAX --process-id "p2" > logs/fix_ria_names_p2.log 2>&1 &
echo "Process 2 started with PID $!"

node scripts/fix_ria_names.js --min-crd $RANGE3_MIN --max-crd $RANGE3_MAX --process-id "p3" > logs/fix_ria_names_p3.log 2>&1 &
echo "Process 3 started with PID $!"

node scripts/fix_ria_names.js --min-crd $RANGE4_MIN --max-crd $RANGE4_MAX --process-id "p4" > logs/fix_ria_names_p4.log 2>&1 &
echo "Process 4 started with PID $!"

echo "All processes started. To monitor progress, use:"
echo "tail -f logs/fix_ria_names_p*.log"
