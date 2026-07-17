import { handleTranscriptionRequest } from "./handler";

export default {
  fetch(request, env): Promise<Response> {
    return handleTranscriptionRequest(request, env.AI, {
      pagesOriginSuffix: env.ALLOWED_ORIGIN_SUFFIX,
    });
  },
} satisfies ExportedHandler<Env>;
