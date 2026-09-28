import numpy as np
from sklearn.cluster import DBSCAN
from typing import List, Dict, Any


EARTH_RADIUS_METERS = 6371000.0

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