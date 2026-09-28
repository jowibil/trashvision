import argparse
import os
from pathlib import Path
from ultralytics import YOLO

def run_detection(input_folder):
    # Define paths
    weights_path = "weights/trashvision/weights/best.pt"
    output_dir = "./results"
    
    # Verify weights exist
    if not os.path.exists(weights_path):
        print(f"Error: Weights file not found at '{weights_path}'")
        return

    # Verify input folder exists
    if not os.path.exists(input_folder):
        print(f"Error: Input folder '{input_folder}' does not exist.")
        return

    print(f"Loading YOLOv8 model from {weights_path}...")
    model = YOLO(weights_path)

    print(f"Running inference on images in '{input_folder}'...")
    
    # YOLOv8 built-in predict handles looping through folders, drawing bounding boxes, 
    # writing labels/confidence scores, and saving them.
    results = model.predict(
        source=input_folder,
        project=output_dir,  # Root target folder
        name=".",            # Saves directly into the project folder instead of a subfolder
        exist_ok=True,       # Overwrites/saves into the same folder if it already exists
        save=True,           # Saves the visual images with bounding boxes, labels, and conf
        save_txt=False,      # Set to True if you also want raw text coordinate files
        conf=0.25            # Minimum confidence threshold for detections
    )

    print(f"\nDetection complete! Results saved to: {os.path.abspath(output_dir)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="YOLOv8 Inference Script for TrashVision")
    parser.add_argument(
        "--input", 
        type=str, 
        required=True, 
        help="Path to the folder containing images for detection"
    )
    
    args = parser.parse_args()
    run_detection(args.input)