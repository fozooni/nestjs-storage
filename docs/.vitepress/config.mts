import { defineConfig } from 'vitepress';

export default defineConfig({
  title: '@fozooni/nestjs-storage',
  description:
    'Unified NestJS storage abstraction across 9 cloud drivers with composable decorator disks',
  base: '/nestjs-storage/',

  head: [
    ['link', { rel: 'icon', href: '/nestjs-storage/favicon.svg' }],
    ['meta', { property: 'og:title', content: '@fozooni/nestjs-storage' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Unified NestJS storage with 9 cloud drivers and 10 composable decorators',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'theme-color', content: '#e0234e' }],
  ],

  lastUpdated: true,
  cleanUrls: true,

  themeConfig: {
    siteTitle: 'NestJS Storage',

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/fozooni/nestjs-storage/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      { text: 'Drivers', link: '/drivers/', activeMatch: '/drivers/' },
      { text: 'Decorators', link: '/decorators/', activeMatch: '/decorators/' },
      {
        text: 'More',
        items: [
          { text: 'Services', link: '/services/' },
          { text: 'Advanced', link: '/advanced/' },
          { text: 'API Reference', link: '/api/' },
        ],
      },
      {
        text: 'v0.1.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/fozooni/nestjs-storage/releases' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@fozooni/nestjs-storage' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Configuration', link: '/guide/configuration' },
          ],
        },
        {
          text: 'Essentials',
          items: [
            { text: 'Core Operations', link: '/guide/core-operations' },
            { text: 'File Uploads', link: '/guide/file-uploads' },
            { text: 'URLs & Downloads', link: '/guide/urls-and-downloads' },
            { text: 'Naming Strategies', link: '/guide/naming-strategies' },
          ],
        },
        {
          text: 'Patterns',
          items: [
            { text: 'Error Handling', link: '/guide/error-handling' },
            { text: 'Testing', link: '/guide/testing' },
            { text: 'LLM Documentation', link: '/guide/llm-docs' },
          ],
        },
      ],

      '/drivers/': [
        {
          text: 'Storage Drivers',
          items: [
            { text: 'Overview', link: '/drivers/' },
            { text: 'Local Filesystem', link: '/drivers/local' },
            { text: 'Amazon S3', link: '/drivers/s3' },
            { text: 'Cloudflare R2', link: '/drivers/r2' },
            { text: 'Google Cloud Storage', link: '/drivers/gcs' },
            { text: 'Azure Blob Storage', link: '/drivers/azure' },
            { text: 'MinIO', link: '/drivers/minio' },
            { text: 'Backblaze B2', link: '/drivers/b2' },
            { text: 'DigitalOcean Spaces', link: '/drivers/digitalocean' },
            { text: 'Wasabi', link: '/drivers/wasabi' },
          ],
        },
        {
          text: 'Extensibility',
          items: [{ text: 'Custom Drivers', link: '/drivers/custom-drivers' }],
        },
      ],

      '/decorators/': [
        {
          text: 'Decorator Disks',
          items: [
            { text: 'Overview', link: '/decorators/' },
            { text: 'ScopedDisk', link: '/decorators/scoped-disk' },
            { text: 'EncryptedDisk', link: '/decorators/encrypted-disk' },
            { text: 'CachedDisk', link: '/decorators/cached-disk' },
            { text: 'RetryDisk', link: '/decorators/retry-disk' },
            { text: 'ReplicatedDisk', link: '/decorators/replicated-disk' },
            { text: 'QuotaDisk', link: '/decorators/quota-disk' },
            { text: 'CdnDisk', link: '/decorators/cdn-disk' },
            { text: 'OtelDisk', link: '/decorators/otel-disk' },
            { text: 'VersionedDisk', link: '/decorators/versioned-disk' },
            { text: 'RouterDisk', link: '/decorators/router-disk' },
          ],
        },
      ],

      '/services/': [
        {
          text: 'Services',
          items: [
            { text: 'Overview', link: '/services/' },
            { text: 'StorageService', link: '/services/storage-service' },
            { text: 'Events Service', link: '/services/events-service' },
            { text: 'Storage Migrator', link: '/services/migrator' },
            { text: 'Upload Progress', link: '/services/upload-progress' },
            { text: 'Archiver', link: '/services/archiver' },
            { text: 'Audit Service', link: '/services/audit-service' },
            { text: 'Temp Cleanup', link: '/services/temp-cleanup' },
          ],
        },
      ],

      '/advanced/': [
        {
          text: 'Advanced Topics',
          items: [
            { text: 'Overview', link: '/advanced/' },
            { text: 'Range Requests', link: '/advanced/range-requests' },
            { text: 'Conditional Writes', link: '/advanced/conditional-writes' },
            { text: 'Presigned POST', link: '/advanced/presigned-post' },
            { text: 'Multipart Uploads', link: '/advanced/multipart-uploads' },
            { text: 'Health Checks', link: '/advanced/health-checks' },
            { text: 'Interceptors & Pipes', link: '/advanced/interceptors-pipes' },
            { text: 'Middleware', link: '/advanced/middleware' },
            { text: 'Decorators & DI', link: '/advanced/decorators-di' },
            { text: 'Config Validation', link: '/advanced/config-validation' },
            { text: 'Utilities', link: '/advanced/utilities' },
            { text: 'Composing Decorators', link: '/advanced/composing-decorators' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'FilesystemContract', link: '/api/filesystem-contract' },
            { text: 'Interfaces', link: '/api/interfaces' },
            { text: 'Types & Constants', link: '/api/types' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/fozooni/nestjs-storage' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2024-present Ahmad Fozooni',
    },
  },
});
