import { Box, Center, Text } from '@mantine/core';
import { Post } from '../api';
import { t } from '../i18n';

/** Post image/video in its Instagram aspect (4:5 for images, 9:16 for Reels). */
export function Media({ post, maxH }: { post: Post; maxH?: number }) {
  const ratio = post.kind === 'VIDEO' ? '9 / 16' : '4 / 5';
  return (
    <Box className="media-box" style={{ aspectRatio: ratio, maxHeight: maxH, marginInline: 'auto' }}>
      {!post.mediaUrl ? (
        <Center h="100%"><Text size="xs" c="dimmed">{post.status === 'published' ? t('post.published') : t('post.preparing')}</Text></Center>
      ) : post.kind === 'VIDEO' ? (
        <video src={post.mediaUrl} controls playsInline preload="metadata" muted />
      ) : (
        <img src={post.mediaUrl} alt="" loading="lazy" />
      )}
    </Box>
  );
}
