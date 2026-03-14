import crypto from 'crypto';
import path from 'path';

import { lookup } from 'mime-types';

/**
 * Generate a unique filename
 */
export function generateUniqueFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const name = path.basename(originalName, ext);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `${name}_${timestamp}_${randomString}${ext}`;
}

/**
 * Sanitize path for S3
 */
export function sanitizePath(filePath: string): string {
  // Remove leading slashes
  return filePath.replace(/^\/+/, '');
}

/**
 * Get content type from filename
 */
export function getContentType(filename: string): string {
  return lookup(filename) || 'application/octet-stream';
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const ext = path.extname(filename);
  return ext.startsWith('.') ? ext.substring(1) : ext;
}

/**
 * Normalize path separators
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Join paths
 */
export function joinPaths(...paths: string[]): string {
  return paths.filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\/+/, '');
}

/**
 * Get directory from path
 */
export function getDirectory(filePath: string): string {
  const normalized = normalizePath(filePath);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? '' : normalized.substring(0, lastSlash);
}

/**
 * Get filename from path
 */
export function getFilename(filePath: string): string {
  const normalized = normalizePath(filePath);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1);
}

/**
 * Check if path is directory (ends with /)
 */
export function isDirectory(path: string): boolean {
  return path.endsWith('/');
}

/**
 * Parse S3 URL to get bucket and key
 */
export function parseS3Url(url: string): { bucket: string; key: string } | null {
  // Handle s3:// URLs
  const s3Match = url.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (s3Match) {
    return { bucket: s3Match[1], key: s3Match[2] };
  }

  // Handle https:// virtual-hosted-style URLs
  const vhostMatch = url.match(/^https?:\/\/([^.]+)\.s3[^/]*\.amazonaws\.com\/(.+)$/);
  if (vhostMatch) {
    return { bucket: vhostMatch[1], key: vhostMatch[2] };
  }

  // Handle https:// path-style URLs
  const pathMatch = url.match(/^https?:\/\/s3[^/]*\.amazonaws\.com\/([^/]+)\/(.+)$/);
  if (pathMatch) {
    return { bucket: pathMatch[1], key: pathMatch[2] };
  }

  return null;
}

/**
 * Encode S3 key for use in URL
 * Encodes special characters while preserving path separators (/)
 */
export function encodeS3Key(key: string): string {
  // Split by '/', encode each segment, then rejoin
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Build S3 URL
 */
export function buildS3Url(bucket: string, key: string, region: string = 'us-east-1'): string {
  const encodedKey = encodeS3Key(key);
  if (region === 'us-east-1') {
    return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

/**
 * Convert stream to buffer
 */
export async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err: Error) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Convert stream to string
 */
export async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const buffer = await streamToBuffer(stream);
  return buffer.toString('utf-8');
}

/**
 * Check if value is a stream
 */
export function isStream(value: any): value is NodeJS.ReadableStream {
  return value !== null && typeof value === 'object' && typeof value.pipe === 'function';
}

/**
 * Format file size to human readable
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Convert visibility to S3 ACL
 */
export function visibilityToAcl(visibility?: 'private' | 'public'): string {
  return visibility === 'public' ? 'public-read' : 'private';
}

/**
 * Convert S3 ACL to visibility
 */
export function aclToVisibility(acl?: string): 'private' | 'public' {
  return acl === 'public-read' ? 'public' : 'private';
}
