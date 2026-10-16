import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requestSchema } from "./dinner.service";
import { recommendDinnerAgent } from "./dinner.agent";

export const recommendDinner = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(({ data }) => {
    const request = getRequest();
    // Vercel supplies this header. Do not trust arbitrary client X-Forwarded-For.
    const caller = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : "local-development";
    return recommendDinnerAgent(data, caller || "unknown-shared-caller");
  });
