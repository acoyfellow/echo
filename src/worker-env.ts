import type { CapabilityBridge } from "./codemode";
import type { EchoAgent } from "./agent";

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: { CapabilityBridge: typeof CapabilityBridge; EchoAgent: typeof EchoAgent };
      durableNamespaces: "EchoAgent";
    }
  }
}

export {};
