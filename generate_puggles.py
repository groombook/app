#!/usr/bin/env python3
import base64
import requests
import os
import json

api_key = os.environ.get("MINIMAX_API_KEY")
if not api_key:
    raise ValueError("MINIMAX_API_KEY environment variable not set")

url = "https://api.minimax.io/v1/image_generation"
headers = {"Authorization": f"Bearer {api_key}"}

# Ensure output directory exists
os.makedirs("minimax-output", exist_ok=True)

prompts = [
    {
        "filename": "dog-puggle-fawn-playful.png",
        "prompt": "Adorable fawn Puggle puppy with playful expression, compact muscular build, professional pet photography, studio lighting, photorealistic"
    },
    {
        "filename": "dog-puggle-black-sitting.png",
        "prompt": "Black and tan Puggle with alert sitting posture, pointed beagle-like ears, gentle eyes, professional studio lighting, photorealistic"
    },
    {
        "filename": "dog-puggle-cream-groomed.png",
        "prompt": "Cream Puggle freshly groomed with fluffy coat, happy expression, lying down comfortably, natural daylight, photorealistic"
    },
    {
        "filename": "dog-puggle-tricolor-outdoor.png",
        "prompt": "Tricolor Puggle in outdoor garden setting, alert playful pose, natural sunlight, professional pet photography, photorealistic"
    },
    {
        "filename": "dog-puggle-fawn-grooming.png",
        "prompt": "Fawn Puggle at grooming salon, gentle expression, compact muscular build with beagle-like features, professional grooming setup, warm lighting, photorealistic"
    }
]

print(f"Generating {len(prompts)} Puggle images...")

for item in prompts:
    filename = item["filename"]
    prompt = item["prompt"]

    print(f"\nGenerating {filename}...")

    payload = {
        "model": "image-01",
        "prompt": prompt,
        "aspect_ratio": "1:1",
        "response_format": "base64",
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()

        data = response.json()
        if "data" in data and "image_base64" in data["data"]:
            images = data["data"]["image_base64"]

            # Save the first (and usually only) image
            output_path = f"minimax-output/{filename}"
            with open(output_path, "wb") as f:
                f.write(base64.b64decode(images[0]))

            file_size = os.path.getsize(output_path)
            print(f"✓ Saved {filename} ({file_size} bytes)")
        else:
            print(f"✗ Unexpected response format: {json.dumps(data, indent=2)}")
    except requests.exceptions.RequestException as e:
        print(f"✗ Error generating {filename}: {e}")
    except Exception as e:
        print(f"✗ Unexpected error for {filename}: {e}")

print("\n✓ Image generation complete!")
print("Files saved to minimax-output/")
