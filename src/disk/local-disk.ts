import { createHash, randomUUID } from 'crypto';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import {
  ChecksumAlgorithm,
  CopyOptions,
  DeleteManyResult,
  DiskConfig,
  FileMetadata,
  FilesystemContract,
  GetOptions,
  MoveOptions,
  MultipartUploadInit,
  MultipartUploadOptions,
  MultipartUploadPart,
  PutOptions,
  TemporaryUrlOptions,
} from '../interfaces/storage.interface';
import {
  encodeS3Key,
  getContentType,
  getFilename,
  isStream,
  joinPaths,
  normalizePath,
} from '../utils/storage.utils';

export class LocalDisk implements FilesystemContract {
  private root: string;
  private config: DiskConfig;

  constructor(config: DiskConfig) {
    if (!config.root) {
      throw new Error('Local disk root path is required');
    }

    this.config = config;
    this.root = resolve(config.root);

    // Ensure root directory exists
    this.ensureDirectory(this.root).catch(() => {});
  }

  private resolvePath(path: string): string {
    const normalizedPath = normalizePath(path);
    const resolvedPath = resolve(this.root, normalizedPath);

    // Ensure path is within root
    if (!resolvedPath.startsWith(this.root)) {
      throw new Error('Path traversal detected');
    }

    return resolvedPath;
  }

  private async ensureDirectory(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }

