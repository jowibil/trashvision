import numpy as np
from sklearn.cluster import DBSCAN
from typing import List, Dict, Any


EARTH_RADIUS_METERS = 6371000.0

# Stage A neighborhood radius (meters): frames whose camera GPS points are
# closer than this share a cluster (conditions where documented on the Info
# page and served numerically by routes/info.py from this constant).
STAGE_A_EPS_METERS = 3.0

# Both DBSCAN stages run with min_samples=1 (every point is a cluster or a
# member — spread as a single 'noise' singleton), so nothing is ever dropped
# by clustering; dedup is represented, not discarded.
DBSCAN_MIN_SAMPLES = 1

def cluster_points(points: List[Dict[str, Any]], eps_meters: float, min_samples: int = 1) -> List[Dict[str, Any]]:
    
    
    if not points:
        return []
    
    
    coords_deg = np.array([[p["lat"], p["lng"]] for p in points])
    coords_rad = np.radians(coords_deg)
    
    eps_radius = eps_meters / EARTH_RADIUS_METERS
    
    db = DBSCAN(eps=eps_radius, min_samples=min_samples, metric='haversine').fit(coords_rad)
    labels = db.labels_
    
    clusters = {}
    
    for idx, label in enumerate(labels):
        point_data = points[idx]
        
        
        cluster_key = f"noise_{idx}" if label == -1 else int(label)
        
        if cluster_key not in clusters:
            clusters[cluster_key] = {
                "members": [],
                "coords": []
            }
            
        clusters[cluster_key]["members"].append(point_data)
        clusters[cluster_key]["coords"].append([point_data["lat"], point_data["lng"]])
    result = []
    for cluster_id, data in clusters.items():
        member_coords = np.array(data["coords"])
        
        
        centroid_lat = float(np.mean(member_coords[:, 0]))
        centroid_lng = float(np.mean(member_coords[:, 1]))
        
        representative_member = data["members"][0]
        
        result.append({
            "cluster_id": cluster_id,
            "representative_point": {
                "lat": centroid_lat,
                "lng": centroid_lng,
                "member_id": representative_member["id"]
            },
            "members": data["members"],
            "member_count": len(data["members"])
        })
        
    return result


# Stage B neighborhood: the SAME object's boxes in ONE frame, judged by overlap
# instead of distance. Every raw box from a frame carries that frame's single
# GPS fix, so a metric radius cannot separate "two boxes on one bottle" from
# "two bottles a frame-width apart" — IoU can. (History: the old rule was
# 2.5 x GSD in meters, which collapsed each frame to one detection.)
STAGE_B_IOU_EPS = 0.5


def _box_iou(a: List[float], b: List[float]) -> float:
    """Intersection-over-union of two [x1, y1, x2, y2] pixel boxes."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_w = min(ax2, bx2) - max(ax1, bx1)
    inter_h = min(ay2, by2) - max(ay1, by1)
    if inter_w <= 0 or inter_h <= 0:
        return 0.0
    intersection = inter_w * inter_h
    area_a = max(ax2 - ax1, 0.0) * max(ay2 - ay1, 0.0)
    area_b = max(bx2 - bx1, 0.0) * max(by2 - by1, 0.0)
    union = area_a + area_b - intersection
    return float(intersection / union) if union > 0 else 0.0


def cluster_boxes(
    detections: List[Dict[str, Any]], min_iou: float = STAGE_B_IOU_EPS
) -> List[Dict[str, Any]]:
    """Stage B: cluster one frame's raw YOLO boxes by overlap (pixel space).

    `detections` are the raw `{"classification", "confidence_score",
    "bounding_box"}` dicts. Clusters are shaped like cluster_points() results,
    minus coordinates: a frame has exactly ONE GPS fix, so the caller stamps
    that position on every retained row instead of averaging box centroids.

    Real DBSCAN, with a precomputed distance matrix and eps = 1 - min_iou
    (IoU is a similarity, DBSCAN wants a distance). min_samples=1 keeps the
    "nothing is ever dropped by clustering" property of Stage A: every box is
    either a cluster or a member, and the caller keeps the highest-confidence
    box of each cluster.

    Class-AGNOSTIC on purpose: two boxes on the same object routinely disagree
    on label ("foam cup" vs "plastic"), and keeping one per label is exactly
    the double count this stage exists to remove. The surviving box donates
    its own label, so the row is never a merged/fake class.
    """
    if not detections:
        return []

    boxes = np.array([d["bounding_box"] for d in detections], dtype=float)
    count = len(boxes)

    distance = np.ones((count, count))
    for i in range(count):
        distance[i, i] = 0.0
        for j in range(i + 1, count):
            d = 1.0 - _box_iou(boxes[i].tolist(), boxes[j].tolist())
            distance[i, j] = d
            distance[j, i] = d

    labels = DBSCAN(
        eps=1.0 - min_iou, min_samples=DBSCAN_MIN_SAMPLES, metric="precomputed"
    ).fit_predict(distance)

    groups: Dict[Any, List[int]] = {}
    for idx, label in enumerate(labels):
        # min_samples=1 means label -1 should not occur; if it ever does, give
        # each noise box its own group rather than losing it.
        key = f"noise_{idx}" if label == -1 else int(label)
        groups.setdefault(key, []).append(idx)

    result: List[Dict[str, Any]] = []
    for cluster_id, member_idx in groups.items():
        result.append(
            {
                "cluster_id": cluster_id,
                "representative_point": {
                    "lat": None,
                    "lng": None,
                    "member_id": member_idx[0],
                },
                "members": [{"raw_det": detections[i]} for i in member_idx],
                "member_count": len(member_idx),
            }
        )

    return result