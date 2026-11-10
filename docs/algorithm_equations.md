<!-- Page 1 -->

Mathematical Formulation: DBSCAN Deduplication & Litter
Density Mapping
This document formalizes the two spatial algorithms used in the TrashVision pipeline:
1. DBSCAN — used in two stages (frame-level pre-processing, detection-level accuracy
pass)
2. CalculateLitterDensityMap — hexbin density mapping with per-cell and global
Clean Coast Index (CCI) scoring
1. DBSCAN (Stage A & Stage B)
The underlying math is identical for both stages — only the input point set and the
neighborhood radius (ε) differ.
1.1 Distance Metric
Since input points are geographic coordinates (latitude, longitude), not planar Cartesian
coordinates, distance is computed using the haversine formula rather than Euclidean
distance.
For two points p = (ϕ ,λ ) and p = (ϕ ,λ ), expressed in radians:
i i i j j j
ϕ − ϕ λ − λ
a = sin2 j i + cos(ϕ )cos(ϕ )sin2 j i
i j
( 2 ) ( 2 )
d(p ,p ) = 2R ⋅ arcsin( a)
i j
Where:
R = 6,371,000 m (mean Earth radius)
d(p ,p ) = great-circle distance in meters
i j
This distance value is what gets compared against ε in every step below.
1.2 Neighborhood
N (p) = {q ∈ D ∣ d(p,q) ≤ ε}
ε
Where D is the full set of input points for the given stage.

---

<!-- Page 2 -->

1.3 Core Point Condition
p is a core point ⟺ ∣N (p)∣ ≥ minPts
ε
1.4 Density-Reachability
q is directly density-reachable from p if p is a core point and q ∈ N (p).
ε
q is density-reachable from p if there exists a chain of points p = p ,p ,…,p = q
1 2 n
such that each p is directly density-reachable from p .
i+1 i
1.5 Cluster Definition
C = {q ∈ D ∣ q is density-reachable from some core point p ∈ C }
Points not density-reachable from any core point are labeled noise. In this pipeline, noise
points are not discarded — each is retained as its own singleton cluster, representing one
valid item or frame.
1.6 Representative Point (Cluster Centroid)
Used in both stages to collapse a cluster into a single representative coordinate:
### ∣C∣ ∣C∣
1 1
p = ϕ , λ
rep i i
### ∣C∣ ∑ ∣C∣ ∑
i=1 i=1
1.7 Stage Parameters
Stage Input Points ε (epsilon) Purpose
A — Frame- Drone flight metadata GPS ε = 3 m Reduce redundant frames
frame
level (camera position per image) before storage/inference
B — Georeferenced litter ε ≈ Merge duplicate detections of
detection
Detection- detections (post-YOLOv8) 2–3×GSD the same physical item
level
Where GSD = Ground Sample Distance (meters per pixel) at survey altitude.

---

<!-- Page 3 -->

2. CalculateLitterDensityMap
2.1 Per Hex Cell
For each hex cell h in the grid:
item_count(h) = {p ∈ P ∣ p ∈ h}
dedup
item_count(h)
litter_density(h) =
area(h)
item_count(h)
CCI(h) = K ⋅ litter_density(h) = K ⋅
area(h)
Where:
P = deduplicated litter points (output of Stage B)
dedup
area(h) = geodesic area of the hex cell, in square meters
K = CCI scaling coefficient (typically K = 20)
2.2 Global Summary
Over the full survey polygon A:
total_items = ∣P ∣ = item_count(h)
dedup
∑
h∈grid
total_items
global_density =
area(A)
total_items
CCI = K ⋅ global_density = K ⋅
global
area(A)
2.3 Pollution Classification
Applied to either CCI(h) (per hex) or CCI (survey-wide):
global

---

<!-- Page 4 -->

Very Clean 0 ≤ cci ≤ 2
⎧
Clean 2 < cci ≤ 5
category(cci) = Moderate 5 < cci ≤ 10
⎨
Dirty 10 < cci ≤ 20
Extremely Dirty cci > 20
⎩
2.4 Note on Hex Cell Area
The planar area formula for a regular hexagon of side length s is:
3 3
area = s2
planar
2
This formula assumes a flat-Earth (Cartesian) grid and should not be used directly for
area(h) in Section 2.1 — it distorts increasingly with survey size and latitude.
Implementations should instead use the geodesic area of the actual lat/lng hex polygon
(e.g., as returned by ), which correctly accounts for Earth's curvature.
turf.area()
Summary of Symbols
Symbol Meaning
ϕ,λ Latitude, longitude (radians)
R Earth radius (6,371,000 m)
ε DBSCAN neighborhood radius (meters)
minPts Minimum points required to form a DBSCAN core cluster
D Full input point set for a DBSCAN stage
C A single DBSCAN cluster
P Deduplicated litter points (Stage B output)
dedup
h A single hex cell in the density grid
A Survey polygon (Geoman-drawn boundary)

---

<!-- Page 5 -->

Symbol Meaning
K CCI scaling coefficient (typically 20)
GSD Ground Sample Distance (m/pixel)