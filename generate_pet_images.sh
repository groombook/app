#!/bin/bash

# Use the configured MiniMax API host
API_HOST="${MINIMAX_API_HOST:-https://api.minimax.io}"
API_KEY="$MINIMAX_API_KEY"

# Test endpoint - check which one works
echo "Testing API endpoints..."
echo "API_HOST: $API_HOST"
echo "API_KEY: ${API_KEY:0:15}..."

# Array of diverse dog images to generate
declare -a PROMPTS=(
  "A beautiful red Irish Setter with flowing silky coat, standing proudly in a sunny garden, warm natural lighting, professional pet photography"
  "A fluffy white Pomeranian with thick coat, sitting alert, bright studio background, cute expression"
  "A black Schnauzer with distinctive beard, freshly groomed, professional salon setting, dignified pose"
  "A cream-colored Cavalier King Charles Spaniel, silky coat, gentle expression, soft warm lighting"
  "A brown and white Basset Hound, long ears, relaxed sitting pose, natural outdoor background"
  "A black and tan Dachshund, elongated body, alert posture, warm studio lighting"
  "A white Bichon Frise, fluffy groomed coat, happy expression, bright cheerful background"
  "A fawn Boxer with muscular build, athletic posture, outdoor park setting, energetic expression"
  "A merle Shetland Sheepdog, alert ears, running pose, green garden background"
  "A buff-colored Cocker Spaniel, silky coat, friendly expression, warm natural light"
)

declare -a FILENAMES=(
  "dog-setter-red-sunny.png"
  "dog-pomeranian-white-alert.png"
  "dog-schnauzer-groomed.png"
  "dog-cavalier-cream.png"
  "dog-basset-hound-outdoor.png"
  "dog-dachshund-alert.png"
  "dog-bichon-frise-happy.png"
  "dog-boxer-athletic.png"
  "dog-sheepdog-merle.png"
  "dog-cocker-spaniel-buff.png"
)

mkdir -p minimax-output

echo "Generating ${#PROMPTS[@]} diverse dog images..."

for i in "${!PROMPTS[@]}"; do
  PROMPT="${PROMPTS[$i]}"
  FILENAME="${FILENAMES[$i]}"
  
  echo "[$((i+1))/${#PROMPTS[@]}] Generating: $FILENAME"
  
  # Make API request
  RESPONSE=$(curl -s -X POST "${API_HOST}/v1/image_generation" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"image-01\",
      \"prompt\": \"${PROMPT}\",
      \"image_count\": 1
    }")
  
  # Check if response contains image data
  if echo "$RESPONSE" | grep -q "data\|image_url\|file_content"; then
    echo "  ✓ Response received"
    
    # Try to extract and save image data
    # Different APIs format responses differently
    IMAGE_DATA=$(echo "$RESPONSE" | grep -o '"file_content":"[^"]*' | head -1 | cut -d'"' -f4)
    
    if [ -n "$IMAGE_DATA" ]; then
      echo "$IMAGE_DATA" | base64 -d > "minimax-output/$FILENAME"
      echo "  ✓ Image saved to minimax-output/$FILENAME"
    else
      echo "  ✗ Could not extract image data"
    fi
  else
    echo "  ✗ API response: ${RESPONSE:0:100}"
  fi
  
  sleep 1
done

echo "Image generation complete!"