  async exists(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async get(path: string, options?: GetOptions): Promise<Buffer | NodeJS.ReadableStream | string> {
    const fullPath = this.resolvePath(path);
    const responseType = options?.responseType || 'buffer';

    if (responseType === 'stream') {
      return createReadStream(fullPath);
    } else if (responseType === 'string') {
      return await fs.readFile(fullPath, 'utf-8');
    } else {
      return await fs.readFile(fullPath);
    }
  }

  async put(
    path: string,
    contents: string | Buffer | NodeJS.ReadableStream,
    options?: PutOptions,
  ): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      const directory = dirname(fullPath);

      await this.ensureDirectory(directory);

      if (isStream(contents)) {
        const writeStream = createWriteStream(fullPath);
        await pipeline(contents as Readable, writeStream);
      } else {
        await fs.writeFile(fullPath, contents);
      }

      // Set permissions based on visibility
      if (options?.visibility === 'public') {
        await fs.chmod(fullPath, 0o644);
      } else {
        await fs.chmod(fullPath, 0o600);
      }

      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async putFile(path: string, file: any, options?: PutOptions): Promise<string | false> {
    let contents: Buffer | NodeJS.ReadableStream;
    let filename: string;

    if (file.buffer) {
      // Express multer file
      contents = file.buffer;
      filename = file.originalname || file.filename;
    } else if (file.path) {
      // File path
      contents = createReadStream(file.path);
      filename = getFilename(file.path);
    } else if (isStream(file)) {
      contents = file;
      filename = 'upload';
    } else {
      contents = Buffer.from(file);
      filename = 'upload';
    }

    const fullPath = joinPaths(path, filename);
    const success = await this.put(fullPath, contents, options);

    return success ? fullPath : false;
  }

  async putFileAs(
    path: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    file: any,
    name: string,
    options?: PutOptions,
  ): Promise<string | false> {
    let contents: Buffer | NodeJS.ReadableStream;

    if (Buffer.isBuffer(file)) {
      contents = file;
    } else if (file.buffer) {
      contents = file.buffer;
    } else if (file.path) {
      contents = createReadStream(file.path);
    } else if (isStream(file)) {
      contents = file;
    } else if (file instanceof ArrayBuffer) {
      contents = Buffer.from(file);
    } else {
      contents = Buffer.from(file);
    }

    const fullPath = joinPaths(path, name);
    const success = await this.put(fullPath, contents, options);

    return success ? fullPath : false;
  }

  async delete(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      await fs.unlink(fullPath);
      return true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return true; // File already doesn't exist
      }
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async copy(from: string, to: string, options?: CopyOptions): Promise<boolean> {
    try {
      const sourcePath = this.resolvePath(from);
      const destinationPath = this.resolvePath(to);
      const destinationDir = dirname(destinationPath);

      await this.ensureDirectory(destinationDir);
      await fs.copyFile(sourcePath, destinationPath);

      // Set permissions based on visibility
      if (options?.visibility === 'public') {
        await fs.chmod(destinationPath, 0o644);
      }

      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async move(from: string, to: string, options?: MoveOptions): Promise<boolean> {
    try {
      const sourcePath = this.resolvePath(from);
      const destinationPath = this.resolvePath(to);
      const destinationDir = dirname(destinationPath);

      await this.ensureDirectory(destinationDir);
      await fs.rename(sourcePath, destinationPath);

      // Set permissions based on visibility
      if (options?.visibility === 'public') {
        await fs.chmod(destinationPath, 0o644);
      }

      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async size(path: string): Promise<number> {
    const fullPath = this.resolvePath(path);
    const stats = await fs.stat(fullPath);
    return stats.size;
  }

  async lastModified(path: string): Promise<number> {
    const fullPath = this.resolvePath(path);
    const stats = await fs.stat(fullPath);
    return stats.mtime.getTime();
  }

  async files(directory?: string, recursive?: boolean): Promise<string[]> {
    const dir = directory || '';
    const fullPath = this.resolvePath(dir);

    const files: string[] = [];

    async function readDir(path: string, base: string): Promise<void> {
      const entries = await fs.readdir(path, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(path, entry.name);
        const relativePath = relative(base, entryPath);

        if (entry.isFile()) {
          files.push(normalizePath(relativePath));
        } else if (entry.isDirectory() && recursive) {
          await readDir(entryPath, base);
        }
      }
    }

    await readDir(fullPath, this.root);
    return files;
  }

  async allFiles(directory?: string): Promise<string[]> {
    return this.files(directory, true);
  }

  async directories(directory?: string, recursive?: boolean): Promise<string[]> {
    const dir = directory || '';
    const fullPath = this.resolvePath(dir);

    const directories: string[] = [];

    async function readDir(path: string, base: string): Promise<void> {
      const entries = await fs.readdir(path, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const entryPath = join(path, entry.name);
          const relativePath = relative(base, entryPath);
          directories.push(normalizePath(relativePath) + '/');

          if (recursive) {
            await readDir(entryPath, base);
          }
        }
      }
    }

    await readDir(fullPath, this.root);
    return directories;
  }

  async allDirectories(directory?: string): Promise<string[]> {
    return this.directories(directory, true);
  }

  async makeDirectory(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      await this.ensureDirectory(fullPath);
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async deleteDirectory(directory: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(directory);
      await fs.rm(fullPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async getVisibility(path: string): Promise<'private' | 'public'> {
    const fullPath = this.resolvePath(path);
    const stats = await fs.stat(fullPath);
    const mode = stats.mode & 0o777;

    // Check if others have read permission
    return mode & 0o004 ? 'public' : 'private';
  }

  async setVisibility(path: string, visibility: 'private' | 'public'): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      const mode = visibility === 'public' ? 0o644 : 0o600;
      await fs.chmod(fullPath, mode);
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  url(path: string): string {
    // For local disk, return relative path
    // In production, this might be served by a web server
    // Encode path segments to handle spaces and special characters
    return '/' + encodeS3Key(normalizePath(path));
  }

  async temporaryUrl(
    path: string,
    _expiration: Date | number,
    _options?: TemporaryUrlOptions,
  ): Promise<string> {
    // Local disk doesn't support signed URLs
    // Return regular URL with a warning
    console.warn('Local disk does not support temporary URLs');
    return this.url(path);
  }

  async prepend(path: string, data: string): Promise<boolean> {
    try {
      const existing = (await this.get(path, {
        responseType: 'string',
      })) as string;
      return await this.put(path, data + existing);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create it
        return await this.put(path, data);
      }
      throw error;
    }
  }

  async append(path: string, data: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      await fs.appendFile(fullPath, data);
      return true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create it
        return await this.put(path, data);
      }
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async getMetadata(path: string): Promise<FileMetadata> {
    const fullPath = this.resolvePath(path);
    const stats = await fs.stat(fullPath);

    return {
      path: normalizePath(path),
      size: stats.size,
      lastModified: stats.mtime,
      type: stats.isDirectory() ? 'directory' : 'file',
      mimetype: getContentType(path),
      visibility: await this.getVisibility(path),
    };
  }

  async mimeType(path: string): Promise<string> {
    return getContentType(path);
  }

  async directorySize(directory?: string): Promise<number> {
    const dir = directory || '';
    const fullPath = this.resolvePath(dir);
    let totalSize = 0;

    async function calculateSize(path: string): Promise<void> {
      const entries = await fs.readdir(path, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(path, entry.name);

        if (entry.isFile()) {
          const stats = await fs.stat(entryPath);
          totalSize += stats.size;
        } else if (entry.isDirectory()) {
          await calculateSize(entryPath);
        }
      }
    }

    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await calculateSize(fullPath);
      } else {
        totalSize = stats.size;
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return 0;
      }
      throw error;
    }

    return totalSize;
  }

  /**
   * Get the bucket name (not applicable for local disk)
   */
  getBucket(): string | undefined {
    return undefined;
  }

  async missing(path: string): Promise<boolean> {
    return !(await this.exists(path));
  }

  async json<T = unknown>(path: string): Promise<T> {
    const content = await this.get(path, { responseType: 'string' });
    return JSON.parse(content as string);
  }

  async checksum(path: string, algorithm: ChecksumAlgorithm = 'md5'): Promise<string> {
    const fullPath = this.resolvePath(path);
    const hash = createHash(algorithm);
    const stream = createReadStream(fullPath);

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async deleteMany(paths: string[]): Promise<DeleteManyResult> {
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const filePath of paths) {
      try {
        const result = await this.delete(filePath);
        if (result) {
          succeeded.push(filePath);
        } else {
          failed.push(filePath);
        }
      } catch {
        failed.push(filePath);
      }
    }

    return { succeeded, failed };
  }

  // Multipart upload support via temp directory concatenation
  async initMultipartUpload(
    path: string,
    _options?: MultipartUploadOptions,
  ): Promise<MultipartUploadInit> {
    const uploadId = randomUUID();
    const uploadDir = resolve(this.root, '.multipart-uploads', uploadId);

    await this.ensureDirectory(uploadDir);

    const metaPath = join(uploadDir, '.meta.json');
    await fs.writeFile(metaPath, JSON.stringify({ targetPath: path, startedAt: Date.now() }));

    return {
      uploadId,
      key: path,
    };
  }

  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer | Uint8Array | NodeJS.ReadableStream,
    _path: string,
  ): Promise<MultipartUploadPart> {
    const uploadDir = resolve(this.root, '.multipart-uploads', uploadId);
    const partFile = join(uploadDir, `part-${String(partNumber).padStart(6, '0')}`);

    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data);
    } else {
      // Stream: pipe to file then read stats
      const writeStream = createWriteStream(partFile);
      await pipeline(data as Readable, writeStream);

      const stats = await fs.stat(partFile);
      const fileBuffer = await fs.readFile(partFile);
      const etag = createHash('md5').update(fileBuffer).digest('hex');

      return {
        partNumber,
        etag,
        size: stats.size,
      };
    }

    await fs.writeFile(partFile, buffer);

    const etag = createHash('md5').update(buffer).digest('hex');

    return {
      partNumber,
      etag,
      size: buffer.length,
    };
  }

  async completeMultipartUpload(
    uploadId: string,
    path: string,
    parts: MultipartUploadPart[],
  ): Promise<boolean> {
    try {
      const uploadDir = resolve(this.root, '.multipart-uploads', uploadId);
      const targetPath = this.resolvePath(path);
      const targetDir = dirname(targetPath);

      await this.ensureDirectory(targetDir);

      const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
      const writeStream = createWriteStream(targetPath);

      for (const part of sortedParts) {
        const partFile = join(uploadDir, `part-${String(part.partNumber).padStart(6, '0')}`);
        const readStream = createReadStream(partFile);
        await pipeline(readStream, writeStream, { end: false });
      }

      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Clean up temp directory
      await fs.rm(uploadDir, { recursive: true, force: true });

      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async abortMultipartUpload(uploadId: string, _path: string): Promise<boolean> {
    try {
      const uploadDir = resolve(this.root, '.multipart-uploads', uploadId);
      await fs.rm(uploadDir, { recursive: true, force: true });
      return true;
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }

  async putFileMultipart(
    path: string,
    file: any,
    options?: MultipartUploadOptions,
  ): Promise<string | false> {
    try {
      let contents: Buffer;
      let filename: string;

      if (file.buffer) {
        contents = file.buffer;
        filename = file.originalname || file.filename;
      } else if (file.path) {
        contents = await fs.readFile(file.path);
        filename = getFilename(file.path);
      } else if (Buffer.isBuffer(file)) {
        contents = file;
        filename = 'upload';
      } else {
        contents = Buffer.from(file);
        filename = 'upload';
      }

      const fullPath = joinPaths(path, filename);

      const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
      const MIN_MULTIPART_SIZE = 10 * 1024 * 1024;

      let chunkSize = options?.chunkSize || MIN_CHUNK_SIZE;
      if (chunkSize < MIN_CHUNK_SIZE) {
        chunkSize = MIN_CHUNK_SIZE;
      }

      const totalSize = contents.length;

      if (totalSize < MIN_MULTIPART_SIZE || Math.ceil(totalSize / chunkSize) === 1) {
        return await this.putFileAs(path, file, filename, options);
      }

      const { uploadId } = await this.initMultipartUpload(fullPath, options);
      const parts: MultipartUploadPart[] = [];
      let uploadedBytes = 0;

      try {
        const totalParts = Math.ceil(totalSize / chunkSize);

        for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
          const start = (partNumber - 1) * chunkSize;
          const end = Math.min(start + chunkSize, totalSize);
          const chunk = contents.subarray(start, end);

          const part = await this.uploadPart(uploadId, partNumber, chunk, fullPath);
          parts.push(part);

          uploadedBytes += chunk.length;

          if (options?.onProgress) {
            options.onProgress(uploadedBytes, totalSize);
          }
        }

        const success = await this.completeMultipartUpload(uploadId, fullPath, parts);

        return success ? fullPath : false;
      } catch (error) {
        await this.abortMultipartUpload(uploadId, fullPath);
        throw error;
      }
    } catch (error) {
      if (this.config.throw !== false) {
        throw error;
      }
      return false;
    }
  }
}
