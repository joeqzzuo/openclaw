import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";

export const LuffaChannelConfigSchema = buildChannelConfigSchema(z.object({}).passthrough());
