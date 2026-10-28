"""One-off static audit: find every non-stdlib top-level module imported by
backend source, resolve it to its installed package, and flag any package not
listed in requirements.txt (direct-import gaps that a clean Render install
would crash on, like email-validator, shapely and scikit-learn did)."""
import ast
import pathlib
import sys

root = pathlib.Path(__file__).parent
repo_root = root.parent  # exclude the sibling ml/ project and repo-level dirs

dirs_to_scan = {root} | {root / d.name for d in root.iterdir() if d.is_dir() and not d.name.startswith((".", "_"))}
local_top_py = {p.stem for p in root.glob("*.py")} | {d.name for d in root.iterdir() if d.is_dir()}

top_modules = set()
for d in dirs_to_scan:
    for f in d.rglob("*.py"):
        rel = f.relative_to(repo_root)
        # only inside backend/, never venv/ temp/ or hidden dirs
        if any(part in ("venv", "temp", "alembic", "migrations") or part.startswith((".", "_")) for part in rel.parts):
            continue
        try:
            tree = ast.parse(f.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    top_modules.add(a.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                top_modules.add(node.module.split(".")[0])

top_modules -= local_top_py  # project-internal modules imported from the same repo
top_modules.discard("ml")  # repo-root ml/ package (YOLO weights) — project code, not a pip dependency

stdlib = sys.stdlib_module_names
external = top_modules - stdlib

from importlib.metadata import packages_distributions
mod2dist = packages_distributions()
req = {line.split("==")[0].split("[")[0].strip().lower()
       for line in (root / "requirements.txt").read_text().splitlines()
       if line.strip() and not line.strip().startswith("#")}
gaps = []
for m in sorted(external):
    dists = mod2dist.get(m, [])
    if not dists:
        gaps.append((m, "UNRESOLVED — imported but no installed package provides it"))
        continue
    if not any(d.lower() in req for d in dists):
        gaps.append((m, f"package {dists[0]} not in requirements.txt"))

print(f"external imports found: {len(external)}: {sorted(external)}")
if gaps:
    for m, why in gaps:
        print(f"GAP  {m}: {why}")
    sys.exit(1)
print("no gaps — every imported package is stdlib, project-local, or comes from a pinned requirement (incl. transitive deps)")
