import json
import uuid
import logging
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import List, Dict, Any
from models.image import Image


logger = logging.getLogger(__name__)

class MobileMapService:
    @staticmethod
    def calculate_hex_tiles(
        db: Session,
        area_id: str,
        month: int,
        year: int,
        week: int,
        threshold: int
    ) -> List[Dict[str, Any]]:
        try:
            parsed_area_id = uuid.UUID(area_id)
        except ValueError:
            logger.error(f"Invalid UUID string passed to hex calculation: {area_id}")
            return []
            
        hex_size = 0.0015


        check_sql = text("""
            SELECT COUNT(img.image_id) 
            FROM images img
            JOIN drone_flight_logs fl ON img.flight_id = fl.flight_id
            WHERE fl.area_id = :area_id
                AND EXTRACT(MONTH FROM fl.flight_date) = :month
                AND EXTRACT(YEAR FROM fl.flight_date) = :year
                AND (
                    (:week < 4 AND EXTRACT(DAY FROM fl.flight_date) <= (:week * 7))
                    OR 
                    (:week = 4)
                )
                AND img.processing_status = 'done'
        """)
        
        try:
            record_count = db.execute(check_sql, {
                "area_id": parsed_area_id,
                "month": month,
                "year": year,
                "week": week
            }).scalar()
        except Exception as e:
            logger.error(f"Error checking record count: {str(e)}")
            raise e

        if not record_count or record_count == 0:
            logger.info(f"No processed image tracking points found for area {area_id} matching filters.")
            return []

        sql_executable = text("""
            WITH filtered_images AS (
                SELECT 
                    img.image_id,
                    ST_SetSRID(ST_Point(img.longitude, img.latitude), 4326) as pt_geom
                FROM images img
                JOIN drone_flight_logs fl ON img.flight_id = fl.flight_id
                WHERE fl.area_id = :area_id
                AND EXTRACT(MONTH FROM fl.flight_date) = :month
                AND EXTRACT(YEAR FROM fl.flight_date) = :year
                AND (
                    (:week < 4 AND EXTRACT(DAY FROM fl.flight_date) <= (:week * 7))
                    OR 
                    (:week = 4)
                )
                AND img.processing_status = 'done'
            ),
            grid AS (
                SELECT h.geom
                FROM (
                    SELECT ST_SetSRID(ST_Extent(pt_geom), 4326) as bbox FROM filtered_images
                ) b,
                ST_HexagonGrid(:hex_size, b.bbox) h
            )
            SELECT 
                COUNT(fi.image_id) as cell_count,
                ARRAY_AGG(CAST(fi.image_id AS TEXT)) as image_ids,
                ST_AsGeoJSON(g.geom) as hex_geojson
            FROM grid g
            JOIN filtered_images fi ON ST_Contains(g.geom, fi.pt_geom)
            GROUP BY g.geom
            HAVING COUNT(fi.image_id) >= :threshold
        """)

        try:
            results = db.execute(sql_executable, {
                "area_id": parsed_area_id,
                "hex_size": hex_size,
                "month": month,
                "year": year,
                "week": week,
                "threshold": threshold
            }).fetchall()

            payload = []
            for row in results:
                geo_data = json.loads(row.hex_geojson)
                
                if "coordinates" in geo_data:
                    coords = geo_data["coordinates"]
                    if isinstance(coords[0], list) and isinstance(coords[0][0], list):
                        raw_coords = coords[0]
                    else:
                        raw_coords = coords
                else:
                    continue

                payload.append({
                    "polygon": raw_coords,
                    "image_ids": row.image_ids,
                    "count": row.cell_count
                })
                
            return payload
        
    

        except Exception as query_error:
            logger.error(f"Database Execution Exception in calculate_hex_tiles: {str(query_error)}")
            raise query_error
        
    @staticmethod
    def fetch_batch_images(db: Session, image_ids: List[str]) -> List[Dict[str, Any]]:
        """
        Fetches full metadata along with mapped bounding box detections for a list of image UUIDs.
        Uses eager loading to avoid lazy loading empty relations.
        """
        if not image_ids:
            return []
            
        parsed_ids = [uuid.UUID(i_id) for i_id in image_ids]
        
        # 1. Eagerly load detections to prevent detached session issues
        images = db.query(Image).options(
            joinedload(Image.detections)
        ).filter(
            Image.image_id.in_(parsed_ids),
            # DB enum labels: 'done' (completed) / 'pending' — see
            # ProcessingStatus in models/image.py
            Image.processing_status.in_(['done', 'pending'])
        ).all()
        
        payload = []
        for img in images:
            detection_list = []
            for d in img.detections:
                # Map table columns to what the Flutter UI uses.
                # box_2d is [x1, y1, x2, y2] in ABSOLUTE original-image pixel
                # coordinates (ml/detect.py emits ultralytics' xyxy directly).
                # The app's BoundingBoxPainter scales these against the
                # decoded image's natural dimensions at render time, so no
                # normalization happens server-side.
                box_2d_array = [
                    float(d.bbox_x1),
                    float(d.bbox_y1),
                    float(d.bbox_x2),
                    float(d.bbox_y2),
                ]

                detection_list.append({
                    "label": d.waste_type,            # 'waste_type' column -> 'label'
                    "confidence": d.confidence_score,  # 'confidence_score' column -> 'confidence'
                    "box_2d": box_2d_array
                })

            # The drawer renders 'type' as the thumbnail badge. Use the
            # representative waste type (highest-confidence detection) instead
            # of the filename extension, which produced a literal "JPG" badge
            # on every thumbnail. None -> the app hides the badge.
            image_type = (
                max(img.detections, key=lambda d: d.confidence_score).waste_type
                if img.detections
                else None
            )

            payload.append({
                "image_id": str(img.image_id),
                "file_url": img.file_url,
                "latitude": img.latitude,
                "longitude": img.longitude,
                "captured_at": img.captured_at.isoformat() if img.captured_at else None,
                "type": image_type,
                # Original-frame pixel dimensions. Let the app scale bounding
                # boxes WITHOUT decoding the full-res image (mobile OOM guard);
                # null means legacy/unknown -> the app falls back to decoding.
                "image_width": img.image_width,
                "image_height": img.image_height,
                "detections": detection_list
            })
            
        return payload