export interface NavItem {
  label: string;
  href: string;
}
 
export interface StatItem {
  value: string;
  label: string;
}
 
export interface FeatureCard {
  icon: string;
  title: string;
  description: string;
}
 
export interface Step {
  number: number;
  icon: string;
  title: string;
  description: string;
}
 
export interface FooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

export type WasteClass = 
  | 'plastic' 
  | 'styrofoam' 
  | 'glass' 
  | 'metal' 
  | 'composite_packaging';

export interface Detection {
  id: string;
  user_id: number;
  image_url: string;
  waste_type: WasteClass;
  confidence: number;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
  latitude: number;
  longitude: number;
  created_at: string;
}

export const formatWasteType = (type: string): string => {
  const map: Record<string, string> = {
    plastic_rigid: 'Rigid Plastic',
    styrofoam: 'Styrofoam',
    glass: 'Glass',
    metal: 'Metal',
    composite_packaging: 'Composite Packaging',
    unknown: 'Unclassified Waste',
  };
  return map[type] || type;
};
export interface BoundingBox {
  /** Normalized or pixel-space coordinates depending on model output */
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  /** Class prediction label fallback */
  label?: string;
  /** Inference confidence score specifically for this individual box (0.0 - 1.0) */
  confidence?: number;
}

export interface AreaMetadata {
  area_id: string;
  area_name: string;
  description?: string;
  boundary_coordinates?: string; // GeoJSON or string-encoded spatial polygon mapping
  created_at?: string;
}

export interface DetectionRow {
  detection_id: string;
  timestamp: string;
  waste_type: 'plastic' | 'glass' | 'metal' | 'composite_packaging' | 'styrofoam' | string;
  confidence_score: number;
  image_url: string;

  image_width?: number; 
  image_height?: number; 
  
  bounding_boxes?: BoundingBox[] | string;

  latitude: number;
  longitude: number;
  volume_liters?: number;

  area_id?: string;
  area?: AreaMetadata;
  cluster_count?: number;
  sub_frames?: SubFrameTelemetry[];

  /** Backend sends bounding boxes under any of these shapes (see GET /detections). */
  detections?: BoundingBox[] | string;
  boxes?: BoundingBox[] | string;
  bbox_x1?: number;
  bbox_y1?: number;
  bbox_x2?: number;
  bbox_y2?: number;
}

export interface SubFrameTelemetry {
  detection_id: string;
  timestamp: string;
  confidence_score: number;
  image_url: string;
  bounding_boxes?: BoundingBox[] | string;
  latitude: number;
  longitude: number;
}

export interface PaginatedDetectionsResponse {
  data: DetectionRow[];
  total_records: number;
  total_pages: number;
  current_page: number;
  limit: number;
}

export interface DashboardStats {
  totalDetections: number;
  mostFrequentType: string;
  mostAffectedArea: string;
  trends: number[];
  composition: { type: string; percentage: number }[];
  activeZones: {
    id: string;
    name: string;
    date: string;
    severity: "Low" | "Medium" | "High" | "Critical";
  }[];
}


export type PollutionCategory = "Very high" | "High" | "Moderate" | "Low" | "Very low";

export interface HexbinProperties {
  pointIds: string[];
  images?: string[];
  types?: string[];
  x1s?: number[];
  y1s?: number[];
  x2s?: number[];
  y2s?: number[];
  confidence_scores?: number[];
  hex_area_m2: number;
  litter_density: number;
  cci_value: number;
  pollution_category: PollutionCategory;
}