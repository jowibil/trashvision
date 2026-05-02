import * as L from "leaflet";

declare module "leaflet" {
  export function heatLayer(
    latlngs: L.LatLngExpression[],
    options?: any
  ): L.Layer;
}