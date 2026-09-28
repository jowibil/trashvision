import os
import sys

# Files or directories to ignore completely (prevents bloating)
IGNORE_DIRS = {
    '.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', 
    'venv', 'env', '.expo', 'ios', 'android', '.vscode', 'ml', '.dart_tool', 'macos', 'test', 'migrations', 'web', 'backend'
}
IGNORE_FILES = {
    'package-lock.json', 'yarn.lock', 'bundle_code.py', '.env', 
    'project_context.txt', 'project_context.md'     
}
# Only include actual code assets to save space
ALLOWED_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.py', '.dart', '.json'}

def bundle_project(output_file="project_context.txt"):
    # Always resolve the path relative to the script itself to prevent working directory issues
    project_root = os.path.dirname(os.path.abspath(__file__))
    
    print("🚀 Starting Codebase Bundler...")
    print(f"📁 Project Root Directory: {project_root}")
    
    file_list = []
    
    # Gather and count target files using absolute script directory as anchor
    for root, dirs, files in os.walk(project_root):
        # Modifies dirs in-place to ignore specified directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for file in files:
            if file in IGNORE_FILES:
                continue
            ext = os.path.splitext(file)[1]
            if ext in ALLOWED_EXTENSIONS:
                full_path = os.path.join(root, file)
                relative_path = os.path.relpath(full_path, project_root)
                file_list.append((relative_path, full_path, ext[1:]))

    if not file_list:
        print("⚠️ No matching files found! Ensure the script is located in the root of your directory.")
        return

    print(f"📦 Found {len(file_list)} files matching criteria. Packing contents...")

    output_path = os.path.join(project_root, output_file)

    try:
        with open(output_path, 'w', encoding='utf-8') as outfile:
            outfile.write("# CODEBASE CONTEXT\n\n")
            outfile.write("## File Structure Summary\n")
            
            for rel_path, _, _ in file_list:
                outfile.write(f"- {rel_path}\n")
                print(f"  🔍 Indexed: {rel_path}")
                
            outfile.write("\n" + "="*50 + "\n\n## Source Code Contents\n\n")

            # Append actual file contents
            for i, (rel_path, full_path, lang) in enumerate(file_list, 1):
                print(f"  ⚡ [{i}/{len(file_list)}] Bundling: {rel_path}...")
                outfile.write(f"### File: {rel_path}\n")
                outfile.write(f"```{lang}\n")
                try:
                    with open(full_path, 'r', encoding='utf-8') as infile:
                        outfile.write(infile.read())
                except Exception as e:
                    outfile.write(f"// Error reading file: {e}\n")
                    print(f"  ❌ Error reading {rel_path}: {e}")
                outfile.write("\n```\n\n" + "-"*30 + "\n\n")
                
        print(f"\n🎉 Success! Combined project context saved to: {output_path}")
        print(f"💾 Total file size: {os.path.getsize(output_path) / 1024:.2f} KB")
        
    except Exception as e:
        print(f"❌ Critical Error writing output bundle: {e}")

if __name__ == "__main__":
    bundle_project()