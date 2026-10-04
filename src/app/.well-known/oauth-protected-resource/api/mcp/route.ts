import { corsPreflight } from "@/server/oauth-http";
import { protectedResourceMetadata } from "@/server/protected-resource";

export const GET = protectedResourceMetadata;
export const OPTIONS = corsPreflight;
