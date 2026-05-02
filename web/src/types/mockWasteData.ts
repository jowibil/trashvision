export interface DroneDetection {
  id: number;
  lat: number;
  lng: number;
  type: string;
  confidence: number;
  date: Date;
  imageUrl: string;
}

export const generateMockDroneData = (): DroneDetection[] => {
  const points: DroneDetection[] = [];
  const now = new Date();
  
  const refLng = 125.693071;
  const refLat = 7.288021;

  for (let cluster = 0; cluster < 5; cluster++) {
    const clusterCenterLng = refLng + (Math.random() - 0.5) * 0.05;
    const clusterCenterLat = refLat + (Math.random() - 0.5) * 0.02;
    
    for (let i = 0; i < 40; i++) {
      // Create a date between 0 and 28 days ago
      const daysAgo = Math.floor(Math.random() * 28);
      const detectionDate = new Date();
      detectionDate.setDate(now.getDate() - daysAgo);

      points.push({
        id: points.length,
        lng: clusterCenterLng + (Math.random() - 0.5) * 0.003,
        lat: clusterCenterLat + (Math.random() - 0.5) * 0.003,
        type: ["Plastic Bottle", "Plastic Bag"][Math.floor(Math.random() * 2)],
        confidence: Math.floor(Math.random() * 20) + 80,
        date: detectionDate, // Now relative to today
        imageUrl: `https://picsum.photos/seed/${points.length}/200`
      });
    }
  }
  return points;
};


export const locations = [
  {
    id: 1,
    name: "Lapaz - DICT Area",
    category: "Shoreline",
    lat: 7.2882,
    lng: 125.6931,
  },
  {
    id: 2,
    name: "Panabo Marine Sanctuary",
    category: "Conservation",
    lat: 7.2958,
    lng: 125.6985,
  },
  {
    id: 3,
    name: "Cagangohan Coastline",
    category: "Residential Shore",
    lat: 7.3085,
    lng: 125.7112,
  },
  {
    id: 4,
    name: "JP Laurel River Outlet",
    category: "Riverbed",
    lat: 7.3150,
    lng: 125.7155,
  },
  {
    id: 5,
    name: "San Pedro Mangroves",
    category: "Mangrove",
    lat: 7.2795,
    lng: 125.6880,
  },
  {
    id: 6,
    name: "New Pandan Port",
    category: "Industrial Shore",
    lat: 7.3220,
    lng: 125.7250,
  },
];


  export interface TrashLog {
  id: string;
  date: string;
  time: string;
  location: string;
  wasteTypes: WasteCategory[];
  confidence: number;
}
 export type WasteCategory = 
  | 'composite_packaging' 
  | 'plastic_film' 
  | 'plastic_rigid' 
  | 'glass' 
  | 'metal' 
  | 'styrofoam';

export const MOCK_DATA: TrashLog[] = [
  {
    id: '1',
    date: 'April 13, 2026',
    time: '13:24',
    location: 'Barangay Lapaz - DICT',
    wasteTypes: ['plastic_film', 'plastic_rigid', 'styrofoam'],
    confidence: 38.4,
  },
  {
    id: '2',
    date: 'April 13, 2026',
    time: '14:54',
    location: 'DICT - Divine Mercy',
    wasteTypes: ['plastic_rigid', 'plastic_film', 'metal', 'glass'],
    confidence: 65.1,
  },
  {
    id: '3',
    date: 'April 13, 2026',
    time: '15:32',
    location: 'Divine Mercy - Seawall Park',
    wasteTypes: ['plastic_rigid', 'plastic_film', 'metal', 'glass'],
    confidence: 62.7,
  },
  {
    id: '4',
    date: 'April 13, 2026',
    time: '16:25',
    location: 'Seawall Park - J.P. Laurel',
    wasteTypes: ['plastic_film', 'plastic_rigid', 'metal', 'glass', 'composite_packaging'],
    confidence: 91.9,
  },
];


export const uploadlocations = ["Lapaz - DICT", "DICT - Divine Mercy", "Shoreline Zone A", "Riverbed Zone"];
export const activities = [
    { id: 1, title: "DICT - Divine Mercy", subtitle: "Uploaded 12 mins ago • 1,240 images", status: "processing" },
    { id: 2, title: "Lapaz - DICT", subtitle: "Processed 2 hours ago • 458 items detected", status: "completed" },
    { id: 3, title: "Survey_Industrial_Zone_C", subtitle: "Failed 5 hours ago • Corrupt metadata", status: "error" },
  ];


  export type ReportStatus = 'PENDING' | 'VERIFIED';
  export type SeverityType = 'CRITICAL' | 'MEDIUM' | 'HIGH' | 'LOW';
  export interface CommunityReport {
  id: string;
  status: ReportStatus;
  imageUrl: string; // Dynamic URL (e.g., from Cloudinary)
  severity: SeverityType;
  submissionTime: string; // Human-readable date
  coordinates: { lat: number; lng: number };
  reporterName: string;
}

  export const MOCK_REPORTS_API_RESPONSE: CommunityReport[] = [
  {
    id: 'rep01',
    status: 'PENDING',
    imageUrl: 'https://images.unsplash.com/photo-1621451537084-482c730e390e',
    severity: 'CRITICAL',
    submissionTime: '2 hours ago',
    coordinates: { lat: 34.0522, lng: -118.2437 },
    reporterName: 'Vince Maarat',
  },
  {
    id: 'rep02',
    status: 'VERIFIED',
    imageUrl: 'https://images.unsplash.com/photo-1544465544-1b71aee9dfa3',
    severity: 'MEDIUM',
    submissionTime: 'Yesterday, 4:12 PM',
    coordinates: { lat: 34.0194, lng: -118.4912 },
    reporterName: 'Joebelle Genota',
  },
  {
    id: 'rep03',
    status: 'VERIFIED',
    imageUrl: 'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce',
    severity: 'HIGH',
    submissionTime: 'Jan 12, 11:30 AM',
    coordinates: { lat: 33.7701, lng: -118.1937 },
    reporterName: 'Joe Mama',
  },
];