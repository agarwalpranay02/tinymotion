import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const handler = async (req: Request) => (await getAuth()).handler(req);
export const { GET, POST } = toNextJsHandler(handler);
