import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { S3CompatibleRenderStorage } from "../src/render-storage";

describe("S3-compatible render storage", () => {
  it("downloads objects with worker runtime credentials and writes the destination file", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "content-ops-s3-storage-"));
    const destinationPath = join(tempRoot, "worker", "source.mov");
    const requests: Request[] = [];
    const fetcher: typeof fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return new Response("downloaded source bytes", { status: 200 });
    };
    const storage = new S3CompatibleRenderStorage({
      ...S3_CONFIG,
      fetch: fetcher,
      now: FIXED_NOW,
    });

    try {
      const result = await storage.downloadObject({
        key: SOURCE_KEY,
        destinationPath,
      });

      assert.equal(result.key, SOURCE_KEY);
      assert.equal(result.localPath, destinationPath);
      assert.equal(result.sizeBytes, Buffer.byteLength("downloaded source bytes"));
      assert.equal(await readFile(destinationPath, "utf8"), "downloaded source bytes");
      assert.equal(requests.length, 1);
      assert.equal(requests[0]?.method, "GET");
      assert.equal(
        requests[0]?.url,
        `https://account.r2.cloudflarestorage.com/content-ops-dev/${SOURCE_KEY}`,
      );
      assert.match(requests[0]?.headers.get("authorization") ?? "", /AWS4-HMAC-SHA256/);
      assert.doesNotMatch(
        requests[0]?.headers.get("authorization") ?? "",
        /local-secret-key/,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("uploads objects with signed PUT requests and preserves content metadata", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "content-ops-s3-storage-"));
    const sourcePath = join(tempRoot, "outputs", "clip-1.mp4");
    const requests: Array<{ request: Request; body: string }> = [];
    const fetcher: typeof fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push({
        request,
        body: Buffer.from(await request.arrayBuffer()).toString("utf8"),
      });
      return new Response("", { status: 200 });
    };
    const storage = new S3CompatibleRenderStorage({
      ...S3_CONFIG,
      fetch: fetcher,
      now: FIXED_NOW,
    });

    try {
      await mkdir(dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, "fixture mp4 bytes", "utf8");

      const result = await storage.uploadObject({
        key: OUTPUT_KEY,
        sourcePath,
        contentType: "Video/MP4",
      });

      assert.deepEqual(result, {
        key: OUTPUT_KEY,
        contentType: "Video/MP4",
        sizeBytes: Buffer.byteLength("fixture mp4 bytes"),
      });
      assert.equal(requests.length, 1);
      assert.equal(requests[0]?.request.method, "PUT");
      assert.equal(requests[0]?.body, "fixture mp4 bytes");
      assert.equal(requests[0]?.request.headers.get("content-type"), "video/mp4");
      assert.equal(
        requests[0]?.request.headers.get("x-amz-content-sha256"),
        sha256Hex("fixture mp4 bytes"),
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects unsafe object keys before making S3 requests", async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error("fetch should not be called for unsafe keys");
    };
    const storage = new S3CompatibleRenderStorage({
      ...S3_CONFIG,
      fetch: fetcher,
      now: FIXED_NOW,
    });

    await assert.rejects(
      storage.downloadObject({
        key: "../outside.mov",
        destinationPath: "/tmp/outside.mov",
      }),
      /storage object key is not safe/,
    );
  });
});

const SOURCE_KEY = "workspaces/workspace_123/projects/project_456/uploads/asset_abc/source.mov";
const OUTPUT_KEY = "workspaces/workspace_123/projects/project_456/renders/asset_abc/clip-1.mp4";
const FIXED_NOW = () => new Date("2026-05-25T08:00:00.000Z");
const S3_CONFIG = {
  bucket: "content-ops-dev",
  region: "auto",
  endpoint: "https://account.r2.cloudflarestorage.com",
  accessKeyId: "local-access-key",
  secretAccessKey: "local-secret-key",
  forcePathStyle: true,
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
