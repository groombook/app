#!/bin/bash

API_HOST="https://api.minimax.io"
API_KEY="$MINIMAX_API_KEY"
OUTPUT_DIR="minimax-output"

mkdir -p "$OUTPUT_DIR"

# Diverse dog image prompts
declare -a PROMPTS=(
  "A beautiful red Irish Setter with long flowing silky coat, standing proudly in golden hour sunlight, professional pet portrait photography, warm tones"
  "A fluffy white Pomeranian puppy with thick fluffy coat, sitting alert with bright expression, studio white background, cute grooming"
  "A black Schnauzer with distinctive full beard and mustache, freshly groomed with neat styling, professional grooming salon setting"
  "A cream and white Cavalier King Charles Spaniel with silky coat, gentle sad eyes, soft warm indoor lighting, elegant pose"
  "A brown and white Basset Hound with long droopy ears, lying down in relaxed pose, natural outdoor setting, peaceful expression"
  "A black and tan miniature Dachshund with glossy coat, alert standing pose, warm studio lighting, detailed paws visible"
  "A white fluffy Bichon Frise after professional grooming with rounded topknot, happy bouncy expression, bright cheerful background"
  "A muscular fawn Boxer dog, athletic build, standing confidently outdoors in park, energetic expression, natural lighting"
  "A blue merle Shetland Sheepdog with alert ears and fluffy coat, running happily, green grass field background, vibrant"
  "A buff colored Cocker Spaniel with beautiful silky coat, friendly gentle expression, warm natural window lighting, indoor"
)

declare -a FILENAMES=(
  "dog-setter-red-sunlit.png"
  "dog-pomeranian-white-studio.png"
  "dog-schnauzer-black-groomed.png"
  "dog-cavalier-cream-gentle.png"
  "dog-basset-brown-white.png"
  "dog-dachshund-black-tan.png"
  "dog-bichon-white-groomed.png"
  "dog-boxer-fawn-athletic.png"
  "dog-sheepdog-merle-running.png"
  "dog-cocker-buff-friendly.png"
)

echo "Generating ${#PROMPTS[@]} diverse dog images..."

for i in "${!PROMPTS[@]}"; do
  PROMPT="${PROMPTS[$i]}"
  FILENAME="${FILENAMES[$i]}"
  
  echo -n "[$((i+1))/${#PROMPTS[@]}] $FILENAME... "
  
  RESPONSE=$(curl -s -X POST "${API_HOST}/v1/image_generation" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"image-01\",\"prompt\":\"${PROMPT}\",\"image_count\":1}")
  
  # Extract image URL from response
  IMAGE_URL=$(echo "$RESPONSE" | grep -o '"image_urls":\["\([^"]*\)' | cut -d'"' -f4)
  
  if [ -n "$IMAGE_URL" ]; then
    curl -s "$IMAGE_URL" -o "$OUTPUT_DIR/$FILENAME" 2>/dev/null
    if [ -f "$OUTPUT_DIR/$FILENAME" ] && [ -s "$OUTPUT_DIR/$FILENAME" ]; then
      echo "✓"
    else
      echo "✗ (download failed)"
    fi
  else
    echo "✗ (no URL)"
  fi
done

echo "Done! Generated images in $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR"/dog-*.png 2>/dev/null | wc -l
