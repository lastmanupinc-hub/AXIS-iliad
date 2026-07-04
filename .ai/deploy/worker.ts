// AXIS deploy/worker.ts — Cloudflare Worker entry that proxies HTTP to the
// deploy/Dockerfile-built container instance. Required by wrangler.containers.toml.
//
// Install once:    npm i @cloudflare/containers
// Deploy:          npx wrangler deploy --config=deploy/wrangler.containers.toml

import { Container, getContainer } from "@cloudflare/containers";

export class AppContainer extends Container {
  // Must match EXPOSE in deploy/Dockerfile and PORT env in wrangler.containers.toml.
  defaultPort = 8080;
  // Idle the container after 5 minutes of no requests to save compute.
  sleepAfter = "5m";
}

interface Env {
  APP_CONTAINER: DurableObjectNamespace<AppContainer>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Routes every request to ONE container instance (good for a singleton/stateful
    // service). To use all `max_instances` in wrangler.containers.toml, pass a
    // per-request key (e.g. a session id) as the second arg, or use the library's
    // load-balancing helper, so requests fan out across instances.
    const container = getContainer(env.APP_CONTAINER, "axis-iliad");
    return container.fetch(request);
  },
};
