import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createS3UploadSigner } from "../src/storage/s3-upload-signer";

describe("S3UploadSigner", () => {
  it("creates deterministic R2-compatible signed PUT URLs without exposing secrets", async () => {
    const signer = createS3UploadSigner({
      bucket: "content-ops-dev",
      region: "auto",
      endpoint: "https://account.r2.cloudflarestorage.com",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      now: () => new Date("2026-05-22T12:00:00.000Z"),
    });

    const target = await signer.presignUpload({
      key: "workspaces/workspace_123/projects/project_456/uploads/asset_abc/founder-demo.mov",
      contentType: "video/quicktime",
      sizeBytes: 250_000_000,
      expiresAt: new Date("2026-05-22T12:15:00.000Z"),
    });
    const url = new URL(target.url);

    assert.equal(target.method, "PUT");
    assert.deepEqual(target.headers, { "content-type": "video/quicktime" });
    assert.equal(target.expiresAt, "2026-05-22T12:15:00.000Z");
    assert.equal(url.host, "account.r2.cloudflarestorage.com");
    assert.equal(
      url.pathname,
      "/content-ops-dev/workspaces/workspace_123/projects/project_456/uploads/asset_abc/founder-demo.mov",
    );
    assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.equal(
      url.searchParams.get("X-Amz-Credential"),
      "test-access-key/20260522/auto/s3/aws4_request",
    );
    assert.equal(url.searchParams.get("X-Amz-Date"), "20260522T120000Z");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
    assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
    assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[a-f0-9]{64}$/);
    assert.doesNotMatch(target.url, /test-secret-key/);
  });

  it("creates signed GET URLs for completed render outputs", async () => {
    const signer = createS3UploadSigner({
      bucket: "content-ops-dev",
      region: "auto",
      endpoint: "https://account.r2.cloudflarestorage.com",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      now: () => new Date("2026-05-22T12:00:00.000Z"),
    });

    const target = await signer.presignDownload({
      key: "workspaces/workspace_123/projects/project_456/renders/asset_abc/clip-1.mp4",
      responseContentType: "video/mp4",
      responseContentDisposition: "attachment; filename=\"clip-1.mp4\"",
      expiresAt: new Date("2026-05-22T12:10:00.000Z"),
    });
    const url = new URL(target.url);

    assert.equal(target.method, "GET");
    assert.deepEqual(target.headers, {});
    assert.equal(target.expiresAt, "2026-05-22T12:10:00.000Z");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
    assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "host");
    assert.equal(url.searchParams.get("response-content-type"), "video/mp4");
    assert.equal(
      url.searchParams.get("response-content-disposition"),
      "attachment; filename=\"clip-1.mp4\"",
    );
    assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[a-f0-9]{64}$/);
    assert.doesNotMatch(target.url, /test-secret-key/);
  });
});
