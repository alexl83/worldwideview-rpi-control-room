import { AviationPlugin as UpstreamAviationPlugin } from "https://cdn.jsdelivr.net/npm/@worldwideview/wwv-plugin-aviation@1.0.21/+esm";

/**
 * Self-hosted compatibility wrapper.
 *
 * The upstream plugin derives its HTTP endpoint from the injected engine URL.
 * In a reverse-proxied deployment that value can fall back to the hosted data
 * engine and produce a misleading 404. Keep the upstream renderer and mapping,
 * but make data retrieval explicitly same-origin so Caddy owns the routing.
 */
export class AviationPlugin extends UpstreamAviationPlugin {
  async fetch() {
    try {
      const query = this.context.isPlaybackMode()
        ? `time=${this.context.getCurrentTime().getTime()}`
        : "lookback=15m";
      const response = await fetch(`/api/aviation?${query}`);

      if (!response.ok) {
        throw new Error(`Data Engine API returned ${response.status}`);
      }

      const payload = await response.json();
      return this.mapPayloadToEntities(payload.items);
    } catch (error) {
      console.error("[AviationPlugin] Fetch error:", error);
      this.context?.onError?.(error);
      return [];
    }
  }
}
