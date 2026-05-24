import { createHmac, createHash } from "node:crypto";

import type { DownloadSigner, DownloadSignerRequest, DownloadTarget } from "../render-jobs/types";
import type { UploadSigner, UploadSignerRequest, UploadTarget } from "../uploads/types";

export interface S3UploadSignerConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  now?: () => Date;
}

export function createS3UploadSigner(config: S3UploadSignerConfig): UploadSigner & DownloadSigner {
  return {
    async presignUpload(request: UploadSignerRequest): Promise<UploadTarget> {
      const now = config.now?.() ?? new Date();
      const expiresIn = secondsUntil(request.expiresAt, now);
      const contentType = request.contentType.trim().toLowerCase();
      const url = presignObjectUrl({
        config,
        method: "PUT",
        key: request.key,
        signedHeaders: "content-type;host",
        canonicalHeaders: [
          `content-type:${contentType}`,
          "host:{host}",
          "",
        ],
        queryOverrides: {},
        expiresIn,
        now,
      });

      return {
        method: "PUT",
        url,
        headers: {
          "content-type": contentType,
        },
        expiresAt: request.expiresAt.toISOString(),
      };
    },
    async presignDownload(request: DownloadSignerRequest): Promise<DownloadTarget> {
      const now = config.now?.() ?? new Date();
      const expiresIn = secondsUntil(request.expiresAt, now);
      const url = presignObjectUrl({
        config,
        method: "GET",
        key: request.key,
        signedHeaders: "host",
        canonicalHeaders: [
          "host:{host}",
          "",
        ],
        queryOverrides: {
          "response-content-disposition": request.responseContentDisposition,
          "response-content-type": request.responseContentType,
        },
        expiresIn,
        now,
      });

      return {
        method: "GET",
        url,
        headers: {},
        expiresAt: request.expiresAt.toISOString(),
      };
    },
  };
}

function presignObjectUrl({
  config,
  method,
  key,
  signedHeaders,
  canonicalHeaders,
  queryOverrides,
  expiresIn,
  now,
}: {
  config: S3UploadSignerConfig;
  method: "GET" | "PUT";
  key: string;
  signedHeaders: string;
  canonicalHeaders: readonly string[];
  queryOverrides: Record<string, string>;
  expiresIn: number;
  now: Date;
}): string {
  const endpoint = resolveEndpoint(config, key);
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const queryParameters: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
    ...queryOverrides,
  };
  const canonicalQuery = canonicalQueryString(queryParameters);
  const renderedCanonicalHeaders = canonicalHeaders
    .map((header) => header.replace("{host}", endpoint.host))
    .join("\n");
  const canonicalRequest = [
    method,
    endpoint.canonicalUri,
    canonicalQuery,
    renderedCanonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = deriveSigningKey(config.secretAccessKey, dateStamp, config.region);
  const signature = hmacHex(signingKey, stringToSign);

  return `${endpoint.origin}${endpoint.canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function resolveEndpoint(
  config: S3UploadSignerConfig,
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

function secondsUntil(expiresAt: Date, now: Date): number {
  return Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

function canonicalQueryString(parameters: Record<string, string>): string {
  return Object.entries(parameters)
    .map(([name, value]) => [awsEncode(name), awsEncode(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) => {
      const nameComparison = leftName.localeCompare(rightName);
      return nameComparison === 0 ? leftValue.localeCompare(rightValue) : nameComparison;
    })
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
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

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
