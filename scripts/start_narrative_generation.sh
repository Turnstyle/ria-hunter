#!/bin/bash
# Script to start narrative generation after fixing RIA names

# Check if any fix_ria_names.js processes are still running
if pgrep -f "node scripts/fix_ria_names.js" > /dev/null; then
  echo "RIA name fixing is still in progress. Waiting for completion..."
  echo "You can monitor progress with: node scripts/monitor_name_fixing.js"
  echo "Run this script again after all name fixing processes have completed."
  exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Measure how many RIAs still have undefined names
UNDEFINED_COUNT=$(node -e 'require("dotenv").config(); const { createClient } = require("@supabase/supabase-js"); const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); async function run() { const { count, error } = await supabase.from("ria_profiles").select("*", { count: "exact", head: true }).is("legal_name", null); if (error) console.error(error); else console.log(count); } run();')

# Calculate percentage of fixed names
TOTAL_RIAS=$(node -e 'require("dotenv").config(); const { createClient } = require("@supabase/supabase-js"); const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); async function run() { const { count, error } = await supabase.from("ria_profiles").select("*", { count: "exact", head: true }); if (error) console.error(error); else console.log(count); } run();')

FIXED_RIAS=$((TOTAL_RIAS - UNDEFINED_COUNT))
FIXED_PERCENTAGE=$(echo "scale=2; ($FIXED_RIAS / $TOTAL_RIAS) * 100" | bc)

echo "================================================="
echo "RIA Name Fixing Results:"
echo "- Total RIAs: $TOTAL_RIAS"
echo "- Fixed names: $FIXED_RIAS ($FIXED_PERCENTAGE%)"
echo "- Remaining undefined names: $UNDEFINED_COUNT"
echo "================================================="

# Confirm with user
read -p "Ready to start narrative generation? (y/n): " CONFIRM
if [[ $CONFIRM != "y" && $CONFIRM != "Y" ]]; then
  echo "Narrative generation cancelled."
  exit 1
fi

# Kill any existing narrative generators
pkill -f 'improved_narrative_generator.js' || true

echo "Starting narrative generation with improved generator..."
# Split the work into multiple processes for faster generation
# We divide the CRD number range into 4 segments

MIN_CRD=0
MAX_CRD=1000000  # Large enough to cover all possible CRDs
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

# Start the narrative generation processes
AI_PROVIDER=vertex node scripts/improved_narrative_generator.js --start-crd $RANGE1_MIN --end-crd $RANGE1_MAX --batch-size 10 --delay 5 > logs/narrative_gen_p1.log 2>&1 &
echo "Process 1 started with PID $! (CRD range $RANGE1_MIN-$RANGE1_MAX)"

AI_PROVIDER=vertex node scripts/improved_narrative_generator.js --start-crd $RANGE2_MIN --end-crd $RANGE2_MAX --batch-size 10 --delay 5 > logs/narrative_gen_p2.log 2>&1 &
echo "Process 2 started with PID $! (CRD range $RANGE2_MIN-$RANGE2_MAX)"

AI_PROVIDER=vertex node scripts/improved_narrative_generator.js --start-crd $RANGE3_MIN --end-crd $RANGE3_MAX --batch-size 10 --delay 5 > logs/narrative_gen_p3.log 2>&1 &
echo "Process 3 started with PID $! (CRD range $RANGE3_MIN-$RANGE3_MAX)"

AI_PROVIDER=vertex node scripts/improved_narrative_generator.js --start-crd $RANGE4_MIN --end-crd $RANGE4_MAX --batch-size 10 --delay 5 > logs/narrative_gen_p4.log 2>&1 &
echo "Process 4 started with PID $! (CRD range $RANGE4_MIN-$RANGE4_MAX)"

echo "All narrative generation processes started. To monitor progress, use:"
echo "tail -f logs/narrative_gen_p*.log"
