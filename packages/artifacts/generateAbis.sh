#!/usr/bin/env bash

set -e  # Exit on error

# Define directories
CONTRACTS_DIR="../contracts"
GENERATED_ABIS="../contracts/generated/abis.ts"
OUTPUT_ABIS_DIR="src/abis"

# Move into contracts package and install dependencies
cd $CONTRACTS_DIR

yarn install

yarn build

yarn wagmi:generate

# Move back to artifacts package
cd -

# Ensure the output directory exists
mkdir -p "$OUTPUT_ABIS_DIR"

# Copy the generated ABIs to the output directory
if [ -f "$GENERATED_ABIS" ]; then
    cp "$GENERATED_ABIS" "$OUTPUT_ABIS_DIR/abis.ts"
else
    echo "Warning: generated/abis.ts not found."
fi

echo "ABI generation complete. ABIs are stored in $OUTPUT_ABIS_DIR."