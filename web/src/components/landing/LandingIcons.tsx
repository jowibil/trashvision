import { 
  ScanSearch, 
  Map, 
  Navigation, 
  BarChart3, 
  Smartphone, 
  FileText,
  Monitor,
  MapPin,
} from 'lucide-react';
import type {  LucideIcon } from 'lucide-react'

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface Step {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const stats = [
  { value: "12,400+", label: "Waste Items Detected" },
  { value: "28", label: "Shoreline Areas Monitored" },
  { value: "500+", label: "Reports Processed" },
];

export const features: Feature[] = [
  {
    icon: ScanSearch,
    title: "Real-Time Detection",
    description: "State-of-the-art computer vision models trained to identify over 50 types of marine debris instantly.",
  },
  {
    icon: Map,
    title: "Interactive Hotspot Map",
    description: "Visualize pollution density across your jurisdiction with geospatial heatmaps and coordinate logging.",
  },
  {
    icon: Navigation,
    title: "Drone Batch Processing",
    description: "Upload thousands of aerial images from standard commercial drones for high-speed automated auditing.",
  },
  {
    icon: BarChart3,
    title: "Data-Driven Insights",
    description: "Long-term trend analysis to predict waste accumulation patterns based on seasonal and tidal data.",
  },
  {
    icon: Smartphone,
    title: "Community Reporting",
    description: "Mobile-first gateway for citizens to report trash sightings directly to the government dashboard.",
  },
  {
    icon: FileText,
    title: "Automated Reports",
    description: "Generate PDF environmental impact reports and cleanup request orders with a single click.",
  },
];

export const steps: Step[] = [
  {
    icon: Navigation,
    title: "Fly the Drone",
    description: "We deploy standard surveillance drones over target coastal areas.",
  },
  {
    icon: Monitor,
    title: "Analyzes",
    description: "Our neural networks scan every pixel for plastic, glass, and metal debris.",
  },
  {
    icon: MapPin,
    title: "View & Act",
    description: "Access precise locations and coordinate rapid cleanup responses.",
  },
];