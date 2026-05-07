import type { UploadUrlRequest, UploadUrlResponse } from "@workspace/api-client-react";
import { post } from "../fetch";

export const storage = {
  requestUploadUrl: (body: UploadUrlRequest): Promise<UploadUrlResponse> =>
    post("/api/storage/uploads/request-url", body),
};
