/** Haversine distance of two GPS coordinates in metres. */
export function distanceMeters(a,b) {
  const p=Math.PI/180,dLat=(b.latitude-a.latitude)*p,dLon=(b.longitude-a.longitude)*p;
  const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*p)*Math.cos(b.latitude*p)*Math.sin(dLon/2)**2;
  return 2*6371000*Math.asin(Math.min(1,Math.sqrt(h)));
}
/** Keep only plausible GPS hops. Server independently applies its own checks. */
export function plausibleHop(meters,elapsedSeconds) {
  return Number.isFinite(meters) && Number.isFinite(elapsedSeconds) &&
    elapsedSeconds >= 1 && elapsedSeconds <= 600 && meters>=5 && meters<=500 && meters/elapsedSeconds<=45;
}
