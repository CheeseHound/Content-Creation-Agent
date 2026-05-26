import { createHash, createHmac } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import { WorkerValidationError } from "./payload";

export interface DownloadObjectRequest {
  key: string;
  destinationPath: string;
}

export interface DownloadedObject {
  key: string;
  localPath: string;
  sizeBytes: number;
}

export interface UploadObjectRequest {
  key: string;
  sourcePath: string;
  contentType: string;
}

export interface UploadedObject {
  key: string;
  contentType: string;
  sizeBytes: number;
}

export interface RenderStorageClient {
  downloadObject(request: DownloadObjectRequest): Promise<DownloadedObject>;
  uploadObject(request: UploadObjectRequest): Promise<UploadedObject>;
}

export interface S3CompatibleRenderStorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  now?: () => Date;
  fetch?: typeof fetch;
}

export class LocalFilesystemRenderStorage implements RenderStorageClient {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async downloadObject(request: DownloadObjectRequest): Promise<DownloadedObject> {
    const sourcePath = storageObjectPath(this.root, request.key);
    const destinationPath = resolve(request.destinationPath);

    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    const fileStat = await stat(destinationPath);

    return {
      key: request.key,
      localPath: destinationPath,
      sizeBytes: fileStat.size,
    };
  }

  async uploadObject(request: UploadObjectRequest): Promise<UploadedObject> {
    const destinationPath = storageObjectPath(this.root, request.key);

    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(request.sourcePath, destinationPath);
    const fileStat = await stat(destinationPath);

    return {
      key: request.key,
      contentType: request.contentType,
      sizeBytes: fileStat.size,
    };
  }
}

export class S3CompatibleRenderStorage implements RenderStorageClient {
  private readonly config: S3CompatibleRenderStorageConfig;
  private readonly fetcher: typeof fetch;

  constructor(config: S3CompatibleRenderStorageConfig) {
    this.config = config;
    this.fetcher = config.fetch ?? fetch;
  }

  async downloadObject(request: DownloadObjectRequest): Promise<DownloadedObject> {
    validateStorageObjectKey(request.key);

    const destinationPath = resolve(request.destinationPath);
    const response = await this.fetcher(this.buildSignedRequest({
      method: "GET",
      key: request.key,
      payload: Buffer.alloc(0),
    }));

    if (!response.ok) {
      throw new Error(`worker storage download failed with status ${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    await mkdir(dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, bytes);

    return {
      key: request.key,
      localPath: destinationPath,
      sizeBytes: bytes.length,
    };
  }

  async uploadObject(request: UploadObjectRequest): Promise<UploadedObject> {
    validateStorageObjectKey(request.key);

    const payload = await readFile(request.sourcePath);
    const response = await this.fetcher(this.buildSignedRequest({
      method: "PUT",
      key: request.key,
      payload,
      contentType: request.contentType,
    }));

    if (!response.ok) {
      throw new Error(`worker storage upload failed with status ${response.status}`);
    }

    return {
      key: request.key,
      contentType: request.contentType,
      sizeBytes: payload.length,
    };
  }

  private buildSignedRequest({
    method,
    key,
    payload,
    contentType,
  }: {
    method: "GET" | "PUT";
    key: string;
    payload: Buffer;
    contentType?: string;
  }): Request {
    const now = this.config.now?.() ?? new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const endpoint = resolveEndpoint(this.config, key);
    const payloadHash = sha256Hex(payload);
    const headers: Record<string, string> = {
      host: endpoint.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...(contentType ? { "content-type": contentType.trim().toLowerCase() } : {}),
    };
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.entries(headers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}:${normalizeHeaderValue(value)}\n`)
      .join("");
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const canonicalRequest = [
      method,
      endpoint.canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const signingKey = deriveSigningKey(
      this.config.secretAccessKey,
      dateStamp,
      this.config.region,
    );
    const signature = hmacHex(signingKey, stringToSign);
    const requestHeaders = new Headers({
      authorization: [
        "AWS4-HMAC-SHA256",
        `Credential=${this.config.accessKeyId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
      ].join(", "),
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...(contentType ? { "content-type": contentType.trim().toLowerCase() } : {}),
    });

    return new Request(`${endpoint.origin}${endpoint.canonicalUri}`, {
      method,
      headers: requestHeaders,
      body: method === "PUT" ? new Uint8Array(payload) : undefined,
    });
  }
}

function storageObjectPath(root: string, key: string): string {
  validateStorageObjectKey(key);
  return assertStoragePathInside(root, join(root, ...key.split("/")));
}

function validateStorageObjectKey(key: string): void {
  if (
    key.length === 0 ||
    key.startsWith("/") ||
    key.endsWith("/") ||
    key.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new WorkerValidationError(
      "storage object key is not safe for local worker storage",
      "render workspace validation failed",
    );
  }
}

function assertStoragePathInside(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const relativePath = relative(resolvedRoot, resolvedCandidate);

  if (relativePath === "" || relativePath.startsWith("..") || relativePath.includes("..")) {
    throw new WorkerValidationError(
      "local storage path escaped the configured storage root",
      "render workspace validation failed",
    );
  }

  return resolvedCandidate;
}

function resolveEndpoint(
  config: S3CompatibleRenderStorageConfig,
  key: string,
): { origin: string; host: string; canonicalUri: string } {
  const baseUrl = new URL(config.endpoint ?? `https://s3.${config.region}.amazonaws.com`);
  const forcePathStyle = config.forcePathStyle ?? Boolean(config.endpoint);
  const host = forcePathStyle ? baseUrl.host : `${config.bucket}.${baseUrl.host}`;
  const origin = `${baseUrl.protocol}//${host}`;
  const basePath = normalizePathPrefix(baseUrl.pathname);
  const encodedKey = encodePath(key);
  const canonicalUri = forcePathStyle
    ? joinUri(basePath, awsEncode(config.bucket), encodedKey)
    : joinUri(basePath, encodedKey);

  return {
    origin,
    host,
    canonicalUri,
  };
}

function deriveSigningKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacBuffer(dateKey, region);
  const serviceKey = hmacBuffer(regionKey, "s3");
  return hmacBuffer(serviceKey, "aws4_request");
}

function hmacBuffer(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: string | Buffer, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function formatAmzDate(value: Date): string {
  return value.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function normalizePathPrefix(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "";
  }

  return `/${pathname.replace(/^\/+|\/+$/g, "").split("/").map(awsEncode).join("/")}`;
}

function encodePath(pathname: string): string {
  return pathname.split("/").map(awsEncode).join("/");
}

function joinUri(...segments: string[]): string {
  const joined = segments
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .join("/");

  return `/${joined}`;
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
