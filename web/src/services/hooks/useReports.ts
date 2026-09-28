import { useState, useEffect } from 'react';
import api from '../../api/axios';
import * as turf from '@turf/turf';

export interface Detection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
}

export interface Report {
  report_id: string;
  waste_type: string;
  photo_url: string;
  description: string;
  status: string;
  latitude: number;
  longitude: number;
  reporter_name: string;
  detections?: Detection[];
  timestamp?: Date;   
}

export const useReports = (status: string = 'verified') => {
  const [reports, setReports] = useState<Report[]>([]);
  const [reportGeoJSON, setReportGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/reports/?status=${status}`);
        const data: Report[] = response.data;
        
        setReports(data);

        const features = data.map((report) => 
          turf.point([report.longitude, report.latitude], {
            id: report.report_id,
            type: report.waste_type,
            image: report.photo_url,
            description: report.description,
            reporter: report.reporter_name,
            isUserReport: true
          })
        );

        setReportGeoJSON(turf.featureCollection(features));
      } catch (error) {
        console.error("Error fetching reports:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [status]);

  return { reports, reportGeoJSON, loading };
};