#!/usr/bin/env python3
"""
YOLO Object Detection Script
Takes an image path as input and returns detection results in JSON format.
"""

import sys
import json
import os
import io
import contextlib
from pathlib import Path

try:
    import cv2
    import numpy as np
    from ultralytics import YOLO
except ImportError as e:
    print(f"Required packages not found: {e}", file=sys.stderr)
    print("Please install required packages: pip install ultralytics opencv-python numpy", file=sys.stderr)
    sys.exit(1)

# Suppress YOLO verbose output
import logging
logging.getLogger('ultralytics').setLevel(logging.WARNING)
logging.getLogger('torch').setLevel(logging.WARNING)

def load_model():
    """Load YOLO model with fallback options."""
    try:
        # Try to load YOLOv8n (nano - fastest, good for demo)
        model = YOLO('./model/LineGuard.pt')
        model.to('cpu')
        # Silently load model without any output
        return model
    except Exception as e:
        return None

def validate_image(image_path):
    """Validate that the image file exists and is readable."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    
    if not os.path.isfile(image_path):
        raise ValueError(f"Path is not a file: {image_path}")
    
    # Check file size
    file_size = os.path.getsize(image_path)
    if file_size == 0:
        raise ValueError("Image file is empty")
    
    # Try to read the image
    try:
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Could not read image file")
        return True
    except Exception as e:
        raise ValueError(f"Invalid image file: {e}")

def run_detection(image_path, model: YOLO):
    """Run YOLO detection on the given image."""
    try:
        # Suppress all output during inference
        with open(os.devnull, 'w') as devnull:
            old_stdout = sys.stdout
            old_stderr = sys.stderr
            sys.stdout = devnull
            sys.stderr = devnull
            
            try:
                # Run inference with all output suppressed
                results = model(image_path, verbose=False)
            finally:
                # Restore stdout/stderr
                sys.stdout = old_stdout
                sys.stderr = old_stderr
        
        # Process results
        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    # Get bounding box coordinates
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    width = x2 - x1
                    height = y2 - y1
                    
                    # Get class name and confidence
                    class_id = int(box.cls[0].cpu().numpy())
                    confidence = float(box.conf[0].cpu().numpy())
                    class_name = model.names[class_id]
                    
                    detection = {
                        "class": class_name,
                        "confidence": confidence,
                        "bbox": [float(x1), float(y1), float(width), float(height)]
                    }
                    detections.append(detection)
        
        return detections
        
    except Exception as e:
        raise Exception(f"Detection failed: {e}")

def main():
    """Main function to handle command line arguments and run detection."""
    if len(sys.argv) != 2:
        # Suppress error output to maintain clean JSON stream
        with open(os.devnull, 'w') as devnull:
            old_stderr = sys.stderr
            sys.stderr = devnull
            try:
                print(json.dumps({
                    "success": False,
                    "error": "Usage: python yolo_detector.py <image_path>"
                }))
            finally:
                sys.stderr = old_stderr
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    try:
        # Validate image
        validate_image(image_path)
        
        # Load model
        model = load_model()
        if model is None:
            # Suppress error output to maintain clean JSON stream
            with open(os.devnull, 'w') as devnull:
                old_stderr = sys.stderr
                sys.stderr = devnull
                try:
                    print(json.dumps({
                        "success": False,
                        "error": "Could not load YOLO model. Please ensure ultralytics is installed and models are available."
                    }))
                finally:
                    sys.stderr = old_stderr
            sys.exit(1)
        
        # Run detection
        detections = run_detection(image_path, model)
        print()
        # Return success result - ONLY output that should appear
        result = {
            "success": True,
            "detections": detections,
            "total_detections": len(detections),
            "image_path": image_path
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        # Return error result - suppress any additional error output
        error_result = {
            "success": False,
            "error": str(e),
            "image_path": image_path
        }
        
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()