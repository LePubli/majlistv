// Adresses de liste (playlist, chaîne…) reconnues à part des vidéos seules.
import assert from 'node:assert/strict';
import { isListUrl } from '../lib/listUrl.js';
for (const u of ['https://www.youtube.com/playlist?list=PLDoK5CcjJZA6JIO4oRpfJwz1', 'https://www.youtube.com/@Kidislam', 'https://www.youtube.com/@Kidislam/videos', 'https://www.youtube.com/channel/UCabc123',
  'https://www.youtube.com/show/VLPLabc', 'https://vimeo.com/album/123456', 'https://vimeo.com/showcase/987', 'https://vimeo.com/moncompte', 'https://www.dailymotion.com/moncompte', 'https://www.dailymotion.com/playlist/x7abc',
  'https://archive.org/details/@fer3865', 'https://archive.org/search?query=omar']) assert.ok(isListUrl(u), `liste attendue : ${u}`);
for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc1234567890', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  'https://vimeo.com/123456789', 'https://www.dailymotion.com/video/x8abc12', 'https://archive.org/details/01UmarFaruqHd', 'https://example.org/a.mp4', 'pas une adresse', '']) assert.ok(!isListUrl(u), `vidéo / autre attendue : ${u}`);
console.log('OK : test_list_url');
