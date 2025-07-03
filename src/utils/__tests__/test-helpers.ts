import type {
  MigrationAudioBlock,
  MigrationImageBlock,
  MigrationVideoBlock,
  MigrationTextBlock,
} from '@/types/migration'

// Helper functions to create test migration blocks with proper types

export function createTestAudioBlock(
  overrides: Partial<MigrationAudioBlock> = {},
): MigrationAudioBlock {
  return {
    _type: 'audio',
    _key: overrides._key || 'test-audio-key',
    url: overrides.url || 'http://example.com/test.mp3',
    audioFile: {
      _type: 'file',
    },
    showControls: overrides.showControls ?? true,
    autoplay: overrides.autoplay ?? false,
    ...overrides,
  }
}

export function createTestImageBlock(
  overrides: Partial<MigrationImageBlock> = {},
): MigrationImageBlock {
  return {
    _type: 'image',
    _key: overrides._key || 'test-image-key',
    url: overrides.url || 'http://example.com/test.jpg',
    alt: overrides.alt || '',
    ...overrides,
  }
}

export function createTestVideoBlock(
  overrides: Partial<MigrationVideoBlock> = {},
): MigrationVideoBlock {
  return {
    _type: 'video',
    _key: overrides._key || 'test-video-key',
    videoType: overrides.videoType || 'url',
    url: overrides.url || 'http://example.com/test.mp4',
    ...overrides,
  }
}

export function createTestTextBlock(
  overrides: Partial<MigrationTextBlock> = {},
): MigrationTextBlock {
  return {
    _type: 'block',
    _key: overrides._key || 'test-text-key',
    style: overrides.style || 'normal',
    children: overrides.children || [
      {
        _type: 'span',
        _key: 'test-span-key',
        text: 'Test text',
      },
    ],
    markDefs: overrides.markDefs || [],
    ...overrides,
  }
}
