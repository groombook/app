#!/usr/bin/env python3
import base64
import requests
import os
import json
import time
from datetime import datetime

api_key = os.environ.get("MINIMAX_API_KEY")
if not api_key:
    raise ValueError("MINIMAX_API_KEY environment variable not set")

url = "https://api.minimax.io/v1/image_generation"
headers = {"Authorization": f"Bearer {api_key}"}

os.makedirs("minimax-output", exist_ok=True)

# Comprehensive list of dog breeds and variations for diverse demo data
dog_prompts = [
    # Large breeds
    ("german-shepherd-alert", "German Shepherd dog with alert expression, standing confidently, professional pet photography, studio lighting, photorealistic"),
    ("golden-retriever-happy", "Golden Retriever with joyful expression, sitting, golden coat, natural daylight, professional pet photography, photorealistic"),
    ("labrador-running", "Black Labrador Retriever running towards camera, outdoor park setting, dynamic pose, professional pet photography, photorealistic"),
    ("german-shepherd-sitting", "German Shepherd sitting in front of studio backdrop, professional portrait, studio lighting, photorealistic"),
    ("golden-retriever-lying", "Golden Retriever lying down on grass, peaceful expression, outdoor natural lighting, professional pet photography, photorealistic"),

    # Medium breeds
    ("beagle-curious", "Beagle with curious expression, sitting, outdoor garden setting, professional pet photography, photorealistic"),
    ("cocker-spaniel-groomed", "Cocker Spaniel freshly groomed with fluffy coat, happy expression, professional grooming studio, photorealistic"),
    ("english-springer-spaniel", "English Springer Spaniel in natural outdoor setting, alert pose, professional pet photography, photorealistic"),
    ("boxer-playful", "Boxer dog with playful expression, standing, muscular build, professional studio lighting, photorealistic"),
    ("bulldog-gentle", "English Bulldog with gentle expression, sitting, studio backdrop, professional pet photography, photorealistic"),

    # Small breeds
    ("maltese-fluffy", "Maltese dog with white fluffy coat, sitting, groomed appearance, professional pet photography, studio lighting, photorealistic"),
    ("shih-tzu-groomed", "Shih Tzu with long groomed coat, sitting pretty, professional grooming studio, photorealistic"),
    ("pomeranian-alert", "Pomeranian with alert expression, standing, fluffy coat, professional pet photography, photorealistic"),
    ("yorkshire-terrier", "Yorkshire Terrier with silky coat, sitting, professional grooming environment, photorealistic"),
    ("pug-curious", "Pug with curious expression, sitting, studio lighting, professional pet photography, photorealistic"),

    # Specialty breeds
    ("poodle-standard-groomed", "Standard Poodle with professionally groomed coat, standing in show stance, professional grooming studio, photorealistic"),
    ("dachshund-long", "Long-haired Dachshund, lying down, relaxed pose, professional pet photography, photorealistic"),
    ("corgi-happy", "Welsh Corgi with happy expression, standing, professional outdoor setting, photorealistic"),
    ("husky-alert", "Siberian Husky with alert expression, sitting, professional pet photography, studio lighting, photorealistic"),
    ("german-shepherd-lying", "German Shepherd lying down in relaxed pose, indoor setting, professional pet photography, photorealistic"),

    # Mixed/rescue variations
    ("mixed-breed-brown", "Brown and white mixed breed dog, friendly expression, sitting, professional pet photography, photorealistic"),
    ("mixed-breed-black", "Black mixed breed dog with gentle eyes, standing, outdoor natural lighting, photorealistic"),
    ("mixed-breed-spotted", "Spotted mixed breed dog, playful pose, outdoor park setting, professional pet photography, photorealistic"),
    ("terrier-mix-sitting", "Terrier mix dog, alert expression, sitting, professional studio backdrop, photorealistic"),
    ("spaniel-mix-outdoor", "Spaniel mix dog in outdoor garden, relaxed pose, natural daylight, professional pet photography, photorealistic"),

    # Additional variations
    ("labrador-golden", "Golden Labrador Retriever, calm expression, standing in professional pose, studio lighting, photorealistic"),
    ("labrador-black-sitting", "Black Labrador Retriever sitting, gentle expression, professional pet photography, photorealistic"),
    ("rottweiler-calm", "Rottweiler with calm expression, sitting, professional studio, photorealistic"),
    ("doberman-alert", "Doberman Pinscher with alert expression, standing, professional pet photography, photorealistic"),
    ("german-shepherd-side", "German Shepherd in side profile, standing, professional outdoor setting, photorealistic"),
]

print(f"Generating {len(dog_prompts)} unique dog images...")
print(f"Start time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("")

generated = 0
failed = 0

for i, (filename_base, prompt) in enumerate(dog_prompts, 1):
    filename = f"dog-{filename_base}.png"
    filepath = f"minimax-output/{filename}"

    # Check if already exists
    if os.path.exists(filepath):
        size = os.path.getsize(filepath)
        print(f"[{i:2d}/{len(dog_prompts)}] ✓ {filename} (already exists, {size} bytes)")
        generated += 1
        continue

    print(f"[{i:2d}/{len(dog_prompts)}] Generating {filename}...", end=" ", flush=True)

    payload = {
        "model": "image-01",
        "prompt": prompt,
        "aspect_ratio": "1:1",
        "response_format": "base64",
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=120)

        # Check for quota errors
        if response.status_code == 429:
            print(f"✗ QUOTA EXCEEDED")
            print(f"\nQuota limit reached after {generated} successful generations")
            break

        response.raise_for_status()

        data = response.json()
        if "data" in data and "image_base64" in data["data"]:
            images = data["data"]["image_base64"]

            with open(filepath, "wb") as f:
                f.write(base64.b64decode(images[0]))

            file_size = os.path.getsize(filepath)
            print(f"✓ ({file_size} bytes)")
            generated += 1
        else:
            print(f"✗ Unexpected response format")
            failed += 1

    except requests.exceptions.Timeout:
        print(f"✗ Timeout")
        failed += 1
    except requests.exceptions.RequestException as e:
        if "429" in str(e) or "quota" in str(e).lower():
            print(f"✗ QUOTA EXCEEDED")
            print(f"\nQuota limit reached after {generated} successful generations")
            break
        else:
            print(f"✗ {type(e).__name__}")
            failed += 1
    except Exception as e:
        print(f"✗ {type(e).__name__}")
        failed += 1

    time.sleep(0.5)  # Small delay between requests

print("")
print(f"End time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"✓ Successfully generated: {generated}")
print(f"✗ Failed: {failed}")
print(f"\nCopying images to demo-pets directory...")

# Copy all generated images to demo-pets
import subprocess
result = subprocess.run(
    ["cp", "-v", "minimax-output/dog-*.png", "apps/web/public/demo-pets/"],
    capture_output=True,
    text=True
)

if result.returncode == 0:
    # Count files in demo-pets
    import glob
    demo_pets = glob.glob("apps/web/public/demo-pets/dog-*.png")
    print(f"✓ Copied to demo-pets. Total dog images: {len(demo_pets)}")
else:
    print(f"Note: Copy result - {result.stderr}")
