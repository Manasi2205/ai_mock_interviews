import Vapi from "@vapi-ai/web";

export function createVapi() {
    return new Vapi(
        process.env.NEXT_PUBLIC_VAPI_WEB_TOKEN!
    );
}